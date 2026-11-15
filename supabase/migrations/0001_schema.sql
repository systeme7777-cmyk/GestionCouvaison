-- =====================================================================
-- GESTION COUVAISON — Schéma Supabase
-- Tables, sécurité (RLS), déclencheurs, historique, temps réel, stockage
-- =====================================================================

-- ---------- Schéma privé pour les fonctions d'aide (non exposé par l'API)
create schema if not exists app_private;
grant usage on schema app_private to authenticated;

-- ---------- PROFILS (1 par compte Supabase Auth)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nom text not null default '',
  email text,
  role text not null default 'en_attente'
    check (role in ('admin','operateur','lecteur','en_attente','desactive')),
  appareil text,
  derniere_connexion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Fonctions de permission
create or replace function app_private.mon_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid()
$$;
create or replace function app_private.est_membre() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin','operateur','lecteur') from public.profiles where id = auth.uid()), false)
$$;
create or replace function app_private.peut_ecrire() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role in ('admin','operateur') from public.profiles where id = auth.uid()), false)
$$;
create or replace function app_private.est_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;
grant execute on all functions in schema app_private to authenticated;

-- ---------- ESPÈCES (durées par défaut, entièrement modifiables)
create table public.especes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  duree_defaut int check (duree_defaut is null or duree_defaut between 1 and 90),
  ordre int not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- COUVEUSES
create table public.couveuses (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  capacite int not null default 0 check (capacite >= 0),
  type text,
  temperature numeric(4,1),
  humidite numeric(4,1),
  etat text not null default 'disponible' check (etat in ('disponible','occupee','maintenance')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- COUVAISONS
create sequence public.couvaison_numero_seq;

create table public.couvaisons (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  nom_lot text,
  espece text not null,
  race text,
  date_debut date not null,
  duree_jours int not null check (duree_jours between 1 and 90),
  nb_oeufs int not null check (nb_oeufs >= 0),
  couveuse_id uuid references public.couveuses(id) on delete set null,
  responsable_id uuid references public.profiles(id) on delete set null,
  observations text,
  statut text not null default 'auto' check (statut in ('auto','preparation','annulee','terminee')),
  date_fin date,
  oeufs_fecondes int check (oeufs_fecondes >= 0),
  oeufs_non_fecondes int check (oeufs_non_fecondes >= 0),
  oeufs_retires int not null default 0 check (oeufs_retires >= 0),
  oeufs_casses int not null default 0 check (oeufs_casses >= 0),
  oeufs_eclos int check (oeufs_eclos >= 0),
  oeufs_non_eclos int check (oeufs_non_eclos >= 0),
  rappels_actifs boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.couvaisons (couveuse_id);
create index on public.couvaisons (responsable_id);
create index on public.couvaisons (date_debut);

-- ---------- OPÉRATIONS (calendrier + rappels)
create table public.operations (
  id uuid primary key default gen_random_uuid(),
  couvaison_id uuid not null references public.couvaisons(id) on delete cascade,
  type text not null check (type in ('retournement','mirage','temperature','humidite',
        'arret_retournement','preparation_eclosion','eclosion','autre')),
  titre text,
  date_prevue date not null,
  heure time,
  rappel boolean not null default true,
  fait boolean not null default false,
  fait_par uuid references public.profiles(id) on delete set null,
  fait_le timestamptz,
  notes text,
  auto boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.operations (couvaison_id);
create index on public.operations (date_prevue);

-- ---------- MESURES (suivi du jour : température, humidité, retournements)
create table public.mesures (
  id uuid primary key default gen_random_uuid(),
  couvaison_id uuid not null references public.couvaisons(id) on delete cascade,
  date_mesure date not null,
  temperature numeric(4,1),
  humidite numeric(4,1),
  retournements int not null default 0 check (retournements >= 0),
  retournements_prevus int not null default 3 check (retournements_prevus >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couvaison_id, date_mesure)
);

-- ---------- MIRAGES (contrôle à la lampe)
create table public.mirages (
  id uuid primary key default gen_random_uuid(),
  couvaison_id uuid not null references public.couvaisons(id) on delete cascade,
  date_mirage date not null,
  fecondes int not null default 0 check (fecondes >= 0),
  clairs int not null default 0 check (clairs >= 0),
  morts int not null default 0 check (morts >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.mirages (couvaison_id);

-- ---------- PHOTOS (fichiers dans le bucket « photos »)
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  couvaison_id uuid not null references public.couvaisons(id) on delete cascade,
  chemin text not null,
  legende text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.photos (couvaison_id);

-- ---------- HISTORIQUE DES MODIFICATIONS (alimenté uniquement par déclencheurs)
create table public.historique (
  id uuid primary key default gen_random_uuid(),
  table_nom text not null,
  enregistrement_id uuid,
  couvaison_id uuid,
  action text not null,
  resume text,
  libelle text,
  utilisateur_id uuid references public.profiles(id) on delete set null,
  utilisateur_nom text,
  changements jsonb,
  created_at timestamptz not null default now()
);
create index on public.historique (created_at desc);
create index on public.historique (couvaison_id);
create index on public.historique (utilisateur_id);

-- =====================================================================
-- DÉCLENCHEURS
-- =====================================================================

-- Création automatique du profil : 1er compte = administrateur, les suivants en attente
create or replace function app_private.nouveau_compte() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nom, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'nom'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles where role = 'admin') then 'en_attente' else 'admin' end
  );
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.nouveau_compte();

-- Protection des profils : rôles modifiables par l'admin seulement, limite de 5 actifs
create or replace function app_private.proteger_profil() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actifs int; admins int;
begin
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.role is distinct from old.role then
    if auth.uid() is not null and not app_private.est_admin() then
      raise exception 'Seul un administrateur peut modifier les rôles';
    end if;
    if new.role in ('admin','operateur','lecteur') and old.role not in ('admin','operateur','lecteur') then
      select count(*) into actifs from public.profiles where role in ('admin','operateur','lecteur');
      if actifs >= 5 then
        raise exception 'Limite atteinte : 5 utilisateurs actifs maximum';
      end if;
    end if;
    if old.role = 'admin' and new.role <> 'admin' then
      select count(*) into admins from public.profiles where role = 'admin';
      if admins <= 1 then
        raise exception 'Il doit rester au moins un administrateur';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger proteger_profil before update on public.profiles
  for each row execute function app_private.proteger_profil();

-- Métadonnées : auteur et dates gérés par le serveur
create or replace function app_private.set_meta() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  if tg_op = 'INSERT' then
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['especes','couveuses','couvaisons','operations','mesures','mirages','photos'] loop
    execute format('create trigger set_meta before insert or update on public.%I
                    for each row execute function app_private.set_meta()', t);
  end loop;
end $$;

-- Numéro unique de couvaison : CV-AAAA-0001
create or replace function app_private.numero_couvaison() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.numero := coalesce(old.numero, new.numero);
  end if;
  if new.numero is null or new.numero = '' then
    new.numero := 'CV-' || to_char(new.date_debut, 'YYYY') || '-' ||
                  lpad(nextval('public.couvaison_numero_seq')::text, 4, '0');
  end if;
  return new;
end $$;
create trigger numero_couvaison before insert or update on public.couvaisons
  for each row execute function app_private.numero_couvaison();

-- Fait par / fait le pour les opérations
create or replace function app_private.operation_faite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.fait and (tg_op = 'INSERT' or not old.fait) then
    new.fait_par := coalesce(auth.uid(), new.fait_par);
    new.fait_le := now();
  elsif not new.fait then
    new.fait_par := null;
    new.fait_le := null;
  end if;
  return new;
end $$;
create trigger operation_faite before insert or update on public.operations
  for each row execute function app_private.operation_faite();

-- État des couveuses : occupée / disponible selon les couvaisons actives (maintenance conservée)
create or replace function app_private.recalculer_couveuse(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_etat text;
begin
  if p_id is null then return; end if;
  v_etat := case when exists (
      select 1 from public.couvaisons
      where couveuse_id = p_id and statut not in ('annulee','terminee')
    ) then 'occupee' else 'disponible' end;
  update public.couveuses set etat = v_etat
   where id = p_id and etat <> 'maintenance' and etat <> v_etat;
end $$;

create or replace function app_private.maj_couveuses() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform app_private.recalculer_couveuse(old.couveuse_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform app_private.recalculer_couveuse(new.couveuse_id); end if;
  return null;
end $$;
create trigger maj_couveuses after insert or update of couveuse_id, statut or delete on public.couvaisons
  for each row execute function app_private.maj_couveuses();

-- Journal (historique des modifications)
create or replace function app_private.journaliser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_nom text;
  v_new jsonb;
  v_old jsonb;
  v_rec jsonb;
  v_couv uuid;
  v_libelle text;
  v_resume text;
  v_chg jsonb;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
  v_rec := coalesce(v_new, v_old);

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('avant', v_old->key, 'apres', value))
      into v_chg
      from jsonb_each(v_new)
     where (v_old->key) is distinct from value
       and key not in ('updated_at','updated_by');
    if v_chg is null then return null; end if;
  elsif tg_op = 'INSERT' then
    v_chg := v_new;
  else
    v_chg := v_old;
  end if;

  select nom into v_nom from public.profiles where id = v_uid;

  if tg_table_name = 'couvaisons' then
    v_couv := (v_rec->>'id')::uuid;
    v_libelle := coalesce(nullif(v_rec->>'nom_lot',''), v_rec->>'numero');
  elsif tg_table_name in ('operations','mesures','mirages','photos') then
    v_couv := (v_rec->>'couvaison_id')::uuid;
    select coalesce(nullif(c.nom_lot,''), c.numero) into v_libelle from public.couvaisons c where c.id = v_couv;
  else
    v_libelle := v_rec->>'nom';
  end if;

  v_resume := case tg_table_name
    when 'couvaisons' then
      case tg_op when 'INSERT' then 'a créé la couvaison'
                 when 'DELETE' then 'a supprimé la couvaison'
                 else case
                   when v_chg ? 'statut' and v_new->>'statut' = 'terminee' then 'a clôturé l''éclosion'
                   when v_chg ? 'statut' and v_new->>'statut' = 'annulee' then 'a annulé la couvaison'
                   else 'a modifié la couvaison' end
      end
    when 'operations' then
      case tg_op when 'INSERT' then 'a planifié « ' || coalesce(v_rec->>'titre', v_rec->>'type') || ' »'
                 when 'DELETE' then 'a supprimé « ' || coalesce(v_rec->>'titre', v_rec->>'type') || ' »'
                 else case
                   when v_chg ? 'fait' and (v_new->>'fait')::boolean then 'a validé « ' || coalesce(v_rec->>'titre', v_rec->>'type') || ' »'
                   when v_chg ? 'fait' then 'a rouvert « ' || coalesce(v_rec->>'titre', v_rec->>'type') || ' »'
                   else 'a modifié « ' || coalesce(v_rec->>'titre', v_rec->>'type') || ' »' end
      end
    when 'mesures' then
      case tg_op when 'DELETE' then 'a supprimé un suivi'
                 else 'a saisi le suivi' ||
                   coalesce(' ' || replace((v_rec->>'temperature'), '.', ',') || ' °C', '') ||
                   coalesce(' · ' || (v_rec->>'humidite') || ' %', '') ||
                   ' · ' || (v_rec->>'retournements') || ' retournement(s)'
      end
    when 'mirages' then
      case tg_op when 'INSERT' then 'a enregistré un mirage (' || (v_rec->>'fecondes') || ' fécondés)'
                 when 'DELETE' then 'a supprimé un mirage'
                 else 'a modifié un mirage' end
    when 'photos' then
      case tg_op when 'DELETE' then 'a supprimé une photo' else 'a ajouté une photo' end
    when 'couveuses' then
      case tg_op when 'INSERT' then 'a ajouté la couveuse'
                 when 'DELETE' then 'a supprimé la couveuse'
                 else 'a modifié la couveuse' end
    when 'especes' then
      case tg_op when 'INSERT' then 'a ajouté l''espèce'
                 when 'DELETE' then 'a supprimé l''espèce'
                 else 'a modifié l''espèce' end
    else tg_op
  end;

  insert into public.historique (table_nom, enregistrement_id, couvaison_id, action, resume, libelle,
                                 utilisateur_id, utilisateur_nom, changements)
  values (tg_table_name, (v_rec->>'id')::uuid, v_couv, tg_op, v_resume, v_libelle,
          v_uid, coalesce(v_nom, 'Système'), v_chg);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['especes','couveuses','couvaisons','operations','mesures','mirages','photos'] loop
    execute format('create trigger journaliser after insert or update or delete on public.%I
                    for each row execute function app_private.journaliser()', t);
  end loop;
end $$;

-- =====================================================================
-- SÉCURITÉ : ROW LEVEL SECURITY
--   admin      : tout, y compris gestion des membres et suppressions
--   operateur  : lecture + ajout + modification (+ suppression des suivis, opérations, mirages, photos)
--   lecteur    : lecture seule
--   en_attente / desactive : aucun accès aux données
-- =====================================================================
alter table public.profiles   enable row level security;
alter table public.especes    enable row level security;
alter table public.couveuses  enable row level security;
alter table public.couvaisons enable row level security;
alter table public.operations enable row level security;
alter table public.mesures    enable row level security;
alter table public.mirages    enable row level security;
alter table public.photos     enable row level security;
alter table public.historique enable row level security;

create policy "profil: lecture" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select app_private.est_membre()));
create policy "profil: modification" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select app_private.est_admin()))
  with check (id = (select auth.uid()) or (select app_private.est_admin()));

do $$
declare t text;
begin
  foreach t in array array['especes','couveuses','couvaisons','operations','mesures','mirages','photos'] loop
    execute format('create policy "lecture membres" on public.%I for select to authenticated
                    using ((select app_private.est_membre()))', t);
    execute format('create policy "ajout" on public.%I for insert to authenticated
                    with check ((select app_private.peut_ecrire()))', t);
    execute format('create policy "modification" on public.%I for update to authenticated
                    using ((select app_private.peut_ecrire())) with check ((select app_private.peut_ecrire()))', t);
  end loop;
  foreach t in array array['especes','couveuses','couvaisons'] loop
    execute format('create policy "suppression admin" on public.%I for delete to authenticated
                    using ((select app_private.est_admin()))', t);
  end loop;
  foreach t in array array['operations','mesures','mirages','photos'] loop
    execute format('create policy "suppression" on public.%I for delete to authenticated
                    using ((select app_private.peut_ecrire()))', t);
  end loop;
end $$;

create policy "historique: lecture" on public.historique for select to authenticated
  using ((select app_private.est_membre()));

-- =====================================================================
-- TEMPS RÉEL
-- =====================================================================
alter publication supabase_realtime add table
  public.profiles, public.especes, public.couveuses, public.couvaisons,
  public.operations, public.mesures, public.mirages, public.photos, public.historique;

-- =====================================================================
-- STOCKAGE DES PHOTOS (bucket privé)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "photos: lecture membres" on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (select app_private.est_membre()));
create policy "photos: ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (select app_private.peut_ecrire()));
create policy "photos: modification" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (select app_private.peut_ecrire()));
create policy "photos: suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (select app_private.peut_ecrire()));

-- =====================================================================
-- DONNÉES DE RÉFÉRENCE : espèces et durées par défaut (modifiables dans l'app)
-- =====================================================================
insert into public.especes (nom, duree_defaut, ordre) values
  ('Poule', 21, 1),
  ('Pintade', 28, 2),
  ('Canard', 28, 3),
  ('Dinde', 28, 4),
  ('Caille', 17, 5),
  ('Oie', 30, 6),
  ('Autre', null, 99);
