-- Remise à zéro des données ZIKR de la base LOCALE de test uniquement
truncate public.zk_notifications, public.zk_audit_log, public.zk_entries, public.zk_campaign_participants, public.zk_campaigns, public.zk_profiles cascade;
delete from auth.users where email like '%@ansaroudine-zikr.app';
