'use client';

import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WhatsAppStatus } from '@/lib/types';
import { QrCode, CheckCircle2, RefreshCw, PowerOff, KeyRound, Copy, Check, ArrowRight } from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState<'pairing' | 'qr'>('pairing');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);

  // Détection si qrCode contient un code de jumelage formaté (ex: PAIRING:ABCD-1234)
  const isPairingPayload = Boolean(qrCode && qrCode.startsWith('PAIRING:'));
  const activePairingCode = isPairingPayload && qrCode ? qrCode.replace('PAIRING:', '') : pairingCode;

  const handleRequestPairing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) return;

    setIsRequestingPairing(true);
    setPairingError(null);

    try {
      const res = await fetch('/api/bot/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la génération du code.');
      }

      setPairingCode(data.code);
    } catch (err: any) {
      setPairingError(err.message || 'Impossible de générer le code de jumelage.');
    } finally {
      setIsRequestingPairing(false);
    }
  };

  const handleCopyCode = () => {
    if (!activePairingCode) return;
    navigator.clipboard.writeText(activePairingCode.replace('-', ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. État connecté
  if (whatsappStatus === 'connected') {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-zinc-900/40 border border-emerald-500/20 rounded-2xl backdrop-blur-sm text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/5">
          <CheckCircle2 className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-semibold text-white tracking-tight">WhatsApp est connecté</h3>
        <p className="text-zinc-400 text-sm max-w-sm mt-1">
          Votre compte est prêt. Dès qu'un message en vue unique est cité avec <code className="text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">.humm</code>, le contenu sera extrait et transféré directement vers votre chat privé.
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

  // 2. État non connecté : Choix entre Code de jumelage et QR Code
  return (
    <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-2xl backdrop-blur-sm">
      {/* Sélecteur d'onglets */}
      <div className="flex items-center justify-center gap-2 p-1 bg-zinc-950/80 border border-zinc-800 rounded-xl mb-6 max-w-md mx-auto">
        <button
          type="button"
          onClick={() => setActiveTab('pairing')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'pairing'
              ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <KeyRound className="w-3.5 h-3.5" />
          <span>Code à 8 chiffres (Recommandé)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('qr')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
            activeTab === 'qr'
              ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>Scanner un QR Code</span>
        </button>
      </div>

      {/* Onglet 1 : Code de jumelage (Pairing Code) */}
      {activeTab === 'pairing' && (
        <div className="max-w-md mx-auto text-center space-y-4">
          <p className="text-xs text-zinc-400">
            Connectez votre compte sans scanner d'écran. Entrez votre numéro WhatsApp pour obtenir un code d'association à 8 caractères.
          </p>

          {pairingError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl text-left">
              {pairingError}
            </div>
          )}

          {activePairingCode ? (
            <div className="p-6 bg-zinc-950/90 border border-emerald-500/30 rounded-2xl shadow-xl space-y-4">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                Votre Code WhatsApp
              </span>

              <div className="text-3xl font-mono font-bold tracking-widest text-white py-2 select-all">
                {activePairingCode}
              </div>

              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-xs font-semibold rounded-xl transition-colors shadow-md"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Code copié !' : 'Copier le code'}</span>
              </button>

              <div className="mt-4 pt-4 border-t border-zinc-800 text-left text-xs text-zinc-400 space-y-1.5">
                <p className="font-semibold text-zinc-200">Comment l'entrer sur votre téléphone :</p>
                <p>1. Ouvrez <strong>WhatsApp</strong> sur votre téléphone.</p>
                <p>2. Allez dans <strong>Réglages &gt; Appareils connectés &gt; Connecter un appareil</strong>.</p>
                <p>3. Appuyez sur <strong>« Associer avec un numéro de téléphone »</strong> en bas.</p>
                <p>4. Tapez le code <strong>{activePairingCode}</strong>.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleRequestPairing} className="space-y-3">
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="Ex : +224620000000 ou +33612345678"
                className="w-full px-4 py-3 bg-zinc-950/80 border border-zinc-700/80 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500/50 font-mono text-center"
              />

              <button
                type="submit"
                disabled={isRequestingPairing}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-sm rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-500/10"
              >
                {isRequestingPairing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Génération du code WhatsApp...</span>
                  </>
                ) : (
                  <>
                    <span>Générer mon code de jumelage</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Onglet 2 : QR Code classique */}
      {activeTab === 'qr' && (
        <div className="flex flex-col items-center justify-center text-center">
          {whatsappStatus === 'qr_ready' && qrCode && !isPairingPayload ? (
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-2xl shadow-2xl border-4 border-zinc-800 my-2 inline-block">
                <QRCodeSVG value={qrCode} size={220} level="M" />
              </div>
              <div className="text-xs text-zinc-400 space-y-1">
                <p className="font-medium text-zinc-300">Instructions pour le QR Code :</p>
                <p>1. Ouvrez WhatsApp &gt; Réglages &gt; Appareils connectés.</p>
                <p>2. Appuyez sur « Connecter un appareil » et scannez ce code.</p>
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-2">
              <RefreshCw className="w-8 h-8 text-zinc-500 animate-spin mx-auto mb-2" />
              <p className="text-zinc-300 text-sm font-medium">Génération du QR Code en cours...</p>
              <p className="text-zinc-500 text-xs">Assurez-vous que le bot est démarré via le bouton ci-dessous.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
