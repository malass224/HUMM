import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    const { destination_chat } = await req.json();

    if (session?.user) {
      const { error } = await supabase
        .from('bot_config')
        .update({
          destination_chat: destination_chat?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', session.user.id);

      if (error) throw error;
      return NextResponse.json({ success: true, destination_chat });
    }

    // Fallback avec la clé de service pour usage direct / mobile
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (serviceKey && supabaseUrl) {
      const { createClient } = await import('@supabase/supabase-js');
      const adminClient = createClient(supabaseUrl, serviceKey);
      const { data: configs } = await adminClient.from('bot_config').select('id').limit(1);
      if (configs && configs.length > 0) {
        await adminClient
          .from('bot_config')
          .update({
            destination_chat: destination_chat?.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', configs[0].id);
        return NextResponse.json({ success: true, destination_chat });
      }
    }

    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
