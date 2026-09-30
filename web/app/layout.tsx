import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HUMM — Assistant WhatsApp Personnel',
  description: 'SaaS minimaliste WhatsApp pour la récupération confidentielle de contenus en vue unique.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased selection:bg-emerald-500/20 selection:text-emerald-300">
        <div className="fixed inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.06),rgba(255,255,255,0))] pointer-events-none" />
        <main className="relative z-10">{children}</main>
      </body>
    </html>
  );
}
