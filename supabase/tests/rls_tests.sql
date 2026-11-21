-- Tests fonctionnels et de sécurité (exécutés en local et sur Supabase)
\set ON_ERROR_STOP 1
\set owner '00000000-0000-0000-0000-000000000001'
\set admin2 '00000000-0000-0000-0000-000000000002'
\set ahmed '00000000-0000-0000-0000-000000000003'
\set fatou '00000000-0000-0000-0000-000000000004'
\set intrus '00000000-0000-0000-0000-000000000009'

insert into public.zk_profiles (id, username, full_name, role, is_owner) values
  (:'owner', 'proprietaire', 'Propriétaire', 'admin', true),
  (:'admin2', 'admin2', 'Second Admin', 'admin', false),
  (:'ahmed', 'ahmed', 'Ahmed', 'participant', false),
  (:'fatou', 'fatou', 'Fatou', 'participant', false);

create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ECHEC : erreur attendue (%) non levée pour : %', p_like, p_sql;
exception when others then
  if sqlerrm like 'ECHEC%' or sqlerrm not like '%' || p_like || '%' then raise; end if;
  raise notice 'OK erreur attendue : %', sqlerrm;
end $$;
grant execute on function pg_temp.expect_error(text, text) to authenticated;

-- 1. Un participant ne peut pas créer de campagne
set role authenticated; select set_config('request.jwt.claim.sub', :'ahmed', false);
select pg_temp.expect_error($$select public.zk_create_campaign('X','Y',null,current_date,null,10)$$, 'réservée aux administrateurs');
-- écriture directe interdite
select pg_temp.expect_error($$insert into public.zk_campaigns(title,zikr_type,global_goal) values ('a','b',1)$$, 'permission denied');
select pg_temp.expect_error($$update public.zk_campaign_participants set count = 999999$$, 'permission denied');

-- 2. L'administrateur crée une campagne et coche les participants
select set_config('request.jwt.claim.sub', :'admin2', false);
select public.zk_create_campaign('Campagne test', 'Astaghfirullah', 'desc', current_date, null, 1000) as cid \gset
select public.zk_set_campaign_participants(:'cid', jsonb_build_array(
  jsonb_build_object('user_id', :'ahmed', 'goal', 500),
  jsonb_build_object('user_id', :'fatou', 'goal', 600)));
select pg_temp.expect_error(format($$select public.zk_set_campaign_participants(%L, '[{"user_id":"%s","goal":0}]')$$, :'cid', :'ahmed'), 'supérieur à zéro');

-- 3. Décompte du participant
select set_config('request.jwt.claim.sub', :'ahmed', false);
select public.zk_add_zikr(:'cid', 1, '10000000-0000-0000-0000-000000000001');
select public.zk_add_zikr(:'cid', 33, '10000000-0000-0000-0000-000000000002');
-- idempotence : même identifiant renvoyé deux fois
select (public.zk_add_zikr(:'cid', 33, '10000000-0000-0000-0000-000000000002')->>'duplicate')::boolean as dup \gset
\if :dup
\echo OK idempotence
\else
\echo ECHEC idempotence
select 1/0;
\endif
select public.zk_add_zikr(:'cid', -1, '10000000-0000-0000-0000-000000000003');
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', -1000, gen_random_uuid())$$, 'Impossible d''annuler');
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', 0, gen_random_uuid())$$, 'différente de zéro');
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', 200000, gen_random_uuid())$$, 'dépasser');
-- atteint l'objectif personnel (500)
select public.zk_add_zikr(:'cid', 467, '10000000-0000-0000-0000-000000000004');

-- 4. Visibilité : Ahmed voit seulement ses données
do $$ declare n int; begin
  select count(*) into n from public.zk_campaign_participants; if n <> 1 then raise exception 'ECHEC visibilité participations: %', n; end if;
  select count(*) into n from public.zk_profiles; if n <> 1 then raise exception 'ECHEC visibilité profils: %', n; end if;
  select count(*) into n from public.zk_entries where user_id <> auth.uid(); if n <> 0 then raise exception 'ECHEC visibilité décomptes'; end if;
  select count(*) into n from public.zk_campaigns; if n <> 1 then raise exception 'ECHEC visibilité campagnes'; end if;
  select count(*) into n from public.zk_notifications where type = 'objectif_personnel_atteint'; if n <> 1 then raise exception 'ECHEC notification objectif perso: %', n; end if;
  raise notice 'OK visibilité participant';
end $$;
select pg_temp.expect_error($$select public.zk_admin_overview()$$, 'réservée aux administrateurs');

-- 5. Fatou atteint l'objectif global (1000) -> notification globale
select set_config('request.jwt.claim.sub', :'fatou', false);
select public.zk_add_zikr(:'cid', 600, gen_random_uuid());
do $$ declare n int; begin
  select count(*) into n from public.zk_notifications where type = 'objectif_global_atteint';
  if n <> 1 then raise exception 'ECHEC notification globale fatou: %', n; end if;
  raise notice 'OK notification objectif global';
end $$;

-- 6. Un intrus (compte sans profil) ne voit rien et ne peut rien faire
select set_config('request.jwt.claim.sub', :'intrus', false);
do $$ declare n int; begin
  select count(*) into n from public.zk_campaigns; if n <> 0 then raise exception 'ECHEC intrus campagnes'; end if;
  select count(*) into n from public.zk_profiles; if n <> 0 then raise exception 'ECHEC intrus profils'; end if;
  raise notice 'OK intrus';
end $$;
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', 1, gen_random_uuid())$$, 'désactivé');

-- 7. Totaux et vue administrateur
select set_config('request.jwt.claim.sub', :'owner', false);
do $$ declare c public.zk_campaigns; n int; begin
  select * into c from public.zk_campaigns;
  if c.total_count <> 1100 or c.goal_reached_at is null or c.participants_count <> 2 then
    raise exception 'ECHEC totaux: % % %', c.total_count, c.goal_reached_at, c.participants_count; end if;
  select count(*) into n from public.zk_campaign_participants; if n <> 2 then raise exception 'ECHEC admin participations'; end if;
  select count(*) into n from public.zk_notifications where type = 'objectif_global_atteint'; if n <> 1 then raise exception 'ECHEC notif admin globale'; end if;
  raise notice 'OK totaux %', c.total_count;
end $$;
select public.zk_admin_overview();
select * from public.zk_campaign_daily_stats(:'cid', 3);

-- 8. Décocher Fatou : retrait doux, total conservé, elle ne peut plus compter
select public.zk_set_campaign_participants(:'cid', jsonb_build_array(jsonb_build_object('user_id', :'ahmed', 'goal', 800)));
select set_config('request.jwt.claim.sub', :'fatou', false);
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', 1, gen_random_uuid())$$, 'ne participez pas');
do $$ declare n int; begin
  select count(*) into n from public.zk_campaigns; if n <> 0 then raise exception 'ECHEC fatou voit encore la campagne'; end if;
  raise notice 'OK retrait participant';
end $$;

-- 9. Clôture et suppression
select set_config('request.jwt.claim.sub', :'owner', false);
select public.zk_set_campaign_status(:'cid', 'terminee');
select set_config('request.jwt.claim.sub', :'ahmed', false);
select pg_temp.expect_error($$select public.zk_add_zikr('$$ || :'cid' || $$', 1, gen_random_uuid())$$, 'clôturée');
select set_config('request.jwt.claim.sub', :'owner', false);
select pg_temp.expect_error($$select public.zk_delete_campaign('$$ || :'cid' || $$')$$, 'ne peut pas être supprimée');
select public.zk_create_campaign('Vide', 'Salat', null, current_date, current_date + 3, 50) as cid2 \gset
select public.zk_delete_campaign(:'cid2');
select pg_temp.expect_error($$select public.zk_create_campaign('Mauvaise', 'Salat', null, current_date, current_date - 3, 50)$$, 'date de fin');

-- 10. Fonctions internes inaccessibles aux utilisateurs
select pg_temp.expect_error($$select public.zk_notify_admins('x','x','x')$$, 'permission denied');
select pg_temp.expect_error($$select public.zk_log_audit(null,'x',null,null)$$, 'permission denied');
reset role;
select count(*) as audit_rows from public.zk_audit_log;
\echo TOUS LES TESTS SONT PASSÉS
