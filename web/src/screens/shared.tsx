import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BellOff, CheckCheck, History, Info, KeyRound, LogOut, Minus, Plus, Smartphone } from "../components/icons";
import { notifications as notifApi, zikr } from "../lib/api";
import { auditActionLabel, dayLabel, fmt, localDayKey, relativeTime, timeOf } from "../lib/format";
import { usePaged } from "../lib/hooks";
import { useProfile, useSession } from "../lib/session";
import { useQueue } from "../lib/sync";
import { enablePush } from "../lib/push";
import { roleLabel, type AppNotification, type AuditEntry, type ZikrEntry } from "../lib/types";
import { Avatar, Card, ConfirmDialog, EmptyState, ErrorBanner, LoadMore, SectionTitle, Spinner, TopBar } from "../components/ui";

// =====================================================================
// Historique
// =====================================================================
export function Tabs({ tabs, value, onChange }: { tabs: string[]; value: number; onChange: (i: number) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t, i) => (
        <button key={t} role="tab" aria-selected={i === value} className={i === value ? "on" : ""} onClick={() => onChange(i)}>{t}</button>
      ))}
    </div>
  );
}

export function HistoryScreen({ withTopBar = false }: { withTopBar?: boolean }) {
  const profile = useProfile();
  const [tab, setTab] = useState(0);
  return (
    <>
      {withTopBar && <TopBar title="Mon historique" back />}
      <Tabs tabs={["Mes décomptes", "Modifications"]} value={tab} onChange={setTab} />
      {tab === 0 ? <EntriesList userId={profile.id} campaignId={null} showUser={false} /> : <AuditList mode="user" id={profile.id} />}
    </>
  );
}

export function EntriesList({ userId, campaignId, showUser }: { userId: string | null; campaignId: string | null; showUser: boolean }) {
  const list = usePaged<ZikrEntry>((page) => zikr.entries(userId, campaignId, page), [userId, campaignId]);
  const groups: [string, ZikrEntry[]][] = [];
  for (const e of list.items) {
    const key = localDayKey(e.created_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(e);
    else groups.push([key, [e]]);
  }
  return (
    <div className="page">
      {list.error && <ErrorBanner message={list.error} onRetry={list.refresh} />}
      {list.loading ? <Spinner /> : list.items.length === 0 && !list.error ? (
        <EmptyState icon={<History size={36} />} title="Aucun décompte" message="Les décomptes enregistrés apparaîtront ici." />
      ) : null}
      {groups.map(([day, entries]) => (
        <div key={day}>
          <div className="row between day-head">
            <strong>{dayLabel(day)}</strong>
            <span className="primary-text small">Total : {fmt(entries.reduce((a, e) => a + Number(e.amount), 0))}</span>
          </div>
          {entries.map((e) => {
            const positive = e.amount > 0;
            return (
              <Card key={e.id} className="entry">
                <div className={`entry-icon ${positive ? "pos" : "neg"}`}>{positive ? <Plus size={18} /> : <Minus size={18} />}</div>
                <div className="grow">
                  <div className="ellipsis">{showUser ? e.profiles?.full_name ?? "—" : e.campaigns?.title ?? "Campagne"}</div>
                  <div className="muted small ellipsis">{positive ? e.campaigns?.zikr_type ?? "" : "Annulation / correction"} · total {fmt(e.count_after)}</div>
                </div>
                <div className="right">
                  <div className={positive ? "pos-text" : "neg-text"}><strong>{positive ? "+" : "−"}{fmt(Math.abs(e.amount))}</strong></div>
                  <div className="muted small">{timeOf(e.created_at)}</div>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
      {!list.loading && <LoadMore onVisible={list.loadMore} loading={list.loadingMore} />}
    </div>
  );
}

export function AuditList({ mode, id }: { mode: "all" | "user" | "campaign"; id: string | null }) {
  const list = usePaged<AuditEntry>((page) => zikr.audit(mode, id, page), [mode, id]);
  return (
    <div className="page">
      {list.error && <ErrorBanner message={list.error} onRetry={list.refresh} />}
      {list.loading ? <Spinner /> : list.items.length === 0 && !list.error ? (
        <EmptyState icon={<History size={36} />} title="Aucune modification" message="Les modifications importantes seront conservées ici." />
      ) : null}
      {list.items.map((a) => <AuditRow key={a.id} a={a} />)}
      {!list.loading && <LoadMore onVisible={list.loadMore} loading={list.loadingMore} />}
    </div>
  );
}

const str = (d: Record<string, unknown>, k: string) => (d[k] === undefined || d[k] === null ? null : String(d[k]));
const num = (d: Record<string, unknown>, k: string) => (str(d, k) !== null ? fmt(Number(str(d, k))) : "?");

function detailsText(a: AuditEntry): string | null {
  const d = a.details ?? {};
  switch (a.action) {
    case "objectif_modifie": return `Objectif : ${num(d, "avant")} → ${num(d, "apres")}`;
    case "participant_ajoute": case "participant_reintegre": return `Objectif : ${num(d, "objectif")}`;
    case "participant_retire": return `Réalisé : ${num(d, "realise")} / ${num(d, "objectif")}`;
    case "campagne_creee": return `${str(d, "titre") ?? ""} · objectif ${num(d, "objectif")} ${str(d, "type") ?? ""}`;
    case "campagne_supprimee": case "campagne_cloturee": case "campagne_rouverte": return str(d, "titre");
    case "objectif_personnel_atteint": case "objectif_global_atteint": return `Objectif : ${num(d, "objectif")}`;
    case "participant_cree": case "administrateur_cree": case "participant_supprime": case "administrateur_supprime":
      return [str(d, "nom"), str(d, "identifiant") ? `@${str(d, "identifiant")}` : null].filter(Boolean).join(" ") || null;
    default: return null;
  }
}

export function AuditRow({ a }: { a: AuditEntry }) {
  const parts = [
    a.target?.full_name && a.target_user !== a.actor_id ? `Concerne : ${a.target.full_name}` : null,
    a.campaign?.title ? `Campagne : ${a.campaign.title}` : null,
    detailsText(a),
    a.actor?.full_name ? `Par : ${a.actor.full_name}` : null,
  ].filter(Boolean);
  return (
    <Card>
      <strong>{auditActionLabel(a.action)}</strong>
      {parts.map((p, i) => <div key={i} className="muted small">{p}</div>)}
      <div className="faint small">{relativeTime(a.created_at)}</div>
    </Card>
  );
}

export function AuditScreen() {
  return <><TopBar title="Journal d'activité" back /><AuditList mode="all" id={null} /></>;
}

// =====================================================================
// Notifications
// =====================================================================
export function NotificationsScreen({ withTopBar = false }: { withTopBar?: boolean }) {
  const profile = useProfile();
  const navigate = useNavigate();
  const { lastNotification, setUnread, refreshUnread } = useSession();
  const list = usePaged<AppNotification>((page) => notifApi.list(profile.id, page), [profile.id]);

  useEffect(() => {
    if (lastNotification) list.setItems((items) => [lastNotification, ...items.filter((n) => n.id !== lastNotification.id)]);
  }, [lastNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  const markAll = async () => {
    await notifApi.markRead(null).catch(() => undefined);
    const now = new Date().toISOString();
    list.setItems((items) => items.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    setUnread(0);
  };

  const open = async (n: AppNotification) => {
    if (!n.read_at) {
      await notifApi.markRead([n.id]).catch(() => undefined);
      const now = new Date().toISOString();
      list.setItems((items) => items.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
      refreshUnread();
    }
    const cid = n.data?.campaign_id as string | undefined;
    if (cid) navigate(profile.role === "admin" ? `/campagne/${cid}` : `/compteur/${cid}`);
  };

  return (
    <>
      {withTopBar && <TopBar title="Notifications" back />}
      <div className="page">
        <NotificationPermission />
        {list.items.some((n) => !n.read_at) && (
          <div className="row end"><button className="btn-text" onClick={() => void markAll()}><CheckCheck size={18} /> Tout marquer comme lu</button></div>
        )}
        {list.error && <ErrorBanner message={list.error} onRetry={list.refresh} />}
        {list.loading ? <Spinner /> : list.items.length === 0 && !list.error ? (
          <EmptyState icon={<BellOff size={36} />} title="Aucune notification" message="Vous serez averti des nouvelles campagnes et des objectifs atteints." />
        ) : null}
        {list.items.map((n) => (
          <Card key={n.id} onClick={() => void open(n)}>
            <div className="row top">
              <span className={`dot ${n.read_at ? "" : "on"}`} />
              <div className="grow">
                <div className={n.read_at ? "" : "bold"}>{n.title}</div>
                <div className="muted">{n.body}</div>
                <div className="faint small">{relativeTime(n.created_at)}</div>
              </div>
            </div>
          </Card>
        ))}
        {!list.loading && <LoadMore onVisible={list.loadMore} loading={list.loadingMore} />}
      </div>
    </>
  );
}

/** Invite à autoriser les notifications et explique l'installation sur iPhone. */
function NotificationPermission() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(
    "Notification" in window ? Notification.permission : "unsupported",
  );
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (perm === "granted") return null;
  if (ios && !standalone) {
    return (
      <div className="info-banner"><Smartphone size={18} />
        <span>Pour recevoir les notifications sur iPhone : touchez <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>, et ouvrez l'application depuis l'icône.</span>
      </div>
    );
  }
  if (perm === "unsupported" || perm === "denied") return null;
  return (
    <div className="info-banner"><Info size={18} />
      <span className="grow">Activez les notifications pour être averti des campagnes et des objectifs atteints, même téléphone verrouillé.</span>
      <button className="btn small" onClick={() => void Notification.requestPermission().then((p) => { setPerm(p); if (p === "granted") void enablePush(); })}>Activer</button>
    </div>
  );
}

// =====================================================================
// Profil et réglages
// =====================================================================
function useLocalToggle(key: string): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(localStorage.getItem(key) !== "off");
  return [v, (x: boolean) => { localStorage.setItem(key, x ? "on" : "off"); setV(x); }];
}

export function ProfileScreen() {
  const profile = useProfile();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const queue = useQueue();
  const [vibration, setVibration] = useLocalToggle("zikr-vibration");
  const [screen, setScreen] = useLocalToggle("zikr-ecran");
  const [notifs, setNotifs] = useLocalToggle("zikr-notifs");
  const [confirm, setConfirm] = useState(false);
  const unsent = queue.ops.filter((o) => o.userId === profile.id).length;
  const isAdmin = profile.role === "admin";

  return (
    <div className="page">
      <Card>
        <div className="row">
          <Avatar name={profile.full_name} size={56} />
          <div>
            <div className="card-title big">{profile.full_name}</div>
            <div className="muted">@{profile.username}</div>
            <div className="primary-text small bold">{roleLabel(profile)}</div>
          </div>
        </div>
        {profile.phone && <div className="small">Téléphone : {profile.phone}</div>}
      </Card>
      <Card>
        <SectionTitle>Compte</SectionTitle>
        <button className="list-link" onClick={() => navigate("/mot-de-passe")}><KeyRound size={20} /> Changer mon mot de passe</button>
        {isAdmin && <button className="list-link" onClick={() => navigate("/historique")}><History size={20} /> Mon historique</button>}
      </Card>
      <Card>
        <SectionTitle>Réglages</SectionTitle>
        <Toggle label="Vibration à chaque appui (Android)" value={vibration} onChange={setVibration} />
        <Toggle label="Garder l'écran allumé pendant le décompte" value={screen} onChange={setScreen} />
        <Toggle label="Afficher les notifications" value={notifs} onChange={setNotifs} />
      </Card>
      <Card>
        <div className="row"><Info size={20} className="primary-text" />
          <div>
            <strong>ANSAROUDINE ZIKR</strong>
            <div className="muted small">Version web 1.0.0</div>
            <div className="muted small">Vos données sont sauvegardées automatiquement et en toute sécurité.</div>
          </div>
        </div>
      </Card>
      <button className="btn-text danger-text center-block" onClick={() => setConfirm(true)}><LogOut size={18} /> Se déconnecter</button>
      {confirm && (
        <ConfirmDialog
          title="Se déconnecter ?"
          message={unsent > 0
            ? "Certains décomptes ne sont pas encore envoyés. Ils seront conservés sur cet appareil et envoyés à votre prochaine connexion."
            : "Vous pourrez vous reconnecter à tout moment ; toutes vos données sont conservées."}
          confirmLabel="Se déconnecter" destructive onConfirm={() => void signOut()} onClose={() => setConfirm(false)}
        />
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input type="checkbox" className="switch" checked={value} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}
