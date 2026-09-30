import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
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
   * Initialise et démarre la connexion WhatsApp
   */
  public async start(): Promise<void> {
    if (this.isConnecting || this.sock) {
      console.log('[WhatsApp] Connexion déjà en cours ou active.');
      return;
    }

    this.isConnecting = true;
    console.log('[WhatsApp] Démarrage du client Baileys...');

    try {
      this.ensureSessionDir();
      const { state, saveCreds } = await useMultiFileAuthState(config.sessionDataPath);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger),
        },
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: false, // Discrétion maximale
      });

      // Sauvegarde continue des identifiants de session chiffrés
      this.sock.ev.on('creds.update', saveCreds);

      // Gestion des cycles de vie de la connexion
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 1. Présentation du QR code pour scan
        if (qr) {
          console.log('[WhatsApp] Nouveau QR Code généré.');
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
              'WhatsApp connecté et prêt. Commande .humm active.'
            );
          }
        }

        // 3. Déconnexion ou perte temporaire
        if (connection === 'close') {
          this.isConnecting = false;
          const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          console.warn(`[WhatsApp] Connexion fermée (statut : ${statusCode}). Reconnexion : ${shouldReconnect}`);

          if (statusCode === DisconnectReason.loggedOut) {
            // Déconnexion définitive voulue ou session révoquée sur le téléphone
            await this.clearSession();
            if (this.currentConfig) {
              await supabaseService.updateBotConfig(this.currentConfig.id, {
                whatsapp_status: 'disconnected',
                qr_code: null,
                whatsapp_user_jid: null,
              });
              await supabaseService.logActivity(
                this.currentConfig.user_id,
                'warn',
                'Session WhatsApp déconnectée ou révoquée.'
              );
            }
          } else {
            // Reconnexion automatique avec backoff
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

      // Écoute des messages entrants pour la commande .humm
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          await handleIncomingMessage(this.sock!, msg, this.currentConfig);
        }
      });

    } catch (err) {
      console.error('[WhatsApp] Exception au démarrage :', err);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Planifie une tentative de reconnexion automatique avec backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WhatsApp] Nombre maximal de tentatives de reconnexion atteint.');
      if (this.currentConfig) {
        supabaseService.logActivity(
          this.currentConfig.user_id,
          'error',
          'Impossible de rétablir la connexion WhatsApp après plusieurs tentatives.'
        );
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts), 30000);
    console.log(`[WhatsApp] Tentative de reconnexion (${this.reconnectAttempts}/${this.maxReconnectAttempts}) dans ${Math.round(delay / 1000)}s...`);

    this.reconnectTimeout = setTimeout(async () => {
      this.sock = null;
      await this.start();
    }, delay);
  }

  /**
   * Arrête le bot proprement
   */
  public async stop(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (e) {
        // Ignorer les erreurs d'arrêt
      }
      this.sock = null;
    }

    this.isConnecting = false;
    console.log('[WhatsApp] Client WhatsApp arrêté.');
  }

  /**
   * Déconnexion complète et purge des jetons de session
   */
  public async logout(): Promise<void> {
    try {
      if (this.sock) {
        await this.sock.logout();
      }
    } catch (err) {
      console.warn('[WhatsApp] Erreur mineure lors du logout Baileys :', err);
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
        'Session réinitialisée. Vous pouvez scanner un nouveau QR code.'
      );
    }
  }

  /**
   * Supprime les fichiers de session sur le disque
   */
  private async clearSession(): Promise<void> {
    try {
      if (fs.existsSync(config.sessionDataPath)) {
        const files = fs.readdirSync(config.sessionDataPath);
        for (const file of files) {
          fs.unlinkSync(path.join(config.sessionDataPath, file));
        }
      }
      console.log('[WhatsApp] Dossier de session nettoyé.');
    } catch (err) {
      console.error('[WhatsApp] Erreur lors de la suppression de la session :', err);
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
