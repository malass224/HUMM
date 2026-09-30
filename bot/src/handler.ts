import { WASocket, proto } from '@whiskeysockets/baileys';
import { extractMediaFromQuoted } from './media';
import { supabaseService, BotConfigRow } from './supabase';

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

  // Nettoyage des caractères non numériques (espaces, +, tirets)
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

    // 1. Prévention des doubles traitements
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

    // Enregistrement de l'ID pour éviter tout double traitement ultérieur
    processedMessageIds.set(msgId, Date.now());

    // 4. Contrôle de sécurité : seule la personne connectée au compte peut déclencher .humm
    const isFromMe = message.key.fromMe === true;
    const sender = message.key.participant || message.key.remoteJid || '';
    const myJid = sock.user?.id ? sock.user.id.split(':')[0] : '';

    if (!isFromMe && (!myJid || !sender.includes(myJid))) {
      // Ignorer silencieusement si la commande ne provient pas du titulaire du compte
      return;
    }

    const userId = config?.user_id || 'system';

    // 5. Récupération du message cité
    const contextInfo = message.message?.extendedTextMessage?.contextInfo;
    const quotedMessage = contextInfo?.quotedMessage;

    if (!quotedMessage) {
      console.warn('[HUMM] Commande reçue sans message cité.');
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
        'Échec : aucun chat privé de destination n\'est configuré dans le tableau de bord.'
      );
      return;
    }

    // 8. Envoi sécurisé et direct vers le chat privé désigné
    const captionNote = '🔒 *HUMM* — Contenu récupéré en toute discrétion';

    if (extractedMedia.type === 'image') {
      await sock.sendMessage(destinationJid, {
        image: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        caption: extractedMedia.caption ? `${captionNote}\n\n${extractedMedia.caption}` : captionNote,
      });
    } else if (extractedMedia.type === 'video') {
      await sock.sendMessage(destinationJid, {
        video: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        caption: extractedMedia.caption ? `${captionNote}\n\n${extractedMedia.caption}` : captionNote,
      });
    } else if (extractedMedia.type === 'audio') {
      await sock.sendMessage(destinationJid, {
        audio: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        ptt: false,
      });
    } else if (extractedMedia.type === 'document') {
      await sock.sendMessage(destinationJid, {
        document: extractedMedia.buffer,
        mimetype: extractedMedia.mimetype,
        fileName: extractedMedia.fileName || 'media_humm',
        caption: captionNote,
      });
    }

    // 9. Confidentialité garantie :
    // Aucun message n'est envoyé dans le chat d'origine.
    // L'expéditeur initial ne reçoit rien et ne s'aperçoit de rien.
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
