// ANSAROUDINE ZIKR - Envoi des notifications Web Push (écran verrouillé)
// Appelée uniquement par la base de données (en-tête secret), jamais par l'application.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let configured: { secret: string } | null = null;

async function loadConfig() {
  if (configured) return configured;
  const { data, error } = await admin.from("zk_config").select("key, value")
    .in("key", ["vapid_public_key", "vapid_private_key", "vapid_subject", "push_secret"]);
  if (error) throw new Error(error.message);
  const cfg = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  if (!cfg.vapid_public_key || !cfg.vapid_private_key || !cfg.push_secret) throw new Error("Configuration Web Push incomplète");
  webpush.setVapidDetails(cfg.vapid_subject ?? "mailto:contact@ansaroudine-zikr.app", cfg.vapid_public_key, cfg.vapid_private_key);
  configured = { secret: cfg.push_secret };
  return configured;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Méthode non autorisée", { status: 405 });
  try {
    const cfg = await loadConfig();
    if (req.headers.get("x-zk-secret") !== cfg.secret) return new Response("Accès refusé", { status: 403 });
    const { notification_id } = await req.json();

    const { data: n, error } = await admin.from("zk_notifications").select("*").eq("id", notification_id).maybeSingle();
    if (error || !n) return new Response(JSON.stringify({ ok: false }), { status: 404 });

    const { data: subs } = await admin.from("zk_push_subscriptions").select("*").eq("user_id", n.user_id);
    const campaignId = n.data?.campaign_id as string | undefined;
    const { data: profile } = await admin.from("zk_profiles").select("role").eq("id", n.user_id).maybeSingle();
    const url = campaignId ? (profile?.role === "admin" ? `/#/campagne/${campaignId}` : `/#/compteur/${campaignId}`) : "/#/notifications";
    const payload = JSON.stringify({ title: n.title, body: n.body, tag: `zk-${n.id}`, url });

    let sent = 0;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
        await admin.from("zk_push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("endpoint", s.endpoint);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // Abonnement expiré ou supprimé par l'appareil : on le retire
        if (status === 404 || status === 410) await admin.from("zk_push_subscriptions").delete().eq("endpoint", s.endpoint);
        else console.error("Envoi impossible", status, (e as Error).message);
      }
    }
    return new Response(JSON.stringify({ ok: true, sent }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
});
