import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { supabaseService, BotConfigRow } from './supabase';
import { handleIncomingMessage } from './handler';

const logger = pino({ level: 'silent' });

export class WhatsAppManager {
  private sock: WASocket | null = null;
  private currentConfig: BotConfigRow | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private activePairingNumber: string | null = null;

  constructor() {
    this.ensureSessionDir();
  }

  private ensureSessionDir(): void {
    if (!fs.existsSync(config.sessionDataPath)) {
      fs.mkdirSync(config.sessionDataPath, { recursive: true });
    }
  }

  public updateConfig(newConfig: BotConfigRow | null): void {
    this.currentConfig = newConfig;
  }

  /**
   * Attache les écouteurs d'événements au socket Baileys
   */
  private setupSocketEvents(saveCreds: () => Promise<void>): void {
    if (!this.sock) return;

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. Présentation du QR code pour scan (uniquement si pas en mode code de jumelage)
      if (qr && !this.activePairingNumber) {
        console.log('[WhatsApp] Nouveau QR Code généré et prêt.');
        if (this.currentConfig) {
          await supabaseService.updateBotConfig(this.currentConfig.id, {
            whatsapp_status: 'qr_ready',
            qr_code: qr,
          });
          await supabaseService.logActivity(
            this.currentConfig.user_id,
            'info',
            'QR Code généré. Scannez-le depuis WhatsApp > Appareils connectés.'
          );
        }
      }

      // 2. Connexion établie avec succès
      if (connection === 'open') {
        console.log('[WhatsApp] Connexion WhatsApp établie avec succès !');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.activePairingNumber = null;

        const userJid = this.sock?.user?.id || '';
        if (this.currentConfig) {
          await supabaseService.updateBotConfig(this.currentConfig.id, {
            whatsapp_status: 'connected',
            qr_code: null,
            whatsapp_user_jid: userJid,
          });
          await supabaseService.logActivity(
            this.currentConfig.user_id,
            'success',
            'WhatsApp connecté avec succès ! Le bot HUMM est prêt.'
          );
        }
      }

      // 3. Déconnexion ou perte temporaire
      if (connection === 'close') {
        this.isConnecting = false;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.warn(`[WhatsApp] Connexion fermée (statut : ${statusCode}). Reconnexion autorisée : ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          await this.clearSession();
          this.activePairingNumber = null;
          if (this.currentConfig) {
            await supabaseService.updateBotConfig(this.currentConfig.id, {
              whatsapp_status: 'disconnected',
              qr_code: null,
              whatsapp_user_jid: null,
            });
            await supabaseService.logActivity(
              this.currentConfig.user_id,
              'warn',
              'Session WhatsApp déconnectée.'
            );
          }
        } else {
          if (this.currentConfig) {
            await supabaseService.updateBotConfig(this.currentConfig.id, {
              whatsapp_status: 'connecting',
            });
          }

          if (this.currentConfig?.bot_status === 'running') {
            this.scheduleReconnect();
          }
        }
      }
    });

    // Écoute des messages pour la commande unique .humm
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        await handleIncomingMessage(this.sock!, msg, this.currentConfig);
      }
    });
  }

  /**
   * Initialise et démarre la connexion WhatsApp (mode QR code)
   */
  public async start(): Promise<void> {
    if (this.isConnecting || (this.sock && this.sock.user)) {
      console.log('[WhatsApp] Connexion déjà active ou en cours.');
      return;
    }

    this.isConnecting = true;
    this.activePairingNumber = null;
    console.log('[WhatsApp] Démarrage du client Baileys...');

    try {
      this.ensureSessionDir();
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDataPath);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        browser: Browsers.macOS('Desktop'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false,
      });

      this.setupSocketEvents(saveCreds);

    } catch (err) {
      console.error('[WhatsApp] Exception au démarrage :', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Demande un code de jumelage WhatsApp (Pairing Code) à 8 caractères
   */
  public async requestPairing(phoneNumber: string): Promise<string> {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
      throw new Error('Numéro invalide. Fournissez l\'indicatif complet (ex: 224620000000 ou 33612345678)');
    }

    console.log(`[WhatsApp] Initialisation de la demande de jumelage pour +${cleanNumber}...`);

    // On coupe toute session existante non enregistrée pour générer un code propre
    await this.stop();
    await this.clearSession();

    this.isConnecting = true;
    this.activePairingNumber = cleanNumber;

    this.ensureSessionDir();
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDataPath);
    const { version } = await fetchLatestBaileysVersion();

    this.sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      browser: Browsers.macOS('Desktop'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    this.setupSocketEvents(saveCreds);

    // Attente brève que la connexion WebSocket préliminaire soit établie
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (!this.sock.authState.creds.registered) {
      try {
        const rawCode = await this.sock.requestPairingCode(cleanNumber);
        // Formate en blocs pour une lisibilité parfaite (ex: ABCD-1234)
        const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
        console.log(`[WhatsApp] Code de jumelage obtenu avec succès : ${formattedCode}`);

        if (this.currentConfig) {
          await supabaseService.updateBotConfig(this.currentConfig.id, {
            whatsapp_status: 'qr_ready',
            qr_code: `PAIRING:${formattedCode}`,
          });
          await supabaseService.logActivity(
            this.currentConfig.user_id,
            'info',
            `Code de jumelage généré : ${formattedCode}. Entrez ce code dans WhatsApp > Appareils connectés.`
          );
        }

        return formattedCode;
      } catch (err) {
        console.error('[WhatsApp] Échec requestPairingCode :', err);
        throw err;
      }
    } else {
      throw new Error('Ce compte est déjà enregistré et connecté.');
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WhatsApp] Nombre maximal de tentatives atteint.');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    console.log(`[WhatsApp] Tentative de reconnexion dans ${Math.round(delay / 1000)}s...`);

    this.reconnectTimeout = setTimeout(async () => {
      this.sock = null;
      await this.start();
    }, delay);
  }

  public async stop(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }

    this.isConnecting = false;
    this.activePairingNumber = null;
    console.log('[WhatsApp] Client WhatsApp arrêté.');
  }

  public async logout(): Promise<void> {
    try {
      if (this.sock) {
        await this.sock.logout();
      }
    } catch (err) {
      console.warn('[WhatsApp] Erreur logout Baileys :', err);
    }

    await this.stop();
    await this.clearSession();

    if (this.currentConfig) {
      await supabaseService.updateBotConfig(this.currentConfig.id, {
        whatsapp_status: 'disconnected',
        qr_code: null,
        whatsapp_user_jid: null,
      });
      await supabaseService.logActivity(
        this.currentConfig.user_id,
        'info',
        'Session réinitialisée.'
      );
    }
  }

  private async clearSession(): Promise<void> {
    try {
      if (fs.existsSync(config.sessionDataPath)) {
        const files = fs.readdirSync(config.sessionDataPath);
        for (const file of files) {
          fs.unlinkSync(path.join(config.sessionDataPath, file));
        }
      }
      console.log('[WhatsApp] Fichiers de session purgés.');
    } catch (err) {
      console.error('[WhatsApp] Erreur purge session :', err);
    }
  }

  public getStatus(): { isConnected: boolean; isConnecting: boolean } {
    return {
      isConnected: this.sock?.user !== undefined,
      isConnecting: this.isConnecting,
    };
  }
}

export const whatsAppManager = new WhatsAppManager();
