export type WhatsAppStatus = 'connected' | 'connecting' | 'qr_ready' | 'disconnected';
export type BotStatus = 'running' | 'stopped';

export interface BotConfig {
  id: string;
  user_id: string;
  bot_status: BotStatus;
  whatsapp_status: WhatsAppStatus;
  qr_code: string | null;
  destination_chat: string | null;
  whatsapp_user_jid: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotLog {
  id: number;
  user_id: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
  created_at: string;
}
