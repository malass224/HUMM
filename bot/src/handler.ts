import { WASocket, proto } from '@whiskeysockets/baileys';
import { extractMediaFromQuoted } from './media';
import { supabaseService, BotConfigRow } from './supabase';
import { cacheMessage } from './whatsapp';

// Système anti-doublon pour éviter les traitements répétés (ex: retries réseau)
const processedMessageIds = new Map<string, number>();

// Nettoyage régulier du cache anti-doublon (conserve 1 heure)
setInterval(() => {
  const oneHourAgo = Date.now() - 3600 * 1000;
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (timestamp < oneHourAgo) {
      processedMessageIds.delete(id);
    }
  }
}, 10 * 60 * 1000);

/**
 * Normalise un identifiant ou numéro de téléphone en JID WhatsApp valide
 */
export function formatDestinationJid(destination: string | null, selfJid?: string): string | null {
  if (!destination || destination.trim() === '') {
    if (selfJid) {
      const cleanSelf = selfJid.split(':')[0].split('@')[0];
      return `${cleanSelf}@s.whatsapp.net`;
    }
    return null;
  }

  const trimmed = destination.trim();
  if (trimmed.includes('@s.whatsapp.net') || trimmed.includes('@g.us')) {
    return trimmed;
  }

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length > 5) {
    return `${digitsOnly}@s.whatsapp.net`;
  }

  return null;
}

/**
 * Traite les messages entrants et gère l'unique commande .humm
 */
export async function handleIncomingMessage(
  sock: WASocket,
  message: proto.IWebMessageInfo,
  config: BotConfigRow | null
): Promise<void> {
  try {
    const msgId = message.key.id;
    if (!msgId) return;

    // 1. Verrou anti-doublon immédiat pour éviter les exécutions concurrentes
    if (processedMessageIds.has(msgId)) {
      return;
    }

    // 2. Extraction du texte du message
    const msgText = (
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text ||
      ''
    ).trim();

    // 3. Vérification stricte : le message doit être l'unique commande .humm
    if (msgText.toLowerCase() !== '.humm') {
      return;
    }

    // Enregistrement immédiat pour bloquer tout doublon
    processedMessageIds.set(msgId, Date.now());

    // 4. Contrôle de sécurité : seule la personne connectée au compte peut déclencher .humm
    const isFromMe = message.key.fromMe === true;
    const sender = message.key.participant || message.key.remoteJid || '';
    const myJid = sock.user?.id ? sock.user.id.split(':')[0] : '';

    if (!isFromMe && (!myJid || !sender.includes(myJid))) {
      return;
    }

    const userId = config?.user_id || 'system';

    // 5. Récupération du message cité
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      console.warn('[HUMM] Commande .humm reçue sans message cité.');
      await supabaseService.logActivity(
        userId,
        'warn',
        'Commande .humm exécutée sans message cité. Vous devez citer le message en vue unique.'
      );
      return;
    }

    // 6. Extraction et déchiffrement du média
    const extractedMedia = await extractMediaFromQuoted(quotedMessage);

    if (!extractedMedia) {
      console.warn('[HUMM] Aucun média extractible trouvé dans le message cité.');
      await supabaseService.logActivity(
        userId,
        'warn',
        'Aucun contenu média en vue unique détecté dans le message cité.'
      );
      return;
    }

    // 7. Résolution du chat de destination privée
    const destinationJid = formatDestinationJid(config?.destination_chat || null, sock.user?.id);

    if (!destinationJid) {
      console.error('[HUMM] Aucun chat de destination configuré.');
      await supabaseService.logActivity(
        userId,
        'error',
        'Échec : aucun chat privé de destination configuré.'
      );
      return;
    }

    // 8. Envoi sécurisé et direct vers le chat privé désigné
    const captionNote = '🔒 *HUMM* — Contenu récupéré en toute discrétion';
    let sentMsg: proto.WebMessageInfo | undefined;

    if (extractedMedia.type === 'image') {
      sentMsg = await sock.sendMessage(destinationJid, {
        image: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        caption: extractedMedia.caption ? `${captionNote}\n\n${extractedMedia.caption}` : captionNote,
        viewOnce: false, // Ne pas renvoyer en vue unique
      });
    } else if (extractedMedia.type === 'video') {
      sentMsg = await sock.sendMessage(destinationJid, {
        video: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        caption: extractedMedia.caption ? `${captionNote}\n\n${extractedMedia.caption}` : captionNote,
        viewOnce: false,
      });
    } else if (extractedMedia.type === 'audio') {
      sentMsg = await sock.sendMessage(destinationJid, {
        audio: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        ptt: false,
      });
    } else if (extractedMedia.type === 'document') {
      sentMsg = await sock.sendMessage(destinationJid, {
        document: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        fileName: extractedMedia.fileName || 'media_humm',
        caption: captionNote,
      });
    }

    // Mise en cache immédiate du message envoyé pour que le téléphone puisse le déchiffrer
    if (sentMsg?.key?.id && sentMsg.message) {
      cacheMessage(sentMsg.key.id, sentMsg.message);
    }

    // 9. Confidentialité garantie : zéro fuite, l'expéditeur initial ne reçoit rien
    await supabaseService.logActivity(
      userId,
      'success',
      `Contenu ${extractedMedia.type} récupéré et transféré avec succès vers le chat privé.`
    );
    console.log(`[HUMM] Succès : média ${extractedMedia.type} transmis confidentiellement.`);

  } catch (error) {
    console.error('[HUMM] Erreur lors du traitement de .humm :', error);
    const userId = config?.user_id || 'system';
    await supabaseService.logActivity(
      userId,
      'error',
      `Erreur lors du traitement : ${error instanceof Error ? error.message : 'Erreur inconnue'}`
    );
  }
}
