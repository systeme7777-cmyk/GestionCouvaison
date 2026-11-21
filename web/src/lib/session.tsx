import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { auth, notifications as notifApi, supabase } from "./api";
import { isNetworkError } from "./errors";
import { sync } from "./sync";
import type { AppNotification, Profile } from "./types";
import { useTableChanges } from "./realtime";
import { disablePush, enablePush } from "./push";

type SessionState =
  | { kind: "loading" }
  | { kind: "signedOut"; ownerExists: boolean | null }
  | { kind: "signedIn"; profile: Profile };

interface SessionApi {
  state: SessionState;
  toast: (msg: string) => void;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  recheckOwner: () => Promise<void>;
  unread: number;
  refreshUnread: () => void;
  setUnread: (n: number) => void;
  lastNotification: AppNotification | null;
}

const Ctx = createContext<SessionApi | null>(null);
const CACHE_KEY = "zikr-profil";

export function useSession(): SessionApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider manquant");
  return v;
}

export function useProfile(): Profile {
  const { state } = useSession();
  if (state.kind !== "signedIn") throw new Error("Non connecté");
  return state.profile;
}

const readCache = (): Profile | null => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null"); } catch { return null; }
};
const writeCache = (p: Profile | null) => {
  try { if (p) localStorage.setItem(CACHE_KEY, JSON.stringify(p)); else localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
};

/** Notification système (quand l'application est ouverte ou en arrière-plan et autorisée). */
export async function showSystemNotification(n: AppNotification) {
  if (localStorage.getItem("zikr-notifs") === "off") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts: NotificationOptions = { body: n.body, icon: "/icons/icon-192.png", badge: "/icons/badge-96.png", tag: `zk-${n.id}`, data: { url: "/#/notifications" } };
    if (reg) await reg.showNotification(n.title, opts);
    else new Notification(n.title, opts);
  } catch { /* certaines plateformes refusent */ }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [unread, setUnread] = useState(0);
  const [lastNotification, setLastNotification] = useState<AppNotification | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const toast = useCallback((msg: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const signedOut = useCallback(async () => {
    sync.setUser(null);
    setState({ kind: "signedOut", ownerExists: null });
    const exists = await auth.ownerExists().catch(() => null);
    if (stateRef.current.kind === "signedOut") setState({ kind: "signedOut", ownerExists: exists });
  }, []);

  const signOut = useCallback(async () => {
    await sync.flush().catch(() => false);
    await disablePush();
    const { data } = await supabase.auth.getSession();
    sync.clearForSignOut(data.session?.user.id ?? null);
    writeCache(null);
    await auth.signOut().catch(() => undefined);
    await signedOut();
  }, [signedOut]);

  const onAuthenticated = useCallback(async (uid: string) => {
    let profile: Profile | null = null;
    try {
      profile = await auth.loadProfile();
    } catch (e) {
      if (isNetworkError(e)) profile = readCache()?.id === uid ? readCache() : null;
    }
    if (!profile) {
      if (readCache()?.id !== uid) {
        toast("Ce compte n'est pas autorisé à utiliser ANSAROUDINE ZIKR.");
        await signOut();
      }
      return;
    }
    if (profile.deleted_at || !profile.is_active) {
      toast("Ce compte est désactivé. Contactez un administrateur.");
      await signOut();
      return;
    }
    writeCache(profile);
    setState({ kind: "signedIn", profile });
    sync.setUser(profile.id);
    // Notifications sur l'écran verrouillé si déjà autorisées sur cet appareil
    void enablePush().catch(() => false);
  }, [signOut, toast]);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) void onAuthenticated(data.session.user.id);
      else void signedOut();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && stateRef.current.kind !== "signedIn") void onAuthenticated(session.user.id);
      if (event === "SIGNED_OUT") void signedOut();
    });
    const offErr = sync.onError(toast) as unknown as () => void;
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      offErr();
    };
  }, [onAuthenticated, signedOut, toast]);

  const refreshProfile = useCallback(async () => {
    const p = await auth.loadProfile().catch(() => null);
    if (p) {
      writeCache(p);
      setState({ kind: "signedIn", profile: p });
    }
  }, []);

  const recheckOwner = useCallback(async () => {
    const exists = await auth.ownerExists().catch(() => null);
    if (stateRef.current.kind === "signedOut") setState({ kind: "signedOut", ownerExists: exists });
  }, []);

  const uid = state.kind === "signedIn" ? state.profile.id : null;

  const refreshUnread = useCallback(() => {
    if (!uid) return;
    notifApi.unreadCount(uid).then(setUnread).catch(() => undefined);
  }, [uid]);

  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  // Changements de rôle ou désactivation appliqués immédiatement
  useTableChanges<Profile>("zk_profiles", uid ? `id=eq.${uid}` : null, (e) => {
    if (e.eventType !== "UPDATE") return;
    const p = e.new;
    if (p.deleted_at || !p.is_active) {
      toast("Votre compte a été désactivé.");
      void signOut();
      return;
    }
    const prev = stateRef.current.kind === "signedIn" ? stateRef.current.profile : null;
    writeCache(p);
    setState({ kind: "signedIn", profile: p });
    if (prev && prev.role !== "admin" && p.role === "admin") toast("Vous êtes maintenant administrateur.");
    if (prev && prev.role === "admin" && p.role !== "admin") toast("Vos droits d'administrateur ont été retirés.");
  }, !!uid);

  // Notifications en temps réel
  useTableChanges<AppNotification>("zk_notifications", uid ? `user_id=eq.${uid}` : null, (e) => {
    if (e.eventType === "INSERT") {
      setLastNotification(e.new);
      setUnread((n) => n + 1);
      if (document.visibilityState === "visible") toast(`${e.new.title} — ${e.new.body}`);
      else void showSystemNotification(e.new);
    } else refreshUnread();
  }, !!uid);

  return (
    <Ctx.Provider value={{ state, toast, signOut, refreshProfile, recheckOwner, unread, refreshUnread, setUnread, lastNotification }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
