import { proto, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';

const logger = pino({ level: 'silent' });

export interface ExtractedMedia {
  buffer: Buffer;
  mimetype: string;
  type: 'image' | 'video' | 'audio' | 'document';
  caption?: string;
  fileName?: string;
}

/**
 * Détecte et extrait le contenu média d'un message cité (en vue unique ou standard)
 */
export async function extractMediaFromQuoted(
  quotedMessage: proto.IMessage
): Promise<ExtractedMedia | null> {
  try {
    // 1. Déballage de l'enveloppe vue unique (viewOnceMessage ou viewOnceMessageV2)
    let innerMessage: proto.IMessage = quotedMessage;

    if (quotedMessage.viewOnceMessage?.message) {
      innerMessage = quotedMessage.viewOnceMessage.message;
    } else if (quotedMessage.viewOnceMessageV2?.message) {
      innerMessage = quotedMessage.viewOnceMessageV2.message;
    } else if (quotedMessage.viewOnceMessageV2Extension?.message) {
      innerMessage = quotedMessage.viewOnceMessageV2Extension.message;
    } else if (quotedMessage.ephemeralMessage?.message) {
      innerMessage = quotedMessage.ephemeralMessage.message;
      if (innerMessage.viewOnceMessage?.message) {
        innerMessage = innerMessage.viewOnceMessage.message;
      } else if (innerMessage.viewOnceMessageV2?.message) {
        innerMessage = innerMessage.viewOnceMessageV2.message;
      }
    }

    // 2. Identification du type de média
    let mediaType: 'image' | 'video' | 'audio' | 'document' | null = null;
    let mimetype = 'application/octet-stream';
    let caption: string | undefined;
    let fileName: string | undefined;

    if (innerMessage.imageMessage) {
      mediaType = 'image';
      mimetype = innerMessage.imageMessage.mimetype || 'image/jpeg';
      caption = innerMessage.imageMessage.caption || undefined;
    } else if (innerMessage.videoMessage) {
      mediaType = 'video';
      mimetype = innerMessage.videoMessage.mimetype || 'video/mp4';
      caption = innerMessage.videoMessage.caption || undefined;
    } else if (innerMessage.audioMessage) {
      mediaType = 'audio';
      mimetype = innerMessage.audioMessage.mimetype || 'audio/ogg; codecs=opus';
    } else if (innerMessage.documentMessage) {
      mediaType = 'document';
      mimetype = innerMessage.documentMessage.mimetype || 'application/octet-stream';
      fileName = innerMessage.documentMessage.fileName || 'fichier';
    }

    if (!mediaType) {
      return null;
    }

    // 3. Téléchargement du flux média déchiffré via Baileys
    // Création d'un faux conteneur de message compatible avec downloadMediaMessage
    const fakeMessageContainer: proto.IWebMessageInfo = {
      key: { id: 'temp-media-id' },
      message: innerMessage,
    };

    const buffer = await downloadMediaMessage(
      fakeMessageContainer,
      'buffer',
      {},
      {
        logger,
        reuploadRequest: async (update) => update,
      }
    );

    return {
      buffer: buffer as Buffer,
      mimetype,
      type: mediaType,
      caption,
      fileName,
    };
  } catch (error) {
    console.error('[Media] Erreur lors de l\'extraction du média :', error);
    return null;
  }
}
