import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const botApiUrl = process.env.BOT_API_URL || 'http://127.0.0.1:3001';
    const res = await fetch(`${botApiUrl}/status`, { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Impossible de contacter le moteur de bot.' },
      { status: 503 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const { action } = await req.json();

    const botApiUrl = process.env.BOT_API_URL || 'http://127.0.0.1:3001';

    // 1. Si connecté avec Supabase, mise à jour dans la base
    if (session?.user) {
      if (action === 'start') {
        await supabase
          .from('bot_config')
          .update({
            bot_status: 'running',
            whatsapp_status: 'connecting',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.user.id);
        return NextResponse.json({ success: true, bot_status: 'running' });
      } else if (action === 'stop') {
        await supabase
          .from('bot_config')
          .update({
            bot_status: 'stopped',
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.user.id);
        return NextResponse.json({ success: true, bot_status: 'stopped' });
      } else if (action === 'disconnect') {
        await supabase
          .from('bot_config')
          .update({
            whatsapp_status: 'disconnected',
            qr_code: null,
            whatsapp_user_jid: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', session.user.id);
        return NextResponse.json({ success: true, whatsapp_status: 'disconnected' });
      }
    }

    // 2. Fallback direct vers le moteur bot local si pas de session Supabase
    const botAction = action === 'disconnect' ? 'logout' : action;
    const res = await fetch(`${botApiUrl}/api/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: botAction }),
    });
    const result = await res.json();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

