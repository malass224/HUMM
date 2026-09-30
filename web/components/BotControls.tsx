'use client';

import React from 'react';
import { BotStatus } from '@/lib/types';
import { Play, Pause, Loader2 } from 'lucide-react';

interface BotControlsProps {
  botStatus: BotStatus;
  onToggle: () => Promise<void>;
  isLoading?: boolean;
}

export function BotControls({ botStatus, onToggle, isLoading }: BotControlsProps) {
  const isRunning = botStatus === 'running';

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl text-center">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-wider font-semibold text-zinc-400">
          Contrôle du service
        </p>
        <p className="text-xs text-zinc-500 mt-0.5">
          {isRunning
            ? 'Le bot surveille activement vos messages pour la commande .humm'
            : 'Le bot est actuellement en veille.'}
        </p>
      </div>

      <button
        onClick={onToggle}
        disabled={isLoading}
        className={`w-full max-w-xs flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-medium text-sm transition-all duration-200 shadow-lg ${
          isRunning
            ? 'bg-zinc-800 hover:bg-zinc-700/80 text-zinc-200 border border-zinc-700 hover:border-zinc-600 shadow-zinc-950/40'
            : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold shadow-emerald-500/20'
        } disabled:opacity-50`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Mise à jour...</span>
          </>
        ) : isRunning ? (
          <>
            <Pause className="w-4 h-4 fill-current" />
            <span>Mettre en pause HUMM</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4 fill-current" />
            <span>Démarrer HUMM</span>
          </>
        )}
      </button>
    </div>
  );
}
