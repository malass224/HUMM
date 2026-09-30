'use client';

import React, { useState, useEffect } from 'react';
import { Send, Check, MessageSquare } from 'lucide-react';

interface DestinationInputProps {
  initialDestination: string | null;
  onSave: (destination: string) => Promise<boolean>;
}

export function DestinationInput({ initialDestination, onSave }: DestinationInputProps) {
  const [value, setValue] = useState(initialDestination || '');
  const [isSaving, setIsSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setValue(initialDestination || '');
  }, [initialDestination]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const success = await onSave(value);
    setIsSaving(false);
    if (success) {
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    }
  };

  return (
    <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-2xl">
      <div className="flex items-center gap-2 mb-2 text-zinc-200">
        <MessageSquare className="w-4 h-4 text-emerald-400" />
        <h3 className="text-sm font-semibold tracking-tight">Chat privé de destination</h3>
      </div>
      
      <p className="text-xs text-zinc-400 mb-4">
        Indiquez le numéro qui recevra les médias extraits par la commande <code className="text-emerald-400 font-mono">.humm</code> (format international, ex: <span className="text-zinc-300 font-mono">33612345678</span>). Si vous laissez ce champ vide, le contenu sera automatiquement envoyé à votre propre discussion privée (« Message à vous-même »).
      </p>

      <form onSubmit={handleSave} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ex : 33612345678 (ou vide pour votre propre numéro)"
            className="w-full px-4 py-2.5 bg-zinc-950/80 border border-zinc-700/80 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all font-mono"
          />
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-medium rounded-xl border border-zinc-700 transition-all disabled:opacity-50"
        >
          {justSaved ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400">Enregistré</span>
            </>
          ) : (
            <>
              <Send className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Enregistrement...' : 'Enregistrer'}</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
