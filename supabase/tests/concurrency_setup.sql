insert into public.profiles (id, username, full_name, role)
select ('20000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'charge' || i, 'Participant ' || i, 'participant'
from generate_series(1, 50) i;
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', false);
select public.create_campaign('Charge', 'La ilaha illa Allah', null, current_date, null, 1000000) as cid \gset
select public.set_campaign_participants(:'cid', (select jsonb_agg(jsonb_build_object('user_id', id, 'goal', 100)) from public.profiles where username like 'charge%'));
\o /tmp/cid.txt
\qecho :cid
