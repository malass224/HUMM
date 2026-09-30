'use client';

import React from 'react';
import { BotLog } from '@/lib/types';
import { Terminal, Shield, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ActivityLogsProps {
  logs: BotLog[];
}

export function ActivityLogs({ logs }: ActivityLogsProps) {
  if (logs.length === 0) {
    return (
      <div className="p-5 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl">
        <div className="flex items-center gap-2 text-zinc-400 text-xs font-medium mb-2">
          <Terminal className="w-3.5 h-3.5" />
          <span>Journal d'activité</span>
        </div>
        <p className="text-zinc-500 text-xs italic">Aucune activité enregistrée pour le moment.</p>
      </div>
    );
  }

  const getIcon = (level: string) => {
    switch (level) {
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'error':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'warn':
        return <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      default:
        return <Shield className="w-3.5 h-3.5 text-zinc-400 shrink-0" />;
    }
  };

  return (
    <div className="p-5 bg-zinc-900/30 border border-zinc-800/80 rounded-2xl">
      <div className="flex items-center justify-between text-zinc-300 text-xs font-medium mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-emerald-400" />
          <span>Journal des extractions récentes</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">Chiffré & Confidentiel</span>
      </div>

      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {logs.map((log) => {
          const time = new Date(log.created_at).toLocaleTimeString('fr-FR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });

          return (
            <div
              key={log.id}
              className="flex items-start gap-2.5 text-xs py-1.5 px-2.5 rounded-lg bg-zinc-950/40 border border-zinc-800/40 text-zinc-300"
            >
              <div className="mt-0.5">{getIcon(log.level)}</div>
              <div className="flex-1 min-w-0">
                <span className="text-zinc-500 font-mono text-[10px] mr-2">[{time}]</span>
                <span className="text-zinc-300 text-xs">{log.message}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
