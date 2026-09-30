import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  port: number;
  supabaseUrl: string;
  supabaseServiceKey: string;
  botUserId: string;
  sessionDataPath: string;
  nodeEnv: string;
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3001', 10),
  supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '',
  botUserId: process.env.BOT_USER_ID || '',
  sessionDataPath: process.env.SESSION_DATA_PATH 
    ? path.resolve(process.env.SESSION_DATA_PATH)
    : path.resolve(process.cwd(), 'sessions'),
  nodeEnv: process.env.NODE_ENV || 'development',
};

export function validateConfig(): void {
  const missing: string[] = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)');
  if (!config.supabaseServiceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.warn(`[ATTENTION] Variables d'environnement manquantes : ${missing.join(', ')}`);
    console.warn('Le moteur tentera de fonctionner en mode local dégradé si la base Supabase n\'est pas connectée.');
  }
}
