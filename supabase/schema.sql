-- ==============================================================================
-- SCHÉMA SUPABASE — SAAS WHATSAPP « HUMM »
-- ==============================================================================

-- 1. Table de configuration du bot par utilisateur
create table if not exists public.bot_config (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null unique,
    bot_status text not null default 'stopped' check (bot_status in ('running', 'stopped')),
    whatsapp_status text not null default 'disconnected' check (whatsapp_status in ('connected', 'connecting', 'qr_ready', 'disconnected')),
    qr_code text default null,
    destination_chat text default null,
    whatsapp_user_jid text default null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. Table des journaux d'activité (logs confidentiels)
create table if not exists public.bot_logs (
    id bigserial primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    level text not null default 'info' check (level in ('info', 'success', 'warn', 'error')),
    message text not null,
    created_at timestamptz default now()
);

-- Index pour optimiser les requêtes
create index if not exists idx_bot_config_user_id on public.bot_config(user_id);
create index if not exists idx_bot_logs_user_id on public.bot_logs(user_id);
create index if not exists idx_bot_logs_created_at on public.bot_logs(created_at desc);

-- 3. Activation de Row Level Security (RLS)
alter table public.bot_config enable row level security;
alter table public.bot_logs enable row level security;

-- Politiques de sécurité pour bot_config
create policy "Les utilisateurs peuvent lire leur propre configuration"
    on public.bot_config for select
    using (auth.uid() = user_id);

create policy "Les utilisateurs peuvent modifier leur propre configuration"
    on public.bot_config for update
    using (auth.uid() = user_id);

create policy "Les utilisateurs peuvent insérer leur propre configuration"
    on public.bot_config for insert
    with check (auth.uid() = user_id);

-- Politiques de sécurité pour bot_logs
create policy "Les utilisateurs peuvent lire leurs propres journaux"
    on public.bot_logs for select
    using (auth.uid() = user_id);

create policy "Les utilisateurs peuvent supprimer leurs propres journaux"
    on public.bot_logs for delete
    using (auth.uid() = user_id);

-- 4. Fonction et déclencheur pour initialiser bot_config à l'inscription
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.bot_config (user_id, bot_status, whatsapp_status)
    values (new.id, 'stopped', 'disconnected');
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 5. Publication Realtime pour les mises à jour instantanées de l'interface
begin;
  -- Active la réplication pour la table bot_config si ce n'est pas déjà fait
  alter table public.bot_config replica identity full;
  alter table public.bot_logs replica identity full;
commit;

-- Ajout des tables à la publication supabase_realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bot_config'
  ) then
    alter publication supabase_realtime add table public.bot_config;
  end if;

  if not exists (
    select 1 from pg_publication_tables 
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bot_logs'
  ) then
    alter publication supabase_realtime add table public.bot_logs;
  end if;
end;
$$;
