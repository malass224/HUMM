import express, { Request, Response } from 'express';
import { config, validateConfig } from './config';
import { supabaseService, BotConfigRow } from './supabase';
import { whatsAppManager } from './whatsapp';

const app = express();
app.use(express.json());

// 1. Point de contrôle santé
app.get('/health', (_req: Request, res: Response) => {
  const status = whatsAppManager.getStatus();
  res.json({
    status: 'ok',
    app: 'HUMM WhatsApp Engine',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    whatsapp: status,
  });
});

app.get('/status', (_req: Request, res: Response) => {
  res.json({
    app: 'HUMM',
    version: '1.0.0',
    mode: config.nodeEnv,
    whatsapp: whatsAppManager.getStatus(),
  });
});

// 2. Action manuelle locale ou webhook
app.post('/api/action', async (req: Request, res: Response) => {
  const { action } = req.body;
  try {
    if (action === 'start') {
      await whatsAppManager.start();
      res.json({ success: true, message: 'Démarrage initié' });
    } else if (action === 'stop') {
      await whatsAppManager.stop();
      res.json({ success: true, message: 'Arrêt initié' });
    } else if (action === 'logout') {
      await whatsAppManager.logout();
      res.json({ success: true, message: 'Déconnexion effectuée' });
    } else {
      res.status(400).json({ success: false, message: 'Action inconnue' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

// 3. Demande de code de jumelage (Pairing Code)
app.post('/api/pair', async (req: Request, res: Response) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, error: 'Numéro de téléphone requis.' });
  }

  try {
    const code = await whatsAppManager.requestPairing(phoneNumber);
    res.json({ success: true, code });
  } catch (err: any) {
    console.error('[API /api/pair] Erreur :', err);
    res.status(500).json({ success: false, error: err.message || 'Échec de la génération du code.' });
  }
});

let currentConfig: BotConfigRow | null = null;
let isSubscribed = false;

function bindConfig(botConfig: BotConfigRow) {
  currentConfig = botConfig;
  whatsAppManager.updateConfig(botConfig);

  if (botConfig.bot_status === 'running' && !whatsAppManager.getStatus().isConnected) {
    console.log('[HUMM] Configuration active, lancement du client WhatsApp...');
    whatsAppManager.start();
  }

  if (!isSubscribed) {
    isSubscribed = true;
    console.log(`[Supabase Realtime] Abonnement aux changements pour ${botConfig.id}`);
    
    supabaseService.subscribeToConfig(botConfig.id, async (updated: BotConfigRow) => {
      console.log(`[Supabase Realtime] Changement détecté : bot_status=${updated.bot_status}, whatsapp_status=${updated.whatsapp_status}`);
      const prevStatus = currentConfig?.bot_status;
      currentConfig = updated;
      whatsAppManager.updateConfig(updated);

      if (prevStatus !== 'running' && updated.bot_status === 'running') {
        console.log('[HUMM] Ordre de démarrage reçu');
        await whatsAppManager.start();
      } else if (prevStatus === 'running' && updated.bot_status === 'stopped') {
        console.log('[HUMM] Ordre de mise en pause reçu');
        await whatsAppManager.stop();
      }
    });
  }
}

// 4. Initialisation du moteur et boucle permanente de synchronisation
async function main() {
  console.log('----------------------------------------------------');
  console.log('⚡ DÉMARRAGE DU MOTEUR WHATSAPP HUMM (AUTONOME 24/7)');
  console.log('----------------------------------------------------');
  
  validateConfig();

  app.listen(config.port, () => {
    console.log(`[HTTP] Serveur de contrôle à l'écoute sur le port ${config.port}`);
  });

  if (supabaseService.isReady) {
    console.log('[Supabase] Initialisation de la synchronisation Supabase...');
    
    // Vérification continue (toutes les 3 secondes) pour garantir une réactivité immédiate
    setInterval(async () => {
      try {
        const latest = await supabaseService.getBotConfig();
        if (latest) {
          if (!currentConfig) {
            console.log(`[Supabase] Première configuration trouvée pour l'utilisateur ${latest.user_id}`);
            bindConfig(latest);
          } else {
            // Détection des changements de statut même si WebSocket Realtime a un délai
            const prevBotStatus = currentConfig.bot_status;
            currentConfig = latest;
            whatsAppManager.updateConfig(latest);

            if (prevBotStatus !== 'running' && latest.bot_status === 'running') {
              console.log('[HUMM Sync] Passage à l\'état running détecté, démarrage de Baileys...');
              await whatsAppManager.start();
            } else if (prevBotStatus === 'running' && latest.bot_status === 'stopped') {
              console.log('[HUMM Sync] Passage à l\'état stopped détecté, arrêt de Baileys...');
              await whatsAppManager.stop();
            }
          }
        }
      } catch (e) {
        console.error('[Sync loop error] :', e);
      }
    }, 3000);

  } else {
    console.warn('[HUMM] Mode local sans Supabase.');
    await whatsAppManager.start();
  }
}

process.on('SIGINT', async () => {
  console.log('\n[HUMM] Arrêt (SIGINT)...');
  await whatsAppManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[HUMM] Arrêt (SIGTERM)...');
  await whatsAppManager.stop();
  process.exit(0);
});

main().catch((err) => {
  console.error('[HUMM FATAL] Erreur au démarrage :', err);
});
