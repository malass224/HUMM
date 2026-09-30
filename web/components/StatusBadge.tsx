'use client';

import React from 'react';
import { WhatsAppStatus, BotStatus } from '@/lib/types';
import { ShieldCheck, Wifi, WifiOff, Loader2 } from 'lucide-react';

interface StatusBadgeProps {
  whatsappStatus: WhatsAppStatus;
  botStatus: BotStatus;
  userJid?: string | null;
}

export function StatusBadge({ whatsappStatus, botStatus, userJid }: StatusBadgeProps) {
  const getWhatsAppBadge = () => {
    switch (whatsappStatus) {
      case 'connected':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Wifi className="w-3.5 h-3.5" />
            <span>Connecté {userJid ? `(${userJid.split('@')[0]})` : ''}</span>
          </div>
        );
      case 'qr_ready':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Scan QR Code requis</span>
          </div>
        );
      case 'connecting':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Connexion en cours...</span>
          </div>
        );
      case 'disconnected':
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs font-medium">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Déconnecté</span>
          </div>
        );
    }
  };

  const getBotBadge = () => {
    if (botStatus === 'running') {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Moteur Actif</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-800/80 border border-zinc-700/60 text-zinc-400 text-xs font-medium">
        <span className="w-2 h-2 rounded-full bg-zinc-500" />
        <span>En Pause</span>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {getBotBadge()}
      {getWhatsAppBadge()}
    </div>
  );
}
