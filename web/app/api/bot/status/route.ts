import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { action } = await req.json();

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

    return NextResponse.json({ error: 'Action non reconnue' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
