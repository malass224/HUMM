import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from './config';

export interface BotConfigRow {
  id: string;
  user_id: string;
  bot_status: 'running' | 'stopped';
  whatsapp_status: 'connected' | 'connecting' | 'qr_ready' | 'disconnected';
  qr_code: string | null;
  destination_chat: string | null;
  whatsapp_user_jid: string | null;
  created_at: string;
  updated_at: string;
}

class SupabaseService {
  private client: SupabaseClient | null = null;
  private isConfigured: boolean = false;

  constructor() {
    if (config.supabaseUrl && config.supabaseServiceKey) {
      this.client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      this.isConfigured = true;
    }
  }

  public get isReady(): boolean {
    return this.isConfigured && this.client !== null;
  }

  /**
   * Récupère la configuration du bot pour l'utilisateur spécifié
   */
  async getBotConfig(userId?: string): Promise<BotConfigRow | null> {
    if (!this.client) return null;

    try {
      let query = this.client.from('bot_config').select('*');
      
      const targetUserId = userId || config.botUserId;
      if (targetUserId) {
        query = query.eq('user_id', targetUserId);
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();

      if (error) {
        console.error('[Supabase] Erreur lors de la récupération de la configuration :', error.message);
        return null;
      }

      return data as BotConfigRow | null;
    } catch (err) {
      console.error('[Supabase] Exception getBotConfig :', err);
      return null;
    }
  }

  /**
   * Met à jour la configuration du bot
   */
  async updateBotConfig(configId: string, updates: Partial<BotConfigRow>): Promise<boolean> {
    if (!this.client) return false;

    try {
      const { error } = await this.client
        .from('bot_config')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', configId);

      if (error) {
        console.error('[Supabase] Erreur mise à jour configuration :', error.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[Supabase] Exception updateBotConfig :', err);
      return false;
    }
  }

  /**
   * Enregistre un message dans le journal d'activité
   */
  async logActivity(
    userId: string,
    level: 'info' | 'success' | 'warn' | 'error',
    message: string
  ): Promise<void> {
    const timestamp = new Date().toLocaleTimeString('fr-FR');
    console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);

    if (!this.client || !userId) return;

    try {
      await this.client.from('bot_logs').insert({
        user_id: userId,
        level,
        message,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Supabase] Échec de l\'enregistrement du journal :', err);
    }
  }

  /**
   * Écoute en temps réel les changements apportés à bot_config
   */
  subscribeToConfig(configId: string, onUpdate: (newConfig: BotConfigRow) => void): () => void {
    if (!this.client) return () => {};

    const channel = this.client
      .channel(`bot_config_changes_${configId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bot_config',
          filter: `id=eq.${configId}`,
        },
        (payload) => {
          onUpdate(payload.new as BotConfigRow);
        }
      )
      .subscribe();

    return () => {
      if (this.client) {
        this.client.removeChannel(channel);
      }
    };
  }
}

export const supabaseService = new SupabaseService();
