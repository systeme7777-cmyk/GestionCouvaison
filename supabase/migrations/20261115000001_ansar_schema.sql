-- =====================================================================
-- ANSAR ELEVAGE — Schéma de base de données (préfixe ae_)
-- Toutes les tables partagent : id uuid, created_at, updated_at,
-- created_by, updated_by, deleted_at (suppression logique pour la
-- synchronisation entre téléphones).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Profils utilisateurs
-- ---------------------------------------------------------------------
create table if not exists public.ae_profils (
  id uuid primary key,                       -- = auth.users.id
  nom text not null default '',
  prenom text not null default '',
  telephone text,
  email text not null,
  role text not null default 'employe'
    check (role in ('admin_principal','admin','gestionnaire','employe')),
  permissions jsonb not null default '{}'::jsonb,
  actif boolean not null default true,
  supprime boolean not null default false,
  doit_changer_mdp boolean not null default false,
  derniere_connexion timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);
create unique index if not exists ae_profils_email_uq on public.ae_profils (lower(email));

-- Permission : module + action (lire, ajouter, modifier, supprimer)
create or replace function public.ae_peut(m text, a text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ae_profils p
    where p.id = auth.uid() and p.actif and not p.supprime
      and (p.role = 'admin_principal'
           or coalesce((p.permissions -> m ->> a)::boolean, false))
  );
$$;

create or replace function public.ae_peut_un(mods text[], a text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.ae_profils p
    where p.id = auth.uid() and p.actif and not p.supprime
      and (p.role = 'admin_principal'
           or exists (select 1 from unnest(mods) m
                      where coalesce((p.permissions -> m ->> a)::boolean, false)))
  );
$$;

create or replace function public.ae_est_actif()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ae_profils p
                 where p.id = auth.uid() and p.actif and not p.supprime);
$$;

create or replace function public.ae_est_principal()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.ae_profils p
                 where p.id = auth.uid() and p.actif and not p.supprime
                   and p.role = 'admin_principal');
$$;

-- ---------------------------------------------------------------------
-- Journal (historique de toutes les opérations)
-- ---------------------------------------------------------------------
create table if not exists public.ae_journal (
  id bigint generated always as identity primary key,
  table_nom text not null,
  enregistrement_id uuid,
  action text not null,          -- creation | modification | suppression | restauration
  user_id uuid,
  fait_le timestamptz not null default now(),
  donnees jsonb,
  anciennes jsonb
);
create index if not exists ae_journal_fait_le_idx on public.ae_journal (fait_le desc);
create index if not exists ae_journal_enr_idx on public.ae_journal (enregistrement_id);
create index if not exists ae_journal_user_idx on public.ae_journal (user_id);

-- ---------------------------------------------------------------------
-- Déclencheurs génériques
-- ---------------------------------------------------------------------
-- TG_ARGV[0] = liste de modules séparés par des virgules (droits requis)
create or replace function public.ae_touch()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mods text[] := string_to_array(coalesce(tg_argv[0], ''), ',');
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    if new.created_at is null or new.created_at > now() + interval '5 minutes' then
      new.created_at := now();
    end if;
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.created_by);
    return new;
  end if;

  -- UPDATE : détection de conflit (le client renvoie l'updated_at qu'il connaissait)
  if new.updated_at is distinct from old.updated_at and new.updated_at < old.updated_at then
    raise exception 'AE_CONFLIT: cet enregistrement a été modifié par un autre utilisateur'
      using errcode = 'P0409';
  end if;

  -- Contrôle des droits (hors appels serveur internes sans utilisateur)
  if auth.uid() is not null and array_length(mods, 1) > 0 and pg_trigger_depth() = 1 then
    if new.deleted_at is distinct from old.deleted_at then
      if not public.ae_peut_un(mods, 'supprimer') then
        raise exception 'AE_DROITS: suppression non autorisée' using errcode = '42501';
      end if;
    else
      if not public.ae_peut_un(mods, 'modifier') then
        raise exception 'AE_DROITS: modification non autorisée' using errcode = '42501';
      end if;
    end if;
  end if;

  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create or replace function public.ae_journaliser()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  act text;
  diff jsonb;
  n jsonb;
  o jsonb;
begin
  if tg_op = 'INSERT' then
    act := 'creation';
    n := to_jsonb(new);
  elsif tg_op = 'UPDATE' then
    n := to_jsonb(new); o := to_jsonb(old);
    if (o ->> 'deleted_at') is null and (n ->> 'deleted_at') is not null then
      act := 'suppression';
    elsif (o ->> 'deleted_at') is not null and (n ->> 'deleted_at') is null then
      act := 'restauration';
    else
      act := 'modification';
    end if;
    select coalesce(jsonb_object_agg(k, o -> k), '{}'::jsonb) into diff
      from jsonb_object_keys(n) k
      where k not in ('updated_at','updated_by') and (n -> k) is distinct from (o -> k);
    if act = 'modification' and diff = '{}'::jsonb then
      return null;
    end if;
  else
    act := 'suppression_definitive';
    o := to_jsonb(old);
  end if;

  insert into public.ae_journal (table_nom, enregistrement_id, action, user_id, donnees, anciennes)
  values (tg_table_name,
          coalesce((n ->> 'id')::uuid, (o ->> 'id')::uuid),
          act,
          coalesce(auth.uid(), (n ->> 'updated_by')::uuid),
          case when tg_op = 'DELETE' then null else n end,
          case when tg_op = 'INSERT' then null else coalesce(diff, o) end);
  return null;
end $$;

-- Ajoute les colonnes communes + déclencheurs + RLS à une table métier
create or replace function public.ae__installer_table(t text, mods_ecriture text, mods_lecture text)
returns void language plpgsql as $$
declare
  ml text := quote_literal('{' || mods_lecture || '}');
  me text := quote_literal('{' || mods_ecriture || '}');
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('drop trigger if exists ae_touch on public.%I', t);
  execute format('create trigger ae_touch before insert or update on public.%I
                  for each row execute function public.ae_touch(%L)', t, mods_ecriture);
  execute format('drop trigger if exists ae_journal on public.%I', t);
  execute format('create trigger ae_journal after insert or update or delete on public.%I
                  for each row execute function public.ae_journaliser()', t);
  execute format('create index if not exists %I on public.%I (updated_at)', t || '_maj_idx', t);

  execute format('drop policy if exists ae_lire on public.%I', t);
  execute format('drop policy if exists ae_ajouter on public.%I', t);
  execute format('drop policy if exists ae_modifier on public.%I', t);
  if mods_lecture = '*' then
    execute format('create policy ae_lire on public.%I for select to authenticated
                    using (public.ae_est_actif())', t);
  else
    execute format('create policy ae_lire on public.%I for select to authenticated
                    using (public.ae_peut_un(%s::text[], ''lire''))', t, ml);
  end if;
  execute format('create policy ae_ajouter on public.%I for insert to authenticated
                  with check (public.ae_peut_un(%s::text[], ''ajouter''))', t, me);
  execute format('create policy ae_modifier on public.%I for update to authenticated
                  using (public.ae_peut_un(%s::text[], ''modifier'') or public.ae_peut_un(%s::text[], ''supprimer''))
                  with check (public.ae_peut_un(%s::text[], ''modifier'') or public.ae_peut_un(%s::text[], ''supprimer''))',
                 t, me, me, me, me);
  -- Pas de politique DELETE : les suppressions sont logiques (deleted_at).
end $$;

-- ---------------------------------------------------------------------
-- Tables de référence
-- ---------------------------------------------------------------------
create table if not exists public.ae_parametres (
  id uuid primary key default gen_random_uuid(),
  cle text not null unique,
  valeur jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_especes (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  icone text,
  ordre int not null default 100,
  actif boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_categories (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null default 'autre' check (type in ('animaux','oeufs','derives','autre')),
  ordre int not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_produits (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  espece_id uuid references public.ae_especes(id),
  categorie_id uuid references public.ae_categories(id),
  unite text not null default 'unité',
  stockable boolean not null default true,
  seuil_alerte numeric(14,3) not null default 0,
  prix_vente numeric(14,2),
  categorie_revenu text not null default 'Autres revenus',
  actif boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  adresse text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_fournisseurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  telephone text,
  adresse text,
  notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

-- ---------------------------------------------------------------------
-- Élevage : lots et évènements
-- ---------------------------------------------------------------------
create table if not exists public.ae_lots (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  espece_id uuid references public.ae_especes(id),
  produit_id uuid references public.ae_produits(id),   -- produit de stock correspondant (facultatif)
  race text,
  date_arrivee date not null default current_date,
  effectif_initial int not null default 0 check (effectif_initial >= 0),
  males int not null default 0 check (males >= 0),
  femelles int not null default 0 check (femelles >= 0),
  age_arrivee_jours int not null default 0 check (age_arrivee_jours >= 0),
  provenance text,
  cout_achat numeric(14,2) not null default 0 check (cout_achat >= 0),
  statut text not null default 'actif' check (statut in ('actif','cloture')),
  observations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_lot_evenements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.ae_lots(id),
  date date not null default current_date,
  type text not null check (type in ('naissance','deces','reforme','transfert','ajustement')),
  quantite int not null,
  lot_dest_id uuid references public.ae_lots(id),
  cause text,
  observations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check (type = 'ajustement' or quantite > 0),
  check (type <> 'transfert' or (lot_dest_id is not null and lot_dest_id <> lot_id))
);
create index if not exists ae_lot_ev_lot_idx on public.ae_lot_evenements (lot_id);

-- ---------------------------------------------------------------------
-- Achats / Ventes / Paiements
-- ---------------------------------------------------------------------
create table if not exists public.ae_achats (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  fournisseur_id uuid references public.ae_fournisseurs(id),
  fournisseur_nom text,
  espece_id uuid references public.ae_especes(id),
  categorie_id uuid references public.ae_categories(id),
  produit_id uuid not null references public.ae_produits(id),
  lot_id uuid references public.ae_lots(id),
  quantite numeric(14,3) not null check (quantite > 0),
  unite text,
  prix_unitaire numeric(14,2) not null default 0 check (prix_unitaire >= 0),
  montant_total numeric(16,2) generated always as (round(quantite * prix_unitaire, 2)) stored,
  montant_paye numeric(16,2) not null default 0 check (montant_paye >= 0),
  mode_paiement text,
  ajoute_stock boolean not null default true,
  observations text,
  justificatif_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check (montant_paye <= round(quantite * prix_unitaire, 2))
);
create index if not exists ae_achats_produit_idx on public.ae_achats (produit_id);

create table if not exists public.ae_ventes (
  id uuid primary key default gen_random_uuid(),
  numero text,
  date date not null default current_date,
  client_id uuid references public.ae_clients(id),
  client_nom text,
  espece_id uuid references public.ae_especes(id),
  categorie_id uuid references public.ae_categories(id),
  produit_id uuid not null references public.ae_produits(id),
  lot_id uuid references public.ae_lots(id),
  quantite numeric(14,3) not null check (quantite > 0),
  unite text,
  prix_unitaire numeric(14,2) not null default 0 check (prix_unitaire >= 0),
  montant_total numeric(16,2) generated always as (round(quantite * prix_unitaire, 2)) stored,
  montant_encaisse numeric(16,2) not null default 0 check (montant_encaisse >= 0),
  mode_paiement text,
  observations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check (montant_encaisse <= round(quantite * prix_unitaire, 2))
);
create index if not exists ae_ventes_produit_idx on public.ae_ventes (produit_id);

create table if not exists public.ae_paiements (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null check (type in ('encaissement','decaissement')),
  vente_id uuid references public.ae_ventes(id),
  achat_id uuid references public.ae_achats(id),
  montant numeric(16,2) not null check (montant > 0),
  mode_paiement text,
  observations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check ((type = 'encaissement' and vente_id is not null and achat_id is null)
      or (type = 'decaissement' and achat_id is not null and vente_id is null))
);

-- ---------------------------------------------------------------------
-- Dépenses / Revenus
-- ---------------------------------------------------------------------
create table if not exists public.ae_depenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  categorie text not null,
  description text,
  montant numeric(16,2) not null check (montant > 0),
  mode_paiement text,
  fournisseur_id uuid references public.ae_fournisseurs(id),
  fournisseur_nom text,
  espece_id uuid references public.ae_especes(id),
  lot_id uuid references public.ae_lots(id),
  justificatif_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

create table if not exists public.ae_revenus (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  categorie text not null,
  description text,
  montant numeric(16,2) not null check (montant > 0),
  mode_paiement text,
  client_id uuid references public.ae_clients(id),
  client_nom text,
  espece_id uuid references public.ae_especes(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz
);

-- ---------------------------------------------------------------------
-- Production quotidienne et mouvements de stock
-- ---------------------------------------------------------------------
create table if not exists public.ae_productions (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  lot_id uuid references public.ae_lots(id),
  espece_id uuid references public.ae_especes(id),
  oeufs_pondus int not null default 0 check (oeufs_pondus >= 0),
  oeufs_casses int not null default 0 check (oeufs_casses >= 0),
  oeufs_commercialisables int not null default 0 check (oeufs_commercialisables >= 0),
  oeufs_fecondes int not null default 0 check (oeufs_fecondes >= 0),
  oeufs_couveuse int not null default 0 check (oeufs_couveuse >= 0),
  viande_kg numeric(14,3) not null default 0 check (viande_kg >= 0),
  fientes_kg numeric(14,3) not null default 0 check (fientes_kg >= 0),
  produit_oeufs_id uuid references public.ae_produits(id),
  produit_fecondes_id uuid references public.ae_produits(id),
  produit_viande_id uuid references public.ae_produits(id),
  produit_fientes_id uuid references public.ae_produits(id),
  valide boolean not null default false,
  valide_le timestamptz,
  valide_par uuid,
  observations text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check (oeufs_casses + oeufs_commercialisables <= oeufs_pondus or oeufs_pondus = 0),
  check (oeufs_couveuse <= oeufs_fecondes or oeufs_fecondes = 0)
);

create table if not exists public.ae_mouvements (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  produit_id uuid not null references public.ae_produits(id),
  type text not null check (type in ('initial','production','perte','mort','correction')),
  quantite numeric(14,3) not null,
  lot_id uuid references public.ae_lots(id),
  source text,          -- 'manuel' | 'production'
  source_id uuid,
  motif text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(), updated_by uuid, deleted_at timestamptz,
  check (type = 'correction' or quantite > 0)
);
create index if not exists ae_mvt_produit_idx on public.ae_mouvements (produit_id);
create index if not exists ae_mvt_source_idx on public.ae_mouvements (source_id);

-- ---------------------------------------------------------------------
-- Installation des déclencheurs et des règles RLS
--   (table, modules en écriture, modules en lecture)
-- ---------------------------------------------------------------------
select public.ae__installer_table('ae_parametres',   'parametres', '*');
select public.ae__installer_table('ae_especes',      'catalogue',  '*');
select public.ae__installer_table('ae_categories',   'catalogue',  '*');
select public.ae__installer_table('ae_produits',     'catalogue',  '*');
select public.ae__installer_table('ae_clients',      'clients,ventes,revenus',
                                  'clients,ventes,revenus,finances');
select public.ae__installer_table('ae_fournisseurs', 'fournisseurs,achats,depenses',
                                  'fournisseurs,achats,depenses,finances');
select public.ae__installer_table('ae_lots',         'elevage',
                                  'elevage,production,ventes,achats,stocks,depenses,finances');
select public.ae__installer_table('ae_lot_evenements','elevage', 'elevage,stocks,production');
select public.ae__installer_table('ae_achats',       'achats',
                                  'achats,stocks,finances,fournisseurs,elevage');
select public.ae__installer_table('ae_ventes',       'ventes',
                                  'ventes,stocks,finances,clients,revenus,elevage');
select public.ae__installer_table('ae_paiements',    'ventes,achats,finances',
                                  'ventes,achats,finances,clients,fournisseurs,revenus');
select public.ae__installer_table('ae_depenses',     'depenses', 'depenses,finances');
select public.ae__installer_table('ae_revenus',      'revenus',  'revenus,finances');
select public.ae__installer_table('ae_productions',  'production', 'production,stocks,elevage');
select public.ae__installer_table('ae_mouvements',   'stocks',  'stocks,ventes,production');

-- Profils : lecture pour tout utilisateur actif ; écriture via la fonction serveur uniquement
alter table public.ae_profils enable row level security;
drop policy if exists ae_lire on public.ae_profils;
create policy ae_lire on public.ae_profils for select to authenticated
  using (public.ae_est_actif() or id = auth.uid());
drop trigger if exists ae_journal on public.ae_profils;
create trigger ae_journal after insert or update or delete on public.ae_profils
  for each row execute function public.ae_journaliser();

-- Journal : lecture si droit « historique »
alter table public.ae_journal enable row level security;
drop policy if exists ae_lire on public.ae_journal;
create policy ae_lire on public.ae_journal for select to authenticated
  using (public.ae_peut('historique', 'lire'));

-- ---------------------------------------------------------------------
-- Calculs de stock et d'effectifs (même logique que l'application)
-- ---------------------------------------------------------------------
create or replace function public.ae_effectif_lot(p_lot uuid, p_exclure_vente uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select
    coalesce((select effectif_initial from ae_lots where id = p_lot and deleted_at is null), 0)
  + coalesce((select sum(case
        when e.lot_id = p_lot and e.type in ('naissance','ajustement') then e.quantite
        when e.lot_id = p_lot and e.type in ('deces','reforme','transfert') then -e.quantite
        when e.lot_dest_id = p_lot and e.type = 'transfert' then e.quantite
        else 0 end)
      from ae_lot_evenements e
      where e.deleted_at is null and (e.lot_id = p_lot or e.lot_dest_id = p_lot)), 0)
  + coalesce((select sum(quantite) from ae_achats
              where lot_id = p_lot and deleted_at is null), 0)
  - coalesce((select sum(quantite) from ae_ventes
              where lot_id = p_lot and deleted_at is null
                and (p_exclure_vente is null or id <> p_exclure_vente)), 0);
$$;

create or replace function public.ae_stock_disponible(p_produit uuid, p_exclure_vente uuid default null)
returns numeric language sql stable security definer set search_path = public as $$
  select
    -- lots rattachés au produit : effectif initial, naissances, décès, réformes, ajustements
    coalesce((select sum(effectif_initial) from ae_lots
              where produit_id = p_produit and deleted_at is null), 0)
  + coalesce((select sum(case
        when e.type in ('naissance','ajustement') then e.quantite
        when e.type in ('deces','reforme') then -e.quantite
        else 0 end)
      from ae_lot_evenements e join ae_lots l on l.id = e.lot_id
      where e.deleted_at is null and l.produit_id = p_produit), 0)
    -- transferts entre lots de produits différents
  + coalesce((select sum(case
        when ls.produit_id = p_produit and ld.produit_id is distinct from p_produit then -e.quantite
        when ld.produit_id = p_produit and ls.produit_id is distinct from p_produit then e.quantite
        else 0 end)
      from ae_lot_evenements e
      join ae_lots ls on ls.id = e.lot_id
      join ae_lots ld on ld.id = e.lot_dest_id
      where e.deleted_at is null and e.type = 'transfert'), 0)
  + coalesce((select sum(quantite) from ae_achats
              where produit_id = p_produit and ajoute_stock and deleted_at is null), 0)
  - coalesce((select sum(quantite) from ae_ventes
              where produit_id = p_produit and deleted_at is null
                and (p_exclure_vente is null or id <> p_exclure_vente)), 0)
  + coalesce((select sum(case when type in ('perte','mort') then -quantite else quantite end)
              from ae_mouvements where produit_id = p_produit and deleted_at is null), 0);
$$;

-- Contrôle des ventes : interdit les ventes supérieures au stock disponible
create or replace function public.ae_controle_vente()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dispo numeric;
  p record;
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if new.numero is null then
    new.numero := 'F-' || to_char(new.date, 'YYYYMMDD') || '-' || upper(substr(new.id::text, 1, 4));
  end if;
  if tg_op = 'UPDATE' and new.produit_id = old.produit_id and new.quantite <= old.quantite
     and new.lot_id is not distinct from old.lot_id and old.deleted_at is null then
    return new;   -- pas d'augmentation de quantité : rien à vérifier
  end if;
  select * into p from ae_produits where id = new.produit_id;
  -- verrou par produit pour éviter deux ventes simultanées du même stock
  perform pg_advisory_xact_lock(hashtext('ae_stock_' || new.produit_id::text));
  if p.stockable then
    dispo := public.ae_stock_disponible(new.produit_id, new.id);
    if new.quantite > dispo then
      raise exception 'AE_STOCK_INSUFFISANT: stock disponible pour « % » : % %',
        p.nom, trim(to_char(dispo, 'FM999999990.###')), p.unite using errcode = 'P0422';
    end if;
  end if;
  if new.lot_id is not null then
    dispo := public.ae_effectif_lot(new.lot_id, new.id);
    if new.quantite > dispo then
      raise exception 'AE_STOCK_INSUFFISANT: effectif du lot insuffisant (%)', dispo
        using errcode = 'P0422';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists ae_controle_vente on public.ae_ventes;
create trigger ae_controle_vente before insert or update on public.ae_ventes
  for each row execute function public.ae_controle_vente();

-- Contrôle des paiements : ne pas dépasser le reste dû
create or replace function public.ae_controle_paiement()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reste numeric;
begin
  if new.deleted_at is not null then return new; end if;
  if new.type = 'encaissement' then
    select v.montant_total - v.montant_encaisse
           - coalesce((select sum(montant) from ae_paiements x
                       where x.vente_id = v.id and x.deleted_at is null and x.id <> new.id), 0)
      into reste from ae_ventes v where v.id = new.vente_id;
  else
    select a.montant_total - a.montant_paye
           - coalesce((select sum(montant) from ae_paiements x
                       where x.achat_id = a.id and x.deleted_at is null and x.id <> new.id), 0)
      into reste from ae_achats a where a.id = new.achat_id;
  end if;
  if new.montant > coalesce(reste, 0) + 0.001 then
    raise exception 'AE_PAIEMENT_EXCESSIF: le reste dû est de %', coalesce(reste, 0)
      using errcode = 'P0422';
  end if;
  return new;
end $$;
drop trigger if exists ae_controle_paiement on public.ae_paiements;
create trigger ae_controle_paiement before insert or update on public.ae_paiements
  for each row execute function public.ae_controle_paiement();

-- Validation de la production -> mouvements de stock automatiques
create or replace function public.ae_production_vers_stock()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update ae_mouvements set deleted_at = now()
   where source = 'production' and source_id = new.id and deleted_at is null;
  if new.valide and new.deleted_at is null then
    if new.produit_oeufs_id is not null and new.oeufs_commercialisables > 0 then
      insert into ae_mouvements (date, produit_id, type, quantite, lot_id, source, source_id, motif, created_by)
      values (new.date, new.produit_oeufs_id, 'production', new.oeufs_commercialisables, new.lot_id,
              'production', new.id, 'Production validée', new.updated_by);
    end if;
    if new.produit_fecondes_id is not null and new.oeufs_fecondes - new.oeufs_couveuse > 0 then
      insert into ae_mouvements (date, produit_id, type, quantite, lot_id, source, source_id, motif, created_by)
      values (new.date, new.produit_fecondes_id, 'production', new.oeufs_fecondes - new.oeufs_couveuse,
              new.lot_id, 'production', new.id, 'Production validée (hors couveuse)', new.updated_by);
    end if;
    if new.produit_viande_id is not null and new.viande_kg > 0 then
      insert into ae_mouvements (date, produit_id, type, quantite, lot_id, source, source_id, motif, created_by)
      values (new.date, new.produit_viande_id, 'production', new.viande_kg, new.lot_id,
              'production', new.id, 'Production validée', new.updated_by);
    end if;
    if new.produit_fientes_id is not null and new.fientes_kg > 0 then
      insert into ae_mouvements (date, produit_id, type, quantite, lot_id, source, source_id, motif, created_by)
      values (new.date, new.produit_fientes_id, 'production', new.fientes_kg, new.lot_id,
              'production', new.id, 'Production validée', new.updated_by);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists ae_production_vers_stock on public.ae_productions;
create trigger ae_production_vers_stock after insert or update on public.ae_productions
  for each row execute function public.ae_production_vers_stock();

create or replace function public.ae_production_validation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.valide and (tg_op = 'INSERT' or not old.valide) then
    new.valide_le := now();
    new.valide_par := auth.uid();
  elsif not new.valide then
    new.valide_le := null;
    new.valide_par := null;
  end if;
  return new;
end $$;
drop trigger if exists ae_production_validation on public.ae_productions;
create trigger ae_production_validation before insert or update on public.ae_productions
  for each row execute function public.ae_production_validation();

-- ---------------------------------------------------------------------
-- Fonctions appelées par l'application
-- ---------------------------------------------------------------------
create or replace function public.ae_connexion()
returns public.ae_profils language plpgsql security definer set search_path = public as $$
declare
  p public.ae_profils;
begin
  update ae_profils set derniere_connexion = now()
   where id = auth.uid() and actif and not supprime
  returning * into p;
  if p.id is null then
    select * into p from ae_profils where id = auth.uid();
  end if;
  return p;
end $$;

create or replace function public.ae_mot_de_passe_change()
returns void language sql security definer set search_path = public as $$
  update ae_profils set doit_changer_mdp = false, updated_at = now() where id = auth.uid();
$$;

revoke all on function public.ae__installer_table(text, text, text) from public, anon, authenticated;
grant execute on function public.ae_connexion() to authenticated;
grant execute on function public.ae_mot_de_passe_change() to authenticated;

-- ---------------------------------------------------------------------
-- Temps réel
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ae_profils','ae_parametres','ae_especes','ae_categories','ae_produits',
    'ae_clients','ae_fournisseurs','ae_lots','ae_lot_evenements','ae_achats','ae_ventes',
    'ae_paiements','ae_depenses','ae_revenus','ae_productions','ae_mouvements']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Stockage des justificatifs (photos, factures)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('ae-justificatifs', 'ae-justificatifs', false, 10485760)
on conflict (id) do nothing;

drop policy if exists ae_justif_lire on storage.objects;
create policy ae_justif_lire on storage.objects for select to authenticated
  using (bucket_id = 'ae-justificatifs' and public.ae_peut_un('{achats,depenses,finances}', 'lire'));
drop policy if exists ae_justif_ajouter on storage.objects;
create policy ae_justif_ajouter on storage.objects for insert to authenticated
  with check (bucket_id = 'ae-justificatifs' and public.ae_peut_un('{achats,depenses}', 'ajouter'));
