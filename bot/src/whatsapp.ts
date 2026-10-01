import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  proto,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from './config';
import { supabaseService, BotConfigRow } from './supabase';
import { handleIncomingMessage } from './handler';

const logger = pino({ level: 'silent' });

// Cache mémoire des messages (indispensable pour que le téléphone puisse déchiffrer les messages envoyés)
// Sans getMessage, WhatsApp affiche « En attente de ce message. Ceci pourrait prendre un moment. »
const messageCache = new Map<string, proto.IMessage>();

export function cacheMessage(id: string, message: proto.IMessage): void {
  if (messageCache.size > 2000) {
    const firstKey = messageCache.keys().next().value;
    if (firstKey) messageCache.delete(firstKey);
  }
  messageCache.set(id, message);
}

export class WhatsAppManager {
  private sock: WASocket | null = null;
  private currentConfig: BotConfigRow | null = null;
  private isConnecting: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private activePairingNumber: string | null = null;
  private lastQr: string | null = null;

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
   * Configuration et attachement des écouteurs d'événements
   */
  private setupSocketEvents(saveCreds: () => Promise<void>): void {
    if (!this.sock) return;

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // 1. Présentation du QR code si pas en mode code de jumelage
      if (qr && !this.activePairingNumber) {
        console.log('[WhatsApp] Nouveau QR Code généré et prêt.');
        this.lastQr = qr;
        this.isConnecting = false;
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

      // 2. Connexion établie
      if (connection === 'open') {
        console.log('[WhatsApp] Connexion WhatsApp établie avec succès !');
        this.isConnecting = false;
        this.lastQr = null;
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
            'WhatsApp connecté et synchronisé. Commande .humm active.'
          );
        }
      }

      // 3. Déconnexion ou coupure temporaire
      if (connection === 'close') {
        this.isConnecting = false;
        this.lastQr = null;
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.warn(`[WhatsApp] Connexion fermée (statut: ${statusCode}). Reconnexion: ${shouldReconnect}`);

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

    // Écoute des messages entrants
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        // Mise en cache immédiate pour répondre aux demandes de clés / retry du téléphone
        if (msg.key.id && msg.message) {
          cacheMessage(msg.key.id, msg.message);
        }

        await handleIncomingMessage(this.sock!, msg, this.currentConfig);
      }
    });
  }

  /**
   * Démarre une instance unique et propre du client WhatsApp
   */
  public async start(): Promise<void> {
    if (this.isConnecting || (this.sock && this.sock.user)) {
      console.log('[WhatsApp] Connexion déjà active ou en cours d\'établissement.');
      return;
    }

    // Destruction préventive de tout socket antérieur pour éviter les conflits de clés E2EE (Bad MAC)
    await this.cleanupPreviousSocket();

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
        browser: Browsers.ubuntu('Chrome'),
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        // Implémentation vitale de getMessage pour résoudre « En attente de ce message »
        getMessage: async (key) => {
          if (key.id && messageCache.has(key.id)) {
            return messageCache.get(key.id);
          }
          return undefined;
        },
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true, // Doit être true pour que le téléphone reçoive les clés E2EE
        defaultQueryTimeoutMs: undefined,
      });

      this.setupSocketEvents(saveCreds);

    } catch (err) {
      console.error('[WhatsApp] Exception au démarrage :', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Demande de code de jumelage WhatsApp (Pairing Code) à 8 caractères
   */
  public async requestPairing(phoneNumber: string): Promise<string> {
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 8) {
      throw new Error('Numéro invalide. Fournissez l\'indicatif complet (ex: 224620000000 ou 33612345678)');
    }

    console.log(`[WhatsApp] Demande de code de jumelage pour +${cleanNumber}...`);

    await this.cleanupPreviousSocket();
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
      browser: Browsers.ubuntu('Chrome'),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      getMessage: async (key) => {
        if (key.id && messageCache.has(key.id)) {
          return messageCache.get(key.id);
        }
        return undefined;
      },
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      defaultQueryTimeoutMs: undefined,
    });

    this.setupSocketEvents(saveCreds);

    // Attente brève de l'initialisation de la liaison WebSocket
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (!this.sock.authState.creds.registered) {
      try {
        const rawCode = await this.sock.requestPairingCode(cleanNumber);
        const formattedCode = rawCode?.match(/.{1,4}/g)?.join('-') || rawCode;
        console.log(`[WhatsApp] Code de jumelage obtenu : ${formattedCode}`);

        if (this.currentConfig) {
          await supabaseService.updateBotConfig(this.currentConfig.id, {
            whatsapp_status: 'qr_ready',
            qr_code: `PAIRING:${formattedCode}`,
          });
          await supabaseService.logActivity(
            this.currentConfig.user_id,
            'info',
            `Code de jumelage généré : ${formattedCode}. Entrez-le dans WhatsApp > Appareils connectés.`
          );
        }

        return formattedCode;
      } catch (err) {
        console.error('[WhatsApp] Échec requestPairingCode :', err);
        throw err;
      }
    } else {
      throw new Error('Ce compte est déjà enregistré.');
    }
  }

  private async cleanupPreviousSocket(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update');
        this.sock.ev.removeAllListeners('creds.update');
        this.sock.ev.removeAllListeners('messages.upsert');
        // @ts-ignore
        if (this.sock.ws) {
          // @ts-ignore
          this.sock.ws.terminate?.();
          // @ts-ignore
          this.sock.ws.close?.();
        }
        this.sock.end(undefined);
      } catch {}
      this.sock = null;
    }
    this.isConnecting = false;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WhatsApp] Nombre maximal de tentatives atteint.');
      return;
    }

    // En attente de scan QR, reconnexion rapide (2s) pour ne pas laisser un QR périmé à l'écran
    const isUnregistered = !this.sock?.user;
    const delay = isUnregistered ? 2000 : Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 20000);
    console.log(`[WhatsApp] Reconnexion dans ${Math.round(delay / 1000)}s...`);

    this.reconnectTimeout = setTimeout(async () => {
      await this.cleanupPreviousSocket();
      await this.start();
    }, delay);
  }

  public async stop(): Promise<void> {
    await this.cleanupPreviousSocket();
    this.activePairingNumber = null;
    console.log('[WhatsApp] Client WhatsApp arrêté proprement.');
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

  public getStatus() {
    return {
      isConnected: this.sock?.user !== undefined,
      isConnecting: this.isConnecting,
      status: this.sock?.user ? 'connected' : (this.lastQr ? 'qr_ready' : (this.currentConfig?.whatsapp_status || 'disconnected')),
      qrCode: this.lastQr || this.currentConfig?.qr_code || null,
      userJid: this.sock?.user?.id || null,
      userName: this.sock?.user?.name || null,
    };
  }
}

export const whatsAppManager = new WhatsAppManager();
