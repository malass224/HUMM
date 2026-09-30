import express, { Request, Response } from 'express';
import { config, validateConfig } from './config';
import { supabaseService, BotConfigRow } from './supabase';
import { whatsAppManager } from './whatsapp';

const app = express();
app.use(express.json());

// 1. Point de contrôle santé (Healthcheck pour UptimeRobot, Railway, Render)
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

// 3. Initialisation du moteur et synchronisation Supabase
async function main() {
  console.log('----------------------------------------------------');
  console.log('⚡ DÉMARRAGE DU MOTEUR WHATSAPP HUMM (AUTONOME 24/7)');
  console.log('----------------------------------------------------');
  
  validateConfig();

  // Démarrage du serveur HTTP de surveillance
  app.listen(config.port, () => {
    console.log(`[HTTP] Serveur de contrôle à l'écoute sur le port ${config.port}`);
  });

  if (supabaseService.isReady) {
    console.log('[Supabase] Initialisation de la synchronisation en temps réel...');
    
    // Récupération de la configuration existante
    let botConfig = await supabaseService.getBotConfig();
    
    if (botConfig) {
      console.log(`[Supabase] Configuration chargée pour l'utilisateur ${botConfig.user_id}`);
      whatsAppManager.updateConfig(botConfig);

      // Si le bot était marqué comme actif, relancer automatiquement la session
      if (botConfig.bot_status === 'running') {
        console.log('[HUMM] Le statut est "running", lancement de la connexion WhatsApp...');
        await whatsAppManager.start();
      }

      // Écoute des ordres en provenance du Dashboard web via Realtime
      supabaseService.subscribeToConfig(botConfig.id, async (updated: BotConfigRow) => {
        console.log(`[Supabase Realtime] Mise à jour détectée : bot_status=${updated.bot_status}, destination=${updated.destination_chat}`);
        
        const previousStatus = botConfig?.bot_status;
        botConfig = updated;
        whatsAppManager.updateConfig(updated);

        // Si l'utilisateur clique sur "Démarrer" dans le SaaS
        if (previousStatus !== 'running' && updated.bot_status === 'running') {
          console.log('[HUMM] Ordre de démarrage reçu depuis le Dashboard');
          await whatsAppManager.start();
        } 
        // Si l'utilisateur clique sur "Mettre en pause"
        else if (previousStatus === 'running' && updated.bot_status === 'stopped') {
          console.log('[HUMM] Ordre de mise en pause reçu depuis le Dashboard');
          await whatsAppManager.stop();
        }
      });
    } else {
      console.warn('[Supabase] Aucune configuration trouvée. En attente du premier utilisateur...');
      // Vérification périodique si l'utilisateur s'inscrit
      const pollInterval = setInterval(async () => {
        const found = await supabaseService.getBotConfig();
        if (found) {
          clearInterval(pollInterval);
          console.log(`[Supabase] Configuration trouvée : ${found.user_id}`);
          whatsAppManager.updateConfig(found);
          if (found.bot_status === 'running') {
            await whatsAppManager.start();
          }
        }
      }, 5000);
    }
  } else {
    console.warn('[HUMM] Mode autonome local sans Supabase. Démarrage direct de Baileys...');
    await whatsAppManager.start();
  }
}

// Gestion des signaux d'arrêt propres
process.on('SIGINT', async () => {
  console.log('\n[HUMM] Arrêt du processus (SIGINT)...');
  await whatsAppManager.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[HUMM] Arrêt du conteneur (SIGTERM)...');
  await whatsAppManager.stop();
  process.exit(0);
});

main().catch((err) => {
  console.error('[HUMM FATAL] Erreur au démarrage :', err);
});
