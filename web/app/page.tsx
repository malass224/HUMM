'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BotConfig, BotLog, WhatsAppStatus, BotStatus } from '@/lib/types';
import { StatusBadge } from '@/components/StatusBadge';
import { QrCodeDisplay } from '@/components/QrCodeDisplay';
import { DestinationInput } from '@/components/DestinationInput';
import { BotControls } from '@/components/BotControls';
import { ActivityLogs } from '@/components/ActivityLogs';
import { Shield, Sparkles, LogOut } from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [config, setConfig] = useState<BotConfig | null>(null);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  // Valeurs de secours pour affichage même sans Supabase configuré
  const whatsappStatus: WhatsAppStatus = config?.whatsapp_status || 'disconnected';
  const botStatus: BotStatus = config?.bot_status || 'stopped';

  // 1. Chargement des données initiales
  const loadData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser({ id: session.user.id, email: session.user.email });

        // Récupération de la configuration bot
        const { data: configData } = await supabase
          .from('bot_config')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (configData) {
          setConfig(configData as BotConfig);
        } else {
          // Création automatique si absente
          const { data: newConfig } = await supabase
            .from('bot_config')
            .insert({ user_id: session.user.id, bot_status: 'stopped', whatsapp_status: 'disconnected' })
            .select('*')
            .single();
          if (newConfig) setConfig(newConfig as BotConfig);
        }

        // Récupération des logs récents
        const { data: logsData } = await supabase
          .from('bot_logs')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (logsData) {
          setLogs(logsData as BotLog[]);
        }
      } else {
        // Mode invité / démo locale si non connecté
        setUser(null);
      }
    } catch (err) {
      console.error('Erreur chargement données :', err);
    } finally {
      setIsConfigLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();

    // 2. Écoute des mises à jour en temps réel (Supabase Realtime)
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bot_config' },
        (payload) => {
          if (payload.new) {
            setConfig(payload.new as BotConfig);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bot_logs' },
        (payload) => {
          if (payload.new) {
            setLogs((prev) => [payload.new as BotLog, ...prev.slice(0, 9)]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadData]);

  // Action : Basculer l'état du bot (Démarrer / Mettre en pause)
  const handleToggleBot = async () => {
    setIsLoading(true);
    const newStatus: BotStatus = botStatus === 'running' ? 'stopped' : 'running';

    try {
      if (user && config) {
        await supabase
          .from('bot_config')
          .update({
            bot_status: newStatus,
            whatsapp_status: newStatus === 'running' ? 'connecting' : config.whatsapp_status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        setConfig((prev) => prev ? { ...prev, bot_status: newStatus } : null);
      } else {
        // Simulation locale si non connecté à Supabase
        setConfig((prev) => ({
          id: 'demo-config',
          user_id: 'demo-user',
          bot_status: newStatus,
          whatsapp_status: newStatus === 'running' ? 'qr_ready' : 'disconnected',
          qr_code: newStatus === 'running' ? '2@HUMM_DEMO_QR_CODE_STRING_FOR_VERIFICATION' : null,
          destination_chat: prev?.destination_chat || null,
          whatsapp_user_jid: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
      }
    } catch (err) {
      console.error('Erreur bascule bot :', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Action : Déconnecter WhatsApp
  const handleDisconnect = async () => {
    setIsLoading(true);
    try {
      if (user && config) {
        await supabase
          .from('bot_config')
          .update({
            whatsapp_status: 'disconnected',
            qr_code: null,
            whatsapp_user_jid: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);
      }
      setConfig((prev) => prev ? { ...prev, whatsapp_status: 'disconnected', qr_code: null, whatsapp_user_jid: null } : null);
    } catch (err) {
      console.error('Erreur déconnexion :', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Action : Sauvegarder le chat de destination
  const handleSaveDestination = async (destination: string): Promise<boolean> => {
    try {
      if (user && config) {
        const { error } = await supabase
          .from('bot_config')
          .update({
            destination_chat: destination.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', config.id);

        if (error) throw error;
        setConfig((prev) => prev ? { ...prev, destination_chat: destination } : null);
        return true;
      }
      setConfig((prev) => prev ? { ...prev, destination_chat: destination } : null);
      return true;
    } catch (err) {
      console.error('Erreur sauvegarde destination :', err);
      return false;
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-10 md:py-16">
      {/* 1. Header Minimaliste */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between pb-8 mb-8 border-b border-zinc-800/80 gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              HUMM
              <span className="inline-flex items-center gap-1 text-[11px] font-mono tracking-wider font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <Sparkles className="w-3 h-3" />
                SAAS
              </span>
            </h1>
          </div>
          <p className="text-zinc-400 text-xs mt-1">
            Assistant personnel autonome 24h/24 · Commande unique <code className="text-zinc-200 font-mono">.humm</code>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge
            whatsappStatus={whatsappStatus}
            botStatus={botStatus}
            userJid={config?.whatsapp_user_jid}
          />
          {user ? (
            <button
              onClick={handleSignOut}
              title="Se déconnecter de la session web"
              className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 border border-zinc-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <Link
              href="/login"
              className="text-xs px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-colors"
            >
              Connexion
            </Link>
          )}
        </div>
      </header>

      {/* 2. Corps du Tableau de Bord */}
      <div className="space-y-6">
        {/* Carte QR Code / État de connexion */}
        <section aria-label="Connexion WhatsApp">
          <QrCodeDisplay
            whatsappStatus={whatsappStatus}
            qrCode={config?.qr_code || null}
            onDisconnect={handleDisconnect}
            isLoading={isLoading}
          />
        </section>

        {/* Bouton unique de contrôle du bot */}
        <section aria-label="Contrôles du bot">
          <BotControls
            botStatus={botStatus}
            onToggle={handleToggleBot}
            isLoading={isLoading}
          />
        </section>

        {/* Configuration du chat privé de destination */}
        <section aria-label="Chat de destination">
          <DestinationInput
            initialDestination={config?.destination_chat || null}
            onSave={handleSaveDestination}
          />
        </section>

        {/* Journal d'activité minimaliste */}
        <section aria-label="Journal d'activité">
          <ActivityLogs logs={logs} />
        </section>
      </div>

      {/* 3. Pied de page épuré */}
      <footer className="mt-12 pt-6 border-t border-zinc-900 text-center text-xs text-zinc-500">
        <p className="flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-500/60" />
          <span>HUMM est conçu pour fonctionner 24 h/24 dans le cloud, indépendamment de votre ordinateur.</span>
        </p>
      </footer>
    </div>
  );
}
