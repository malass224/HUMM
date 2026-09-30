import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const { destination_chat } = await req.json();

    const { error } = await supabase
      .from('bot_config')
      .update({
        destination_chat: destination_chat?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', session.user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, destination_chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
