-- =====================================================================
-- ANSAROUDINE ZIKR - Schéma de base de données
-- Tables, index, fonctions de sécurité et Row Level Security
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'participant');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.campaign_status as enum ('en_cours', 'terminee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entry_kind as enum ('ajout', 'annulation');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Profils (un profil par compte de l'application)
-- Le profil n'a volontairement pas de clé étrangère vers auth.users :
-- lorsqu'un compte est supprimé, son profil est conservé (marqué supprimé)
-- afin que l'historique des décomptes reste intact définitivement.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                    uuid primary key,
  username              text not null,
  full_name             text not null,
  phone                 text,
  role                  public.app_role not null default 'participant',
  is_owner              boolean not null default false,
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  deleted_at            timestamptz,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint profiles_username_format
    check (deleted_at is not null or username ~ '^[a-z0-9._-]{3,32}$'),
  constraint profiles_full_name_len check (char_length(btrim(full_name)) between 2 and 80),
  constraint profiles_phone_len check (phone is null or char_length(phone) <= 30),
  constraint profiles_owner_is_admin check (not is_owner or role = 'admin')
);

create unique index if not exists profiles_username_unique
  on public.profiles (username) where deleted_at is null;
create unique index if not exists profiles_single_owner
  on public.profiles ((true)) where is_owner and deleted_at is null;
create index if not exists profiles_full_name_trgm
  on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index if not exists profiles_username_trgm
  on public.profiles using gin (username extensions.gin_trgm_ops);
create index if not exists profiles_role_idx on public.profiles (role) where deleted_at is null;

-- ---------------------------------------------------------------------
-- Campagnes
-- ---------------------------------------------------------------------
create table if not exists public.campaigns (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  zikr_type           text not null,
  description         text,
  start_date          date not null default current_date,
  end_date            date,
  global_goal         bigint not null,
  total_count         bigint not null default 0,
  participants_count  integer not null default 0,
  status              public.campaign_status not null default 'en_cours',
  goal_reached_at     timestamptz,
  closed_at           timestamptz,
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint campaigns_title_len check (char_length(btrim(title)) between 2 and 120),
  constraint campaigns_type_len check (char_length(btrim(zikr_type)) between 1 and 120),
  constraint campaigns_description_len check (description is null or char_length(description) <= 2000),
  constraint campaigns_goal_positive check (global_goal > 0 and global_goal <= 1000000000000),
  constraint campaigns_total_positive check (total_count >= 0),
  constraint campaigns_dates check (end_date is null or end_date >= start_date)
);

create index if not exists campaigns_status_idx on public.campaigns (status, start_date desc);
create index if not exists campaigns_created_idx on public.campaigns (created_at desc);

-- ---------------------------------------------------------------------
-- Participations (participant coché pour une campagne + objectif)
-- ---------------------------------------------------------------------
create table if not exists public.campaign_participants (
  campaign_id         uuid not null references public.campaigns(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  personal_goal       bigint not null,
  count               bigint not null default 0,
  completed_at        timestamptz,
  completion_notified boolean not null default false,
  last_entry_at       timestamptz,
  removed_at          timestamptz,
  added_by            uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (campaign_id, user_id),
  constraint participants_goal_positive check (personal_goal > 0 and personal_goal <= 1000000000000),
  constraint participants_count_positive check (count >= 0)
);

create index if not exists campaign_participants_user_idx
  on public.campaign_participants (user_id) where removed_at is null;
create index if not exists campaign_participants_campaign_idx
  on public.campaign_participants (campaign_id) where removed_at is null;

-- ---------------------------------------------------------------------
-- Décomptes (historique permanent, jamais supprimé ni modifié)
-- Une annulation est enregistrée comme une écriture négative.
-- ---------------------------------------------------------------------
create table if not exists public.zikr_entries (
  id           bigint generated always as identity primary key,
  client_id    uuid not null,
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  user_id      uuid not null references public.profiles(id),
  amount       integer not null,
  kind         public.entry_kind not null,
  count_after  bigint not null,
  created_at   timestamptz not null default now(),
  constraint zikr_entries_client_unique unique (client_id),
  constraint zikr_entries_amount check (amount <> 0 and amount between -100000 and 100000)
);

create index if not exists zikr_entries_user_idx on public.zikr_entries (user_id, created_at desc);
create index if not exists zikr_entries_campaign_idx on public.zikr_entries (campaign_id, created_at desc);
create index if not exists zikr_entries_campaign_user_idx on public.zikr_entries (campaign_id, user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Journal des modifications importantes (permanent)
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles(id) on delete set null,
  action       text not null,
  target_user  uuid references public.profiles(id) on delete set null,
  campaign_id  uuid references public.campaigns(id) on delete set null,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_target_idx on public.audit_log (target_user, created_at desc);
create index if not exists audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_campaign_idx on public.audit_log (campaign_id, created_at desc);

-- ---------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, id desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- =====================================================================
-- Fonctions d'aide à la sécurité
-- =====================================================================
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.deleted_at is null
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active and p.deleted_at is null
  );
$$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_owner and p.is_active and p.deleted_at is null
  );
$$;

create or replace function public.owner_exists()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where is_owner and deleted_at is null);
$$;

-- Journalisation interne
create or replace function public.log_audit(
  p_actor uuid, p_action text, p_target uuid, p_campaign uuid, p_details jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, target_user, campaign_id, details)
  values (p_actor, p_action, p_target, p_campaign, coalesce(p_details, '{}'::jsonb));
$$;

-- Notifications internes
create or replace function public.notify_user(
  p_user uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  from public.profiles p
  where p.id = p_user and p.is_active and p.deleted_at is null;
$$;

create or replace function public.notify_admins(
  p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb, p_except uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb)
  from public.profiles p
  where p.role = 'admin' and p.is_active and p.deleted_at is null
    and (p_except is null or p.id <> p_except);
$$;

create or replace function public.require_admin()
returns uuid language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Vous devez être connecté.' using errcode = '28000';
  end if;
  if not public.is_admin() then
    raise exception 'Action réservée aux administrateurs.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

-- =====================================================================
-- Gestion des campagnes (administrateurs)
-- =====================================================================
create or replace function public.create_campaign(
  p_title text, p_zikr_type text, p_description text,
  p_start_date date, p_end_date date, p_global_goal bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_id uuid;
  v_name text;
begin
  if coalesce(btrim(p_title), '') = '' then raise exception 'Le titre est obligatoire.'; end if;
  if coalesce(btrim(p_zikr_type), '') = '' then raise exception 'Le type de Zikr est obligatoire.'; end if;
  if p_global_goal is null or p_global_goal <= 0 then raise exception 'L''objectif global doit être supérieur à zéro.'; end if;
  if p_end_date is not null and p_end_date < coalesce(p_start_date, current_date) then
    raise exception 'La date de fin doit être postérieure ou égale à la date de début.';
  end if;

  insert into public.campaigns (title, zikr_type, description, start_date, end_date, global_goal, created_by)
  values (btrim(p_title), btrim(p_zikr_type), nullif(btrim(coalesce(p_description, '')), ''),
          coalesce(p_start_date, current_date), p_end_date, p_global_goal, v_uid)
  returning id into v_id;

  select full_name into v_name from public.profiles where id = v_uid;

  perform public.log_audit(v_uid, 'campagne_creee', null, v_id,
    jsonb_build_object('titre', btrim(p_title), 'type', btrim(p_zikr_type), 'objectif', p_global_goal));

  perform public.notify_admins('campagne_creee', 'Nouvelle campagne',
    format('%s a créé la campagne « %s » (%s %s).', v_name, btrim(p_title), p_global_goal, btrim(p_zikr_type)),
    jsonb_build_object('campaign_id', v_id), v_uid);

  return v_id;
end $$;

create or replace function public.update_campaign(
  p_id uuid, p_title text, p_zikr_type text, p_description text,
  p_start_date date, p_end_date date, p_global_goal bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_old public.campaigns;
begin
  select * into v_old from public.campaigns where id = p_id for update;
  if not found then raise exception 'Campagne introuvable.'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'Le titre est obligatoire.'; end if;
  if coalesce(btrim(p_zikr_type), '') = '' then raise exception 'Le type de Zikr est obligatoire.'; end if;
  if p_global_goal is null or p_global_goal <= 0 then raise exception 'L''objectif global doit être supérieur à zéro.'; end if;
  if p_end_date is not null and p_end_date < coalesce(p_start_date, v_old.start_date) then
    raise exception 'La date de fin doit être postérieure ou égale à la date de début.';
  end if;

  update public.campaigns set
    title = btrim(p_title),
    zikr_type = btrim(p_zikr_type),
    description = nullif(btrim(coalesce(p_description, '')), ''),
    start_date = coalesce(p_start_date, v_old.start_date),
    end_date = p_end_date,
    global_goal = p_global_goal,
    goal_reached_at = case
      when total_count >= p_global_goal then coalesce(goal_reached_at, now())
      else null end,
    updated_at = now()
  where id = p_id;

  perform public.log_audit(v_uid, 'campagne_modifiee', null, p_id, jsonb_build_object(
    'avant', jsonb_build_object('titre', v_old.title, 'type', v_old.zikr_type, 'objectif', v_old.global_goal,
                                'debut', v_old.start_date, 'fin', v_old.end_date),
    'apres', jsonb_build_object('titre', btrim(p_title), 'type', btrim(p_zikr_type), 'objectif', p_global_goal,
                                'debut', coalesce(p_start_date, v_old.start_date), 'fin', p_end_date)));
end $$;

create or replace function public.set_campaign_status(p_id uuid, p_status public.campaign_status)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_old public.campaigns;
begin
  select * into v_old from public.campaigns where id = p_id for update;
  if not found then raise exception 'Campagne introuvable.'; end if;
  if v_old.status = p_status then return; end if;

  update public.campaigns
  set status = p_status,
      closed_at = case when p_status = 'terminee' then now() else null end,
      updated_at = now()
  where id = p_id;

  perform public.log_audit(v_uid,
    case when p_status = 'terminee' then 'campagne_cloturee' else 'campagne_rouverte' end,
    null, p_id, jsonb_build_object('titre', v_old.title));
end $$;

create or replace function public.delete_campaign(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_old public.campaigns;
begin
  select * into v_old from public.campaigns where id = p_id for update;
  if not found then raise exception 'Campagne introuvable.'; end if;
  if exists (select 1 from public.zikr_entries where campaign_id = p_id) then
    raise exception 'Cette campagne contient déjà des décomptes : elle ne peut pas être supprimée. Vous pouvez la clôturer.';
  end if;
  perform public.log_audit(v_uid, 'campagne_supprimee', null, null,
    jsonb_build_object('titre', v_old.title, 'campaign_id', p_id));
  delete from public.campaigns where id = p_id;
end $$;

-- Remplace la liste des participants cochés et leurs objectifs.
-- p_items : [{"user_id": "...", "goal": 500}, ...]
create or replace function public.set_campaign_participants(p_campaign uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_c public.campaigns;
  v_item jsonb;
  v_user uuid;
  v_goal bigint;
  v_existing public.campaign_participants;
  v_added int := 0; v_updated int := 0; v_removed int := 0;
  v_ids uuid[] := '{}';
begin
  select * into v_c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'Campagne introuvable.'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Liste de participants invalide.';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_user := (v_item->>'user_id')::uuid;
    v_goal := (v_item->>'goal')::bigint;
    if v_goal is null or v_goal <= 0 then
      raise exception 'Chaque participant doit avoir un objectif personnel supérieur à zéro.';
    end if;
    if v_user = any(v_ids) then continue; end if;
    v_ids := v_ids || v_user;

    if not exists (select 1 from public.profiles where id = v_user and deleted_at is null) then
      raise exception 'Participant introuvable.';
    end if;

    select * into v_existing from public.campaign_participants
    where campaign_id = p_campaign and user_id = v_user for update;

    if not found then
      insert into public.campaign_participants (campaign_id, user_id, personal_goal, added_by)
      values (p_campaign, v_user, v_goal, v_uid);
      v_added := v_added + 1;
      perform public.log_audit(v_uid, 'participant_ajoute', v_user, p_campaign, jsonb_build_object('objectif', v_goal));
      perform public.notify_user(v_user, 'ajout_campagne', 'Nouvelle campagne de Zikr',
        format('Vous participez à la campagne « %s » (%s). Votre objectif : %s.', v_c.title, v_c.zikr_type, v_goal),
        jsonb_build_object('campaign_id', p_campaign));
    elsif v_existing.removed_at is not null then
      update public.campaign_participants
      set removed_at = null, personal_goal = v_goal, updated_at = now(),
          completed_at = case when count >= v_goal then coalesce(completed_at, now()) else null end
      where campaign_id = p_campaign and user_id = v_user;
      v_added := v_added + 1;
      perform public.log_audit(v_uid, 'participant_reintegre', v_user, p_campaign, jsonb_build_object('objectif', v_goal));
      perform public.notify_user(v_user, 'ajout_campagne', 'Campagne de Zikr',
        format('Vous participez de nouveau à la campagne « %s ». Votre objectif : %s.', v_c.title, v_goal),
        jsonb_build_object('campaign_id', p_campaign));
    elsif v_existing.personal_goal <> v_goal then
      update public.campaign_participants
      set personal_goal = v_goal, updated_at = now(),
          completed_at = case when count >= v_goal then coalesce(completed_at, now()) else null end,
          completion_notified = case when count >= v_goal then completion_notified else false end
      where campaign_id = p_campaign and user_id = v_user;
      v_updated := v_updated + 1;
      perform public.log_audit(v_uid, 'objectif_modifie', v_user, p_campaign,
        jsonb_build_object('avant', v_existing.personal_goal, 'apres', v_goal));
      perform public.notify_user(v_user, 'objectif_modifie', 'Objectif modifié',
        format('Votre objectif pour « %s » est maintenant de %s.', v_c.title, v_goal),
        jsonb_build_object('campaign_id', p_campaign));
    end if;
  end loop;

  -- Participants décochés : retrait (l'historique et les totaux sont conservés)
  for v_existing in
    select * from public.campaign_participants
    where campaign_id = p_campaign and removed_at is null and not (user_id = any(v_ids))
    for update
  loop
    if v_existing.count = 0 and not exists (
      select 1 from public.zikr_entries where campaign_id = p_campaign and user_id = v_existing.user_id) then
      delete from public.campaign_participants where campaign_id = p_campaign and user_id = v_existing.user_id;
    else
      update public.campaign_participants set removed_at = now(), updated_at = now()
      where campaign_id = p_campaign and user_id = v_existing.user_id;
    end if;
    v_removed := v_removed + 1;
    perform public.log_audit(v_uid, 'participant_retire', v_existing.user_id, p_campaign,
      jsonb_build_object('realise', v_existing.count, 'objectif', v_existing.personal_goal));
  end loop;

  update public.campaigns set
    participants_count = (select count(*) from public.campaign_participants
                          where campaign_id = p_campaign and removed_at is null),
    updated_at = now()
  where id = p_campaign;

  return jsonb_build_object('ajoutes', v_added, 'modifies', v_updated, 'retires', v_removed);
end $$;

create or replace function public.update_participant_goal(p_campaign uuid, p_user uuid, p_goal bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := public.require_admin();
  v_old public.campaign_participants;
  v_title text;
begin
  if p_goal is null or p_goal <= 0 then raise exception 'L''objectif doit être supérieur à zéro.'; end if;
  select * into v_old from public.campaign_participants
  where campaign_id = p_campaign and user_id = p_user and removed_at is null for update;
  if not found then raise exception 'Ce participant ne fait pas partie de la campagne.'; end if;
  if v_old.personal_goal = p_goal then return; end if;

  update public.campaign_participants
  set personal_goal = p_goal, updated_at = now(),
      completed_at = case when count >= p_goal then coalesce(completed_at, now()) else null end,
      completion_notified = case when count >= p_goal then completion_notified else false end
  where campaign_id = p_campaign and user_id = p_user;

  select title into v_title from public.campaigns where id = p_campaign;
  perform public.log_audit(v_uid, 'objectif_modifie', p_user, p_campaign,
    jsonb_build_object('avant', v_old.personal_goal, 'apres', p_goal));
  perform public.notify_user(p_user, 'objectif_modifie', 'Objectif modifié',
    format('Votre objectif pour « %s » est maintenant de %s.', v_title, p_goal),
    jsonb_build_object('campaign_id', p_campaign));
end $$;

-- =====================================================================
-- Décompte (participants)
-- p_amount > 0 : ajout ; p_amount < 0 : annulation / correction
-- p_client_id : identifiant unique généré par le téléphone (idempotence,
-- garantit qu'un envoi répété après une coupure réseau n'est compté qu'une fois)
-- =====================================================================
create or replace function public.add_zikr(p_campaign uuid, p_amount integer, p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.zikr_entries;
  v_c public.campaigns;
  v_p public.campaign_participants;
  v_new_count bigint;
  v_entry_id bigint;
  v_name text;
  v_just_completed boolean := false;
  v_goal_reached boolean := false;
  v_prev_reached timestamptz;
begin
  if v_uid is null then raise exception 'Vous devez être connecté.' using errcode = '28000'; end if;
  if p_client_id is null then raise exception 'Identifiant d''envoi manquant.'; end if;

  -- Envoi déjà traité : on renvoie l'état actuel sans recompter
  select * into v_existing from public.zikr_entries where client_id = p_client_id;
  if found then
    if v_existing.user_id <> v_uid then raise exception 'Identifiant d''envoi invalide.'; end if;
    select * into v_p from public.campaign_participants where campaign_id = v_existing.campaign_id and user_id = v_uid;
    select * into v_c from public.campaigns where id = v_existing.campaign_id;
    return jsonb_build_object('entry_id', v_existing.id, 'personal_count', v_p.count,
      'personal_goal', v_p.personal_goal, 'campaign_total', v_c.total_count,
      'global_goal', v_c.global_goal, 'updated_at', v_c.updated_at, 'duplicate', true);
  end if;

  if not public.is_active_user() then raise exception 'Votre compte est désactivé.' using errcode = '42501'; end if;
  if p_amount is null or p_amount = 0 then raise exception 'La valeur doit être différente de zéro.'; end if;
  if abs(p_amount) > 100000 then raise exception 'La valeur ne peut pas dépasser 100 000 en une seule fois.'; end if;

  -- Verrouillage dans un ordre constant (campagne puis participation)
  select * into v_c from public.campaigns where id = p_campaign for update;
  if not found then raise exception 'Campagne introuvable.'; end if;
  v_prev_reached := v_c.goal_reached_at;
  if v_c.status <> 'en_cours' then raise exception 'Cette campagne est clôturée.'; end if;
  if v_c.start_date > current_date then raise exception 'Cette campagne n''a pas encore commencé.'; end if;
  if v_c.end_date is not null and v_c.end_date < current_date then raise exception 'Cette campagne est terminée.'; end if;

  select * into v_p from public.campaign_participants
  where campaign_id = p_campaign and user_id = v_uid and removed_at is null
  for update;
  if not found then raise exception 'Vous ne participez pas à cette campagne.' using errcode = '42501'; end if;

  v_new_count := v_p.count + p_amount;
  if v_new_count < 0 then
    raise exception 'Impossible d''annuler plus que votre total réalisé (%).', v_p.count;
  end if;

  v_just_completed := v_new_count >= v_p.personal_goal and not v_p.completion_notified;

  update public.campaign_participants set
    count = v_new_count,
    last_entry_at = now(),
    updated_at = now(),
    completed_at = case when v_new_count >= personal_goal then coalesce(completed_at, now()) else null end,
    completion_notified = completion_notified or v_just_completed
  where campaign_id = p_campaign and user_id = v_uid;

  update public.campaigns set
    total_count = total_count + p_amount,
    goal_reached_at = case when goal_reached_at is null and total_count + p_amount >= global_goal then now()
                           else goal_reached_at end,
    updated_at = now()
  where id = p_campaign
  returning * into v_c;

  v_goal_reached := v_prev_reached is null and v_c.goal_reached_at is not null;

  insert into public.zikr_entries (client_id, campaign_id, user_id, amount, kind, count_after)
  values (p_client_id, p_campaign, v_uid, p_amount,
          case when p_amount > 0 then 'ajout'::public.entry_kind else 'annulation'::public.entry_kind end,
          v_new_count)
  returning id into v_entry_id;

  if v_just_completed then
    select full_name into v_name from public.profiles where id = v_uid;
    perform public.notify_user(v_uid, 'objectif_personnel_atteint', 'Objectif atteint, Machallah !',
      format('Vous avez atteint votre objectif de %s pour « %s ». Qu''Allah l''accepte.', v_p.personal_goal, v_c.title),
      jsonb_build_object('campaign_id', p_campaign));
    perform public.notify_admins('objectif_personnel_atteint', 'Objectif personnel atteint',
      format('%s a atteint son objectif de %s pour « %s ».', v_name, v_p.personal_goal, v_c.title),
      jsonb_build_object('campaign_id', p_campaign, 'user_id', v_uid), v_uid);
    perform public.log_audit(v_uid, 'objectif_personnel_atteint', v_uid, p_campaign,
      jsonb_build_object('objectif', v_p.personal_goal));
  end if;

  if v_goal_reached then
    insert into public.notifications (user_id, type, title, body, data)
    select distinct pr.id, 'objectif_global_atteint', 'Objectif global atteint, Alhamdoulillah !',
      format('La campagne « %s » a atteint son objectif de %s %s.', v_c.title, v_c.global_goal, v_c.zikr_type),
      jsonb_build_object('campaign_id', p_campaign)
    from public.profiles pr
    where pr.is_active and pr.deleted_at is null
      and (pr.role = 'admin' or exists (
        select 1 from public.campaign_participants cp
        where cp.campaign_id = p_campaign and cp.user_id = pr.id and cp.removed_at is null));
    perform public.log_audit(v_uid, 'objectif_global_atteint', null, p_campaign,
      jsonb_build_object('objectif', v_c.global_goal));
  end if;

  return jsonb_build_object('entry_id', v_entry_id, 'personal_count', v_new_count,
    'personal_goal', v_p.personal_goal, 'campaign_total', v_c.total_count,
    'global_goal', v_c.global_goal, 'updated_at', v_c.updated_at, 'duplicate', false);
exception
  when unique_violation then
    -- Envoi concurrent du même identifiant : on renvoie l'état déjà enregistré
    select * into v_existing from public.zikr_entries where client_id = p_client_id;
    select * into v_p from public.campaign_participants where campaign_id = v_existing.campaign_id and user_id = v_uid;
    select * into v_c from public.campaigns where id = v_existing.campaign_id;
    return jsonb_build_object('entry_id', v_existing.id, 'personal_count', v_p.count,
      'personal_goal', v_p.personal_goal, 'campaign_total', v_c.total_count,
      'global_goal', v_c.global_goal, 'updated_at', v_c.updated_at, 'duplicate', true);
end $$;

-- =====================================================================
-- Notifications & compte
-- =====================================================================
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if auth.uid() is null then raise exception 'Vous devez être connecté.' using errcode = '28000'; end if;
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function public.password_changed()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Vous devez être connecté.' using errcode = '28000'; end if;
  update public.profiles set must_change_password = false, updated_at = now() where id = auth.uid();
  perform public.log_audit(auth.uid(), 'mot_de_passe_modifie', auth.uid(), null, '{}'::jsonb);
end $$;

-- =====================================================================
-- Statistiques
-- =====================================================================
create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform public.require_admin();
  select jsonb_build_object(
    'campagnes_en_cours', (select count(*) from public.campaigns
                            where status = 'en_cours' and (end_date is null or end_date >= current_date)),
    'campagnes_terminees', (select count(*) from public.campaigns
                            where status = 'terminee' or end_date < current_date),
    'participants', (select count(*) from public.profiles where deleted_at is null),
    'participants_actifs', (select count(*) from public.profiles where deleted_at is null and is_active),
    'administrateurs', (select count(*) from public.profiles where deleted_at is null and role = 'admin'),
    'total_zikr', (select coalesce(sum(total_count), 0) from public.campaigns),
    'zikr_aujourdhui', (select coalesce(sum(amount), 0) from public.zikr_entries
                        where created_at >= date_trunc('day', now())),
    'objectifs_personnels_atteints', (select count(*) from public.campaign_participants
                                      where completed_at is not null and removed_at is null)
  ) into v;
  return v;
end $$;

create or replace function public.my_overview()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Vous devez être connecté.' using errcode = '28000'; end if;
  select jsonb_build_object(
    'total_zikr', (select coalesce(sum(amount), 0) from public.zikr_entries where user_id = v_uid),
    'zikr_aujourdhui', (select coalesce(sum(amount), 0) from public.zikr_entries
                        where user_id = v_uid and created_at >= date_trunc('day', now())),
    'campagnes', (select count(*) from public.campaign_participants where user_id = v_uid and removed_at is null),
    'objectifs_atteints', (select count(*) from public.campaign_participants
                           where user_id = v_uid and removed_at is null and completed_at is not null)
  ) into v;
  return v;
end $$;

-- Progression quotidienne d'une campagne (globale pour un administrateur,
-- personnelle pour un participant)
create or replace function public.campaign_daily_stats(p_campaign uuid, p_days integer default 14, p_user uuid default null)
returns table (day date, total bigint) language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := p_user;
begin
  if auth.uid() is null then raise exception 'Vous devez être connecté.' using errcode = '28000'; end if;
  if not public.is_admin() then
    if not exists (select 1 from public.campaign_participants
                   where campaign_id = p_campaign and user_id = auth.uid()) then
      raise exception 'Accès refusé.' using errcode = '42501';
    end if;
    v_user := auth.uid();
  end if;
  return query
    select d::date as day,
           coalesce((select sum(e.amount) from public.zikr_entries e
                     where e.campaign_id = p_campaign
                       and (v_user is null or e.user_id = v_user)
                       and e.created_at >= d and e.created_at < d + interval '1 day'), 0)::bigint as total
    from generate_series(date_trunc('day', now()) - make_interval(days => greatest(least(p_days, 90), 1) - 1),
                         date_trunc('day', now()), interval '1 day') d
    order by d;
end $$;

-- =====================================================================
-- Row Level Security
-- Toutes les écritures passent par les fonctions ci-dessus ou par la
-- fonction Edge sécurisée ; aucune écriture directe n'est autorisée.
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_participants enable row level security;
alter table public.zikr_entries enable row level security;
alter table public.audit_log enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.is_active_user()) and exists (
      select 1 from public.campaign_participants cp
      where cp.campaign_id = campaigns.id and cp.user_id = (select auth.uid()) and cp.removed_at is null))
  );

drop policy if exists participants_select on public.campaign_participants;
create policy participants_select on public.campaign_participants for select to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));

drop policy if exists entries_select on public.zikr_entries;
create policy entries_select on public.zikr_entries for select to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active_user())) or (select public.is_admin()));

drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ((select public.is_admin()) or (target_user = (select auth.uid()) and (select public.is_active_user())));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- Droits : lecture seule pour les comptes connectés, rien pour les anonymes
revoke all on public.profiles, public.campaigns, public.campaign_participants,
  public.zikr_entries, public.audit_log, public.notifications from anon, authenticated;
grant select on public.profiles, public.campaigns, public.campaign_participants,
  public.zikr_entries, public.audit_log, public.notifications to authenticated;

-- Fonctions : exécution contrôlée
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.owner_exists() to anon, authenticated;
grant execute on function public.is_admin(), public.is_owner(), public.is_active_user() to authenticated;
grant execute on function public.create_campaign(text, text, text, date, date, bigint) to authenticated;
grant execute on function public.update_campaign(uuid, text, text, text, date, date, bigint) to authenticated;
grant execute on function public.set_campaign_status(uuid, public.campaign_status) to authenticated;
grant execute on function public.delete_campaign(uuid) to authenticated;
grant execute on function public.set_campaign_participants(uuid, jsonb) to authenticated;
grant execute on function public.update_participant_goal(uuid, uuid, bigint) to authenticated;
grant execute on function public.add_zikr(uuid, integer, uuid) to authenticated;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
grant execute on function public.password_changed() to authenticated;
grant execute on function public.admin_overview() to authenticated;
grant execute on function public.my_overview() to authenticated;
grant execute on function public.campaign_daily_stats(uuid, integer, uuid) to authenticated;

-- Les fonctions internes ne sont accessibles qu'au service sécurisé
grant execute on function public.log_audit(uuid, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.notify_user(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.notify_admins(text, text, text, jsonb, uuid) to service_role;
grant execute on function public.require_admin() to authenticated;

grant execute on all functions in schema public to service_role;

-- Empêche que les futures fonctions soient exécutables par défaut
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- =====================================================================
-- Temps réel
-- =====================================================================
alter table public.campaigns replica identity full;
alter table public.campaign_participants replica identity full;
alter table public.notifications replica identity full;
alter table public.profiles replica identity full;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['campaigns', 'campaign_participants', 'notifications', 'profiles'] loop
      if not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
