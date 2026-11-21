// Abonnement aux notifications sur l'écran verrouillé (Web Push)
import { supabase } from "./api";

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Abonne cet appareil (après autorisation). Renvoie true si l'abonnement est actif. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const { data: key } = await supabase.rpc("zk_push_public_key");
  if (!key) return false;
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key as string) });
  }
  const json = sub.toJSON();
  const { error } = await supabase.rpc("zk_save_push_subscription", {
    p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth, p_user_agent: navigator.userAgent,
  });
  return !error;
}

/** À la déconnexion : l'appareil ne reçoit plus les notifications de ce compte. */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await supabase.rpc("zk_delete_push_subscription", { p_endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
  } catch { /* sans conséquence */ }
}
