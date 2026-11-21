-- =====================================================================
-- ANSAROUDINE ZIKR - Notifications Web Push (iPhone, ordinateur, Android via navigateur)
-- Chaque nouvelle notification est aussi envoyée sur l'écran verrouillé des appareils abonnés.
-- Les clés secrètes ne sont PAS dans ce fichier : elles sont enregistrées directement
-- dans la table zk_config (accessible uniquement au service sécurisé).
-- =====================================================================
create extension if not exists pg_net with schema extensions;

create table if not exists public.zk_config (
  key    text primary key,
  value  text not null
);
alter table public.zk_config enable row level security;
revoke all on public.zk_config from anon, authenticated;

create table if not exists public.zk_push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references public.zk_profiles(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists zk_push_subscriptions_user_idx on public.zk_push_subscriptions (user_id);
alter table public.zk_push_subscriptions enable row level security;
revoke all on public.zk_push_subscriptions from anon, authenticated;

-- Enregistre (ou réattribue) l'abonnement de l'appareil de l'utilisateur connecté
create or replace function public.zk_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.zk_is_active_user() then
    raise exception 'Vous devez être connecté.' using errcode = '28000';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 then raise exception 'Abonnement invalide.'; end if;
  insert into public.zk_push_subscriptions (endpoint, user_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh,
    auth = excluded.auth, user_agent = excluded.user_agent;
end $$;

create or replace function public.zk_delete_push_subscription(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.zk_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- Clé publique VAPID (nécessaire au navigateur pour s'abonner)
create or replace function public.zk_push_public_key()
returns text language sql stable security definer set search_path = '' as $$
  select value from public.zk_config where key = 'vapid_public_key';
$$;

-- Appel de la fonction d'envoi à chaque nouvelle notification (asynchrone, sans ralentir les décomptes)
create or replace function public.zk_on_notification_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  select value into v_url from public.zk_config where key = 'push_function_url';
  select value into v_secret from public.zk_config where key = 'push_secret';
  if v_url is null or v_secret is null then return new; end if;
  if not exists (select 1 from public.zk_push_subscriptions where user_id = new.user_id) then return new; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-zk-secret', v_secret),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new; -- une panne d'envoi ne doit jamais bloquer l'application
end $$;

drop trigger if exists zk_notifications_push on public.zk_notifications;
create trigger zk_notifications_push after insert on public.zk_notifications
  for each row execute function public.zk_on_notification_push();

do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('zk_save_push_subscription', 'zk_delete_push_subscription',
             'zk_push_public_key', 'zk_on_notification_push') loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
grant execute on function public.zk_save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.zk_delete_push_subscription(text) to authenticated;
grant execute on function public.zk_push_public_key() to anon, authenticated;
