import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Cloud, CloudOff, Lock, Pencil, RefreshCw, Sparkles, Today, TrendingUp, Undo2, HeartHandshake } from "../components/icons";
import { zikr } from "../lib/api";
import { toUserMessage } from "../lib/errors";
import { dateLabel, fmt, percentOf } from "../lib/format";
import { useTableChanges } from "../lib/realtime";
import { useProfile, useSession } from "../lib/session";
import { pendingSum } from "../lib/queue";
import { sync, useQueue, useSyncStatus, type SyncStatus } from "../lib/sync";
import { campaignPhase, isFinished, type Campaign, type DailyStat, type MyOverview, type Participation } from "../lib/types";
import {
  Card, DailyBarChart, EmptyState, ErrorBanner, LabeledProgress, Modal, PhaseChip, ProgressRing, SectionTitle, Spinner, StatTile, TopBar,
} from "../components/ui";

// =====================================================================
// Accueil du participant : ses campagnes
// =====================================================================
export function HomeScreen() {
  const profile = useProfile();
  const navigate = useNavigate();
  const queue = useQueue();
  const [items, setItems] = useState<Participation[]>([]);
  const [overview, setOverview] = useState<MyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await zikr.myParticipations(profile.id);
      list.forEach((p) => {
        if (p.campaigns) sync.resetSnapshot(p.campaign_id, Number(p.count), Number(p.personal_goal), Number(p.campaigns.total_count), Number(p.campaigns.global_goal), p.campaigns.updated_at);
      });
      setItems(list);
      setError(null);
      zikr.myOverview().then(setOverview).catch(() => undefined);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [profile.id]);

  useEffect(() => { void load(); }, [load]);

  useTableChanges<Participation>("zk_campaign_participants", `user_id=eq.${profile.id}`, (e) => {
    if (e.eventType === "UPDATE" && !e.new.removed_at) {
      setItems((list) => list.map((p) => (p.campaign_id === e.new.campaign_id ? { ...p, count: e.new.count, personal_goal: e.new.personal_goal } : p)));
      sync.mergeSnapshot(e.new.campaign_id, { personalCount: Number(e.new.count), personalGoal: Number(e.new.personal_goal) }, e.new.updated_at);
    } else void load();
  });
  useTableChanges<Campaign>("zk_campaigns", null, (e) => {
    if (e.eventType !== "UPDATE" || sync.isInflight(e.new.id)) return;
    setItems((list) => list.map((p) => (p.campaign_id === e.new.id ? { ...p, campaigns: e.new } : p)));
    sync.mergeSnapshot(e.new.id, { campaignTotal: Number(e.new.total_count), globalGoal: Number(e.new.global_goal) }, e.new.updated_at);
  });

  const display = items.map((p) => {
    const pending = pendingSum(queue, profile.id, p.campaign_id);
    const snap = queue.snapshots[p.campaign_id];
    return {
      ...p,
      count: (snap?.personalCount ?? Number(p.count)) + pending,
      personal_goal: snap?.personalGoal ?? Number(p.personal_goal),
      campaigns: p.campaigns ? { ...p.campaigns, total_count: (snap?.campaignTotal ?? Number(p.campaigns.total_count)) + pending } : p.campaigns,
    };
  });
  const active = display.filter((p) => p.campaigns && !isFinished(campaignPhase(p.campaigns)));
  const finished = display.filter((p) => p.campaigns && isFinished(campaignPhase(p.campaigns)));

  return (
    <div className="page">
      <h2 className="greeting">As-salamou alaykoum, {profile.full_name.split(" ")[0]}</h2>
      <p className="muted">Qu'Allah accepte vos invocations.</p>
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {overview && (
        <div className="grid3">
          <StatTile label="Aujourd'hui" value={fmt(overview.zikr_aujourdhui)} icon={<Today size={20} />} />
          <StatTile label="Total réalisé" value={fmt(overview.total_zikr)} icon={<TrendingUp size={20} />} accent="var(--gold-dark)" />
          <StatTile label="Objectifs atteints" value={`${overview.objectifs_atteints} / ${overview.campagnes}`} icon={<CheckCircle2 size={20} />} accent="var(--success)" />
        </div>
      )}
      {loading ? <Spinner /> : items.length === 0 && !error ? (
        <EmptyState icon={<HeartHandshake size={36} />} title="Aucune campagne pour le moment"
          message="Lorsqu'un administrateur vous ajoutera à une campagne de Zikr, elle apparaîtra ici." />
      ) : null}
      {active.length > 0 && <SectionTitle>Mes campagnes en cours</SectionTitle>}
      {active.map((p) => <ParticipationCard key={p.campaign_id} p={p} onClick={() => navigate(`/compteur/${p.campaign_id}`)} />)}
      {finished.length > 0 && <SectionTitle>Campagnes terminées</SectionTitle>}
      {finished.map((p) => <ParticipationCard key={p.campaign_id} p={p} onClick={() => navigate(`/compteur/${p.campaign_id}`)} />)}
    </div>
  );
}

function ParticipationCard({ p, onClick }: { p: Participation; onClick: () => void }) {
  const c = p.campaigns!;
  return (
    <Card onClick={onClick}>
      <div className="row between">
        <div className="grow">
          <div className="card-title">{c.title}</div>
          <div className="primary-text">{c.zikr_type}</div>
        </div>
        <PhaseChip phase={campaignPhase(c)} goalReached={Number(c.total_count) >= Number(c.global_goal)} />
      </div>
      <LabeledProgress label="Mon objectif" done={Number(p.count)} goal={Number(p.personal_goal)} />
      <LabeledProgress label="Progression globale" done={Number(c.total_count)} goal={Number(c.global_goal)} color="var(--gold-dark)" />
      <div className="muted small row"><Sparkles size={14} /> Du {dateLabel(c.start_date)}{c.end_date ? ` au ${dateLabel(c.end_date)}` : ""}</div>
    </Card>
  );
}

// =====================================================================
// Écran de décompte
// =====================================================================
const vibrate = (ms: number) => {
  if (localStorage.getItem("zikr-vibration") !== "off" && "vibrate" in navigator) navigator.vibrate(ms);
};

export function CounterScreen() {
  const { id = "" } = useParams();
  const profile = useProfile();
  const { toast } = useSession();
  const queue = useQueue();
  const status = useSyncStatus();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [part, setPart] = useState<Participation | null>(null);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);

  const load = useCallback(async () => {
    try {
      const p = await zikr.participation(id, profile.id);
      const c = p?.campaigns ?? (await zikr.campaign(id));
      if (!p || p.removed_at || !c) { setError("Vous ne participez plus à cette campagne."); setLoading(false); return; }
      sync.resetSnapshot(id, Number(p.count), Number(p.personal_goal), Number(c.total_count), Number(c.global_goal), c.updated_at);
      setCampaign(c);
      setPart(p);
      setError(null);
      zikr.dailyStats(id, 7).then(setDaily).catch(() => undefined);
    } catch (e) {
      if (!campaign) setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, profile.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const off = sync.onInvalidate((cid) => { if (cid === id) void load(); }); return () => { off(); }; }, [id, load]);

  useTableChanges<Campaign>("zk_campaigns", `id=eq.${id}`, (e) => {
    if (e.eventType !== "UPDATE") return;
    setCampaign(e.new);
    sync.mergeSnapshot(id, { campaignTotal: Number(e.new.total_count), globalGoal: Number(e.new.global_goal) }, e.new.updated_at);
  });
  useTableChanges<Participation>("zk_campaign_participants", `user_id=eq.${profile.id}`, (e) => {
    if (e.eventType !== "UPDATE" || e.new.campaign_id !== id) return;
    if (e.new.removed_at) { void load(); return; }
    sync.mergeSnapshot(id, { personalCount: Number(e.new.count), personalGoal: Number(e.new.personal_goal) }, e.new.updated_at);
  });

  // Écran maintenu allumé pendant le décompte
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  useEffect(() => {
    if (localStorage.getItem("zikr-ecran") === "off") return;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    const acquire = () => nav.wakeLock?.request("screen").then((l) => { wakeLock.current = l; }).catch(() => undefined);
    void acquire();
    const onVis = () => { if (document.visibilityState === "visible") void acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void wakeLock.current?.release().catch(() => undefined);
    };
  }, []);

  const snap = queue.snapshots[id];
  const pending = pendingSum(queue, profile.id, id);
  const personal = (snap?.personalCount ?? Number(part?.count ?? 0)) + pending;
  const goal = snap?.personalGoal ?? Number(part?.personal_goal ?? 0);
  const total = (snap?.campaignTotal ?? Number(campaign?.total_count ?? 0)) + pending;
  const globalGoal = snap?.globalGoal ?? Number(campaign?.global_goal ?? 0);
  const canUndo = (queue.undo[id] ?? []).length > 0;
  const phase = campaign ? campaignPhase(campaign) : "active";
  const active = phase === "active";

  const tap = (n: number) => {
    if (!active) return;
    vibrate(12);
    if (goal > 0 && personal < goal && personal + n >= goal) {
      setCelebrate(goal);
      vibrate(250);
    }
    sync.add(id, n);
  };

  const undo = () => {
    const u = sync.undo(id);
    toast(u === null ? "Rien à annuler." : `Dernier ajout annulé (−${fmt(u)}).`);
  };

  const correct = (n: number) => {
    if (n > personal) { toast(`Vous ne pouvez pas retirer plus que votre total (${fmt(personal)}).`); return; }
    sync.add(id, -n);
    toast(`Correction de −${fmt(n)} enregistrée.`);
  };

  if (loading) return <><TopBar title="Campagne" back /><Spinner /></>;
  if (!campaign) return <><TopBar title="Campagne" back /><div className="page"><ErrorBanner message={error ?? "Campagne introuvable."} onRetry={() => void load()} /></div></>;

  return (
    <>
      <TopBar title={campaign.title} subtitle={campaign.zikr_type} back actions={<SyncBadge status={status} />} />
      <div className="page counter">
        {!active && <ClosedBanner campaign={campaign} />}
        <ProgressRing progress={goal > 0 ? personal / goal : 0} size={230} stroke={16} color={personal >= goal && goal > 0 ? "var(--success)" : "var(--primary)"}>
          <div className="count-number" style={{ fontSize: personal >= 1_000_000 ? 38 : 54 }}>{fmt(personal)}</div>
          <div className="muted">sur {fmt(goal)}</div>
          <div className="count-percent" style={{ color: personal >= goal && goal > 0 ? "var(--success)" : "var(--primary)" }}>{percentOf(personal, goal)} %</div>
        </ProgressRing>
        <p className="muted center">
          {personal >= goal && goal > 0 ? "Objectif personnel atteint, Machallah !" : `Il vous reste ${fmt(Math.max(0, goal - personal))} pour atteindre votre objectif`}
        </p>
        <button
          className={`big-plus ${pressed ? "pressed" : ""}`} disabled={!active} aria-label="Ajouter un"
          onPointerDown={() => setPressed(true)} onPointerUp={() => setPressed(false)} onPointerLeave={() => setPressed(false)}
          onClick={() => tap(1)}
        >+1</button>
        <div className="quick">
          {[10, 33, 100].map((n) => <button key={n} className="btn tonal" disabled={!active} onClick={() => tap(n)}>+{n}</button>)}
          <button className="btn tonal" disabled={!active} onClick={() => setCustom(true)} aria-label="Valeur personnalisée"><Pencil size={20} /></button>
        </div>
        <button className="btn outline wide" disabled={!active || !canUndo} onClick={undo}><Undo2 size={18} /> Annuler le dernier ajout</button>

        <Card>
          <LabeledProgress label="Progression globale de la campagne" done={total} goal={globalGoal} color="var(--gold-dark)" />
          <div className="row gap">
            <PhaseChip phase={phase} goalReached={total >= globalGoal} />
            <span className="muted small">{campaign.participants_count} participants</span>
          </div>
          <div className="muted small">Du {dateLabel(campaign.start_date)}{campaign.end_date ? ` au ${dateLabel(campaign.end_date)}` : " · sans date de fin"}</div>
          {campaign.description && <p className="small">{campaign.description}</p>}
        </Card>
        {daily.length > 0 && <Card><h4>Mes 7 derniers jours</h4><DailyBarChart stats={daily} /></Card>}
      </div>

      {custom && <CustomAmountDialog onClose={() => setCustom(false)} onAdd={(n) => { tap(n); setCustom(false); }} onCorrect={(n) => { correct(n); setCustom(false); }} />}
      {celebrate !== null && (
        <Modal title="Machallah ! 🎉" onClose={() => setCelebrate(null)} actions={<button className="btn" onClick={() => setCelebrate(null)}>Amine</button>}>
          <p>Vous avez atteint votre objectif de {fmt(celebrate)} {campaign.zikr_type}. Qu'Allah l'accepte et vous récompense. Vous pouvez continuer si vous le souhaitez.</p>
        </Modal>
      )}
    </>
  );
}

function ClosedBanner({ campaign }: { campaign: Campaign }) {
  const phase = campaignPhase(campaign);
  const text = phase === "upcoming" ? `Cette campagne commencera le ${dateLabel(campaign.start_date)}.`
    : phase === "ended" ? `Cette campagne est terminée depuis le ${dateLabel(campaign.end_date!)}.`
    : "Cette campagne a été clôturée par un administrateur.";
  return <div className="info-banner"><Lock size={18} /> {text}</div>;
}

export function SyncBadge({ status }: { status: SyncStatus }) {
  const map = {
    synced: { icon: <Cloud size={16} />, label: "Synchronisé", cls: "ok" },
    pending: { icon: <RefreshCw size={16} />, label: "Envoi…", cls: "pending" },
    syncing: { icon: <RefreshCw size={16} />, label: "Envoi…", cls: "pending" },
    offline: { icon: <CloudOff size={16} />, label: "Hors ligne", cls: "offline" },
  }[status];
  return <button className={`sync-badge ${map.cls}`} onClick={() => sync.scheduleFlush(0)}>{map.icon}{map.label}</button>;
}

function CustomAmountDialog({ onClose, onAdd, onCorrect }: { onClose: () => void; onAdd: (n: number) => void; onCorrect: (n: number) => void }) {
  const [text, setText] = useState("");
  const [correction, setCorrection] = useState(false);
  const value = Number(text);
  const valid = Number.isInteger(value) && value >= 1 && value <= 100000;
  return (
    <Modal title={correction ? "Corriger mon total" : "Ajouter une valeur"} onClose={onClose} actions={<>
      <button className="btn-text" onClick={onClose}>Fermer</button>
      <button className="btn" disabled={!valid} onClick={() => (correction ? onCorrect(value) : onAdd(value))}>{correction ? "Retirer" : "Ajouter"}</button>
    </>}>
      <div className="chips">
        <button className={`chip ${!correction ? "on" : ""}`} onClick={() => setCorrection(false)}>Ajouter</button>
        <button className={`chip ${correction ? "on" : ""}`} onClick={() => setCorrection(true)}>Retirer (erreur)</button>
      </div>
      <input className="big-input" inputMode="numeric" autoFocus value={text} placeholder="Nombre"
        onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 6))} />
      <div className="muted small">Entre 1 et 100 000</div>
      <div className="chips">{[7, 11, 99, 313, 1000].map((n) => <button key={n} className="chip" onClick={() => setText(String(n))}>{n}</button>)}</div>
    </Modal>
  );
}
