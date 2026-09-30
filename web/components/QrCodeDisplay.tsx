'use client';

import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WhatsAppStatus } from '@/lib/types';
import { QrCode, CheckCircle2, RefreshCw, PowerOff } from 'lucide-react';

interface QrCodeDisplayProps {
  whatsappStatus: WhatsAppStatus;
  qrCode: string | null;
  onDisconnect: () => Promise<void>;
  isLoading?: boolean;
}

export function QrCodeDisplay({
  whatsappStatus,
  qrCode,
  onDisconnect,
  isLoading,
}: QrCodeDisplayProps) {
  if (whatsappStatus === 'connected') {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-emerald-500/20 rounded-2xl backdrop-blur-sm text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/5">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-white tracking-tight">WhatsApp est connecté</h3>
        <p className="text-zinc-400 text-sm max-w-sm mt-1">
          Votre compte est prêt. Toute citation avec l'unique commande <code className="text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">.humm</code> sera traitée confidentiellement.
        </p>
        <button
          onClick={onDisconnect}
          disabled={isLoading}
          className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 border border-zinc-800 hover:border-rose-500/20 transition-all duration-200"
        >
          <PowerOff className="w-3.5 h-3.5" />
          Déconnecter ce compte
        </button>
      </div>
    );
  }

  if (whatsappStatus === 'qr_ready' && qrCode) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-sm text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs mb-4">
          <QrCode className="w-3.5 h-3.5" />
          Scanner avec WhatsApp
        </div>

        {/* Cadre du QR Code avec contraste optimisé */}
        <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-zinc-800 my-2">
          <QRCodeSVG value={qrCode} size={220} level="M" />
        </div>

        <div className="mt-4 text-xs text-zinc-400 space-y-1">
          <p className="font-medium text-zinc-300">Instructions :</p>
          <p>1. Ouvrez WhatsApp sur votre téléphone.</p>
          <p>2. Allez dans Réglages &gt; Appareils connectés &gt; Connecter un appareil.</p>
          <p>3. Pointez votre appareil vers ce QR Code.</p>
        </div>
      </div>
    );
  }

  if (whatsappStatus === 'connecting') {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-zinc-800 rounded-2xl text-center">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin mb-3" />
        <p className="text-zinc-300 font-medium text-sm">Génération de la session en cours...</p>
        <p className="text-zinc-500 text-xs mt-1">Le QR code va s'afficher dans un instant.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/30 border border-zinc-800/60 rounded-2xl text-center">
      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 mb-3">
        <QrCode className="w-6 h-6 opacity-60" />
      </div>
      <p className="text-zinc-300 font-medium text-sm">WhatsApp non connecté</p>
      <p className="text-zinc-500 text-xs mt-1 max-w-xs">
        Cliquez sur « Démarrer HUMM » pour générer le QR code de connexion.
      </p>
    </div>
  );
}
