import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Ban, CalendarDays, CheckCircle2, Megaphone, Pencil, Plus, RefreshCw, ShieldCheck, Today, Trash2, TrendingUp, UserMinus,
  UserPlus, Users, CalendarCheck, HeartHandshake, KeyRound, Lock, LockOpen,
} from "../components/icons";
import { admin, zikr } from "../lib/api";
import { toUserMessage } from "../lib/errors";
import { USERNAME_REGEX, dateLabel, fmt, generatePassword, percentOf, suggestUsername } from "../lib/format";
import { useAction, useDebounced, usePaged } from "../lib/hooks";
import { useTableChanges } from "../lib/realtime";
import { useProfile, useSession } from "../lib/session";
import { campaignPhase, todayIso, type AdminOverview, type AuditEntry, type Campaign, type DailyStat, type Participation, type Profile } from "../lib/types";
import {
  Avatar, Card, ConfirmDialog, DailyBarChart, EmptyState, ErrorBanner, Field, LabeledProgress, LoadMore, Modal, PasswordInput,
  PhaseChip, ProgressRing, SearchField, SectionTitle, Spinner, StatTile, Tag, TopBar, goalColor,
} from "../components/ui";
import { AuditList, AuditRow, EntriesList, Tabs } from "./shared";

export const ZIKR_SUGGESTIONS = [
  "Astaghfirullah", "Salat Ala Nabi ﷺ", "La ilaha illa Allah", "SubhanAllah", "Alhamdoulillah", "Allahou Akbar",
  "Hasbunallah wa ni'mal wakil", "Ya Latif", "Lâ hawla wa lâ quwwata illâ billâh",
];

// =====================================================================
// Tableau de bord
// =====================================================================
export function DashboardScreen() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [active, setActive] = useState<Campaign[]>([]);
  const [activity, setActivity] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      const [o, a] = await Promise.all([admin.overview(), zikr.campaigns("active", "", 0)]);
      setOverview(o);
      setActive(a);
      setError(null);
      zikr.audit("all", null, 0).then((x) => setActivity(x.slice(0, 8))).catch(() => undefined);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useTableChanges<Campaign>("zk_campaigns", null, (e) => {
    if (e.eventType === "UPDATE") {
      setActive((list) => list.map((c) => (c.id === e.new.id ? e.new : c)));
      if (!debounce.current) {
        debounce.current = setTimeout(() => {
          debounce.current = null;
          admin.overview().then(setOverview).catch(() => undefined);
        }, 3000);
      }
    } else void load();
  });

  return (
    <div className="page">
      {error && <ErrorBanner message={error} onRetry={() => void load()} />}
      {loading && <Spinner />}
      {overview && (
        <>
          <div className="grid2">
            <StatTile label="Campagnes en cours" value={fmt(overview.campagnes_en_cours)} icon={<Megaphone size={20} />} />
            <StatTile label="Campagnes terminées" value={fmt(overview.campagnes_terminees)} icon={<CalendarCheck size={20} />} accent="var(--gold-dark)" />
            <StatTile label="Membres actifs" value={`${fmt(overview.participants_actifs)} / ${fmt(overview.participants)}`} icon={<Users size={20} />} />
            <StatTile label="Administrateurs" value={fmt(overview.administrateurs)} icon={<ShieldCheck size={20} />} accent="var(--blue)" />
          </div>
          <div className="grid3">
            <StatTile label="Zikr aujourd'hui" value={fmt(overview.zikr_aujourdhui)} icon={<Today size={20} />} accent="var(--gold-dark)" />
            <StatTile label="Zikr au total" value={fmt(overview.total_zikr)} icon={<TrendingUp size={20} />} />
            <StatTile label="Objectifs atteints" value={fmt(overview.objectifs_personnels_atteints)} icon={<CheckCircle2 size={20} />} accent="var(--success)" />
          </div>
        </>
      )}
      {!loading && (
        <>
          <SectionTitle action={<button className="btn-text" onClick={() => navigate("/campagne-nouvelle")}>Nouvelle</button>}>Campagnes en cours</SectionTitle>
          {active.length === 0 && <EmptyState icon={<HeartHandshake size={36} />} title="Aucune campagne en cours" message="Créez une campagne puis cochez les participants." />}
          {active.map((c) => <CampaignCard key={c.id} c={c} onClick={() => navigate(`/campagne/${c.id}`)} />)}
          {activity.length > 0 && (
            <>
              <SectionTitle action={<button className="btn-text" onClick={() => navigate("/journal")}>Tout voir</button>}>Activité récente</SectionTitle>
              {activity.map((a) => <AuditRow key={a.id} a={a} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function CampaignCard({ c, onClick }: { c: Campaign; onClick: () => void }) {
  return (
    <Card onClick={onClick}>
      <div className="row between">
        <div className="grow">
          <div className="card-title ellipsis">{c.title}</div>
          <div className="primary-text ellipsis">{c.zikr_type}</div>
        </div>
        <PhaseChip phase={campaignPhase(c)} goalReached={Number(c.total_count) >= Number(c.global_goal)} />
      </div>
      <LabeledProgress label="Objectif global" done={Number(c.total_count)} goal={Number(c.global_goal)} color="var(--gold-dark)" />
      <div className="row muted small gap">
        <span className="row"><Users size={14} /> {c.participants_count} participants</span>
        <span className="row ellipsis"><CalendarDays size={14} /> {dateLabel(c.start_date)}{c.end_date ? ` → ${dateLabel(c.end_date)}` : ""}</span>
      </div>
    </Card>
  );
}

// =====================================================================
// Liste des campagnes
// =====================================================================
export function CampaignsScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const list = usePaged<Campaign>((page) => zikr.campaigns(filter, q, page), [filter, q]);
  useTableChanges<Campaign>("zk_campaigns", null, (e) => {
    if (e.eventType === "UPDATE") list.setItems((items) => items.map((c) => (c.id === e.new.id ? e.new : c)));
    else list.refresh();
  });
  return (
    <div className="page">
      <SearchField value={search} onChange={setSearch} placeholder="Rechercher une campagne" />
      <div className="chips">
        {[["active", "En cours"], ["upcoming", "À venir"], ["finished", "Terminées"], ["all", "Toutes"]].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {list.error && <ErrorBanner message={list.error} onRetry={list.refresh} />}
      {list.loading ? <Spinner /> : list.items.length === 0 && !list.error ? (
        <EmptyState icon={<HeartHandshake size={36} />} title="Aucune campagne" message="Appuyez sur « Nouvelle campagne » pour commencer." />
      ) : null}
      {list.items.map((c) => <CampaignCard key={c.id} c={c} onClick={() => navigate(`/campagne/${c.id}`)} />)}
      {!list.loading && <LoadMore onVisible={list.loadMore} loading={list.loadingMore} />}
      <button className="fab" onClick={() => navigate("/campagne-nouvelle")}><Plus size={20} /> Nouvelle campagne</button>
    </div>
  );
}

// =====================================================================
// Création / modification d'une campagne
// =====================================================================
export function CampaignFormScreen() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loaded, setLoaded] = useState(!id);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("");
  const [description, setDescription] = useState("");
  const [start, setStart] = useState(todayIso());
  const [hasEnd, setHasEnd] = useState(false);
  const [end, setEnd] = useState("");
  const [goal, setGoal] = useState("");
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    if (!id) return;
    zikr.campaign(id).then((c) => {
      if (c) {
        setTitle(c.title); setType(c.zikr_type); setDescription(c.description ?? ""); setStart(c.start_date);
        setHasEnd(!!c.end_date); setEnd(c.end_date ?? ""); setGoal(String(c.global_goal));
      }
      setLoaded(true);
    }).catch((e) => { setError(toUserMessage(e)); setLoaded(true); });
  }, [id, setError]);

  const save = () => {
    const g = Number(goal);
    if (title.trim().length < 2) return setError("Le titre doit contenir au moins 2 caractères.");
    if (!type.trim()) return setError("Indiquez le type de Zikr.");
    if (!Number.isInteger(g) || g <= 0) return setError("L'objectif global doit être un nombre supérieur à zéro.");
    if (hasEnd && (!end || end < start)) return setError("La date de fin doit être postérieure ou égale à la date de début.");
    void run(async () => {
      if (id) {
        await admin.updateCampaign(id, title.trim(), type.trim(), description.trim(), start, hasEnd ? end : null, g);
        navigate(-1);
      } else {
        const newId = await admin.createCampaign(title.trim(), type.trim(), description.trim(), start, hasEnd ? end : null, g);
        navigate(`/campagne/${newId}/participants`, { replace: true });
      }
    });
  };

  return (
    <>
      <TopBar title={id ? "Modifier la campagne" : "Nouvelle campagne"} back />
      {!loaded ? <Spinner /> : (
        <div className="page form">
          <Field label="Titre de la campagne"><input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="Type de Zikr"><input value={type} maxLength={120} onChange={(e) => setType(e.target.value)} /></Field>
          <div className="chips scroll">{ZIKR_SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => setType(s)}>{s}</button>)}</div>
          <Field label="Description (facultative)"><textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          <Field label="Objectif global">
            <input inputMode="numeric" value={goal ? fmt(Number(goal)) : ""} onChange={(e) => setGoal(e.target.value.replace(/\D/g, "").slice(0, 13))} />
          </Field>
          <div className="chips scroll">{[10000, 50000, 100000, 500000, 1000000].map((g) => <button key={g} className="chip" onClick={() => setGoal(String(g))}>{fmt(g)}</button>)}</div>
          <Field label="Date de début"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <label className="toggle-row"><span>Définir une date de fin</span>
            <input type="checkbox" className="switch" checked={hasEnd} onChange={(e) => {
              setHasEnd(e.target.checked);
              if (e.target.checked && !end) { const d = new Date(start); d.setDate(d.getDate() + 30); setEnd(d.toISOString().slice(0, 10)); }
            }} />
          </label>
          {hasEnd && <Field label="Date de fin"><input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>}
          {error && <ErrorBanner message={error} />}
          <button className="btn big" disabled={busy} onClick={save}>{busy ? "Enregistrement…" : id ? "Enregistrer les modifications" : "Créer et choisir les participants"}</button>
        </div>
      )}
    </>
  );
}

// =====================================================================
// Détail d'une campagne
// =====================================================================
export function CampaignDetailScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useSession();
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [parts, setParts] = useState<Participation[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState("");
  const [sortByProgress, setSort] = useState(true);
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const [editGoal, setEditGoal] = useState<Participation | null>(null);
  const dailyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadParts = useCallback(() => {
    zikr.campaignParticipants(id).then(setParts).catch(() => undefined);
    zikr.campaign(id).then((c) => c && setCamp(c)).catch(() => undefined);
  }, [id]);

  const load = useCallback(async () => {
    try {
      const c = await zikr.campaign(id);
      if (!c) { setError("Campagne introuvable."); return; }
      setCamp(c);
      setParts(await zikr.campaignParticipants(id));
      setError(null);
      zikr.dailyStats(id, 14).then(setDaily).catch(() => undefined);
    } catch (e) {
      setError(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  useTableChanges<Campaign>("zk_campaigns", `id=eq.${id}`, (e) => {
    if (e.eventType !== "UPDATE") return;
    setCamp(e.new);
    if (!dailyTimer.current) {
      dailyTimer.current = setTimeout(() => {
        dailyTimer.current = null;
        zikr.dailyStats(id, 14).then(setDaily).catch(() => undefined);
      }, 5000);
    }
  });
  useTableChanges<Participation>("zk_campaign_participants", `campaign_id=eq.${id}`, (e) => {
    if (e.eventType === "UPDATE" && !e.new.removed_at) {
      setParts((list) => list.map((p) => (p.user_id === e.new.user_id ? { ...p, ...e.new, profiles: p.profiles } : p)));
    } else loadParts();
  });

  const act = async (fn: () => Promise<unknown>, success: string) => {
    try { await fn(); toast(success); loadParts(); } catch (e) { toast(toUserMessage(e)); }
  };

  if (loading) return <><TopBar title="Campagne" back /><Spinner /></>;
  if (!camp) return <><TopBar title="Campagne" back /><div className="page"><ErrorBanner message={error ?? "Campagne introuvable."} onRetry={() => void load()} /></div></>;

  const total = Number(camp.total_count);
  const goal = Number(camp.global_goal);
  const sumGoals = parts.reduce((a, p) => a + Number(p.personal_goal), 0);
  const completed = parts.filter((p) => Number(p.count) >= Number(p.personal_goal)).length;
  const s = search.trim().toLowerCase();
  const visible = parts
    .filter((p) => !s || p.profiles?.full_name.toLowerCase().includes(s) || p.profiles?.username.includes(s))
    .sort((a, b) => sortByProgress
      ? Number(b.count) / Math.max(1, Number(b.personal_goal)) - Number(a.count) / Math.max(1, Number(a.personal_goal))
      : (a.profiles?.full_name ?? "").localeCompare(b.profiles?.full_name ?? "", "fr"));
  const closed = camp.status === "terminee";

  return (
    <>
      <TopBar title={camp.title} subtitle={camp.zikr_type} back actions={<button className="icon-btn" onClick={() => navigate(`/campagne/${id}/modifier`)} aria-label="Modifier"><Pencil size={20} /></button>} />
      <Tabs tabs={["Suivi", "Décomptes", "Journal"]} value={tab} onChange={setTab} />
      {tab === 1 ? <EntriesList userId={null} campaignId={id} showUser /> : tab === 2 ? <AuditList mode="campaign" id={id} /> : (
        <div className="page">
          <Card>
            <div className="row">
              <ProgressRing progress={goal ? total / goal : 0} size={96} stroke={10} color={total >= goal ? "var(--success)" : "var(--gold-dark)"}>
                <strong>{percentOf(total, goal)} %</strong>
              </ProgressRing>
              <div className="grow">
                <div className="primary-text bold">{camp.zikr_type}</div>
                <div className="card-title big">{fmt(total)} / {fmt(goal)}</div>
                <div className="muted">{total >= goal ? "Objectif global atteint" : `Reste ${fmt(goal - total)}`}</div>
                <PhaseChip phase={campaignPhase(camp)} goalReached={total >= goal} />
              </div>
            </div>
            <hr />
            <Info label="Période" value={`${dateLabel(camp.start_date)}${camp.end_date ? ` → ${dateLabel(camp.end_date)}` : " · sans date de fin"}`} />
            <Info label="Participants" value={`${parts.length} (dont ${completed} ont atteint leur objectif)`} />
            <Info label="Total des objectifs individuels" value={fmt(sumGoals)} />
            {sumGoals < goal && parts.length > 0 && (
              <div className="error-text small">Attention : la somme des objectifs individuels est inférieure à l'objectif global (il manque {fmt(goal - sumGoals)}).</div>
            )}
            {camp.description && <p className="small">{camp.description}</p>}
            <div className="row wrap gap top-space">
              <button className="btn tonal small" onClick={() => navigate(`/campagne/${id}/participants`)}><UserPlus size={16} /> Participants</button>
              {closed
                ? <button className="btn tonal small" onClick={() => void act(() => admin.setCampaignStatus(id, "en_cours"), "Campagne rouverte.")}><LockOpen size={16} /> Rouvrir</button>
                : <button className="btn tonal small" onClick={() => setConfirm("close")}><Lock size={16} /> Clôturer</button>}
              <button className="btn tonal small danger-text" onClick={() => setConfirm("delete")}><Trash2 size={16} /> Supprimer</button>
            </div>
          </Card>
          {daily.length > 0 && <Card><h4>Progression des 14 derniers jours</h4><DailyBarChart stats={daily} /></Card>}
          <SectionTitle action={<button className="btn-text" onClick={() => setSort(!sortByProgress)}>{sortByProgress ? "Tri : avancement" : "Tri : nom"}</button>}>Participants</SectionTitle>
          {parts.length > 6 && <SearchField value={search} onChange={setSearch} placeholder="Rechercher un participant" />}
          {parts.length === 0 && (
            <EmptyState icon={<Users size={36} />} title="Aucun participant" message="Cochez les participants qui prendront part à cette campagne."
              action={<button className="btn" onClick={() => navigate(`/campagne/${id}/participants`)}>Choisir les participants</button>} />
          )}
          {visible.map((p) => <ParticipantRow key={p.user_id} p={p} onOpen={() => navigate(`/membre/${p.user_id}`)} onEdit={() => setEditGoal(p)} />)}
        </div>
      )}
      {confirm === "close" && (
        <ConfirmDialog title="Clôturer la campagne ?" message="Les participants ne pourront plus ajouter de décomptes. Vous pourrez la rouvrir à tout moment."
          confirmLabel="Clôturer" onConfirm={() => void act(() => admin.setCampaignStatus(id, "terminee"), "Campagne clôturée.")} onClose={() => setConfirm(null)} />
      )}
      {confirm === "delete" && (
        <ConfirmDialog title="Supprimer la campagne ?" destructive confirmLabel="Supprimer"
          message="La suppression n'est possible que si aucun décompte n'a encore été enregistré. Sinon, clôturez la campagne : tout l'historique sera conservé."
          onConfirm={() => void admin.deleteCampaign(id).then(() => { toast("Campagne supprimée."); navigate(-1); }).catch((e) => toast(toUserMessage(e)))}
          onClose={() => setConfirm(null)} />
      )}
      {editGoal && (
        <GoalDialog name={editGoal.profiles?.full_name ?? ""} current={Number(editGoal.personal_goal)} onClose={() => setEditGoal(null)}
          onSave={(g) => { void act(() => admin.updateGoal(id, editGoal.user_id, g), "Objectif mis à jour."); setEditGoal(null); }} />
      )}
    </>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div className="row between small info-line"><span className="muted">{label}</span><span>{value}</span></div>
);

function ParticipantRow({ p, onOpen, onEdit }: { p: Participation; onOpen: () => void; onEdit: () => void }) {
  const name = p.profiles?.full_name ?? "Participant";
  const count = Number(p.count);
  const goal = Number(p.personal_goal);
  const color = goalColor(count, goal);
  return (
    <Card onClick={onOpen}>
      <div className="row">
        <Avatar name={name} size={38} />
        <div className="grow">
          <div className="bold ellipsis">{name}</div>
          <div className="muted small ellipsis">Réalisé {fmt(count)} · Objectif {fmt(goal)} · Reste {fmt(Math.max(0, goal - count))}</div>
        </div>
        <strong style={{ color }}>{percentOf(count, goal)} %</strong>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label="Modifier l'objectif"><Pencil size={18} /></button>
      </div>
      <div className="bar thin"><div className="bar-fill" style={{ width: `${Math.min(100, goal ? (count / goal) * 100 : 0)}%`, background: color }} /></div>
    </Card>
  );
}

function GoalDialog({ name, current, onClose, onSave }: { name: string; current: number; onClose: () => void; onSave: (g: number) => void }) {
  const [text, setText] = useState(String(current));
  const v = Number(text);
  const ok = Number.isInteger(v) && v > 0;
  return (
    <Modal title={`Objectif de ${name}`} onClose={onClose} actions={<>
      <button className="btn-text" onClick={onClose}>Annuler</button>
      <button className="btn" disabled={!ok} onClick={() => onSave(v)}>Enregistrer</button>
    </>}>
      <Field label="Objectif personnel"><input inputMode="numeric" autoFocus value={text} onChange={(e) => setText(e.target.value.replace(/\D/g, "").slice(0, 12))} /></Field>
    </Modal>
  );
}

// =====================================================================
// Sélection des participants et objectifs
// =====================================================================
export function AssignScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { toast } = useSession();
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<Profile[]>([]);
  const [existing, setExisting] = useState<Record<string, Participation>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [sameGoal, setSameGoal] = useState(false);
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    Promise.all([zikr.campaign(id), admin.allActiveMembers(), zikr.campaignParticipants(id)])
      .then(([c, m, parts]) => {
        setCamp(c);
        setMembers(m);
        const ex = Object.fromEntries(parts.map((p) => [p.user_id, p]));
        setExisting(ex);
        setSelected(Object.fromEntries(parts.map((p) => [p.user_id, String(p.personal_goal)])));
      })
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoading(false));
  }, [id, setError]);

  const defaultGoal = () => Object.values(selected).filter(Boolean).slice(-1)[0] ?? "";
  const toggle = (uid: string) => setSelected((s) => {
    const n = { ...s };
    if (uid in n) delete n[uid]; else n[uid] = existing[uid] ? String(existing[uid].personal_goal) : defaultGoal();
    return n;
  });
  const s = search.trim().toLowerCase();
  const filtered = members.filter((m) => (!onlySelected || m.id in selected) &&
    (!s || m.full_name.toLowerCase().includes(s) || m.username.includes(s) || (m.phone ?? "").includes(s)));
  const sumGoals = Object.values(selected).reduce((a, g) => a + (Number(g) || 0), 0);
  const goal = Number(camp?.global_goal ?? 0);
  const removedWithCounts = Object.values(existing).filter((p) => !(p.user_id in selected) && Number(p.count) > 0);
  const count = Object.keys(selected).length;

  const save = () => {
    const items = Object.entries(selected).map(([user_id, g]) => ({ user_id, goal: Number(g) || 0 }));
    if (items.some((i) => i.goal <= 0)) return setError("Chaque participant coché doit avoir un objectif supérieur à zéro.");
    void run(async () => {
      const r = await admin.setParticipants(id, items);
      toast(`Enregistré : ${r.ajoutes} ajouté(s), ${r.modifies} modifié(s), ${r.retires} retiré(s).`);
      navigate(`/campagne/${id}`, { replace: true });
    });
  };

  return (
    <>
      <TopBar title="Participants et objectifs" subtitle={camp?.title} back
        actions={<button className="icon-btn" onClick={() => navigate("/membre-nouveau")} aria-label="Nouveau membre"><UserPlus size={20} /></button>} />
      {loading ? <Spinner /> : (
        <div className="page with-bottom">
          <SearchField value={search} onChange={setSearch} placeholder="Rechercher un membre" />
          <div className="chips scroll">
            <button className={`chip ${onlySelected ? "on" : ""}`} onClick={() => setOnlySelected(!onlySelected)}>Cochés uniquement</button>
            <button className="chip" onClick={() => setSelected((sel) => {
              const n = { ...sel };
              filtered.forEach((m) => { if (!(m.id in n)) n[m.id] = existing[m.id] ? String(existing[m.id].personal_goal) : defaultGoal(); });
              return n;
            })}>Tout cocher</button>
            <button className="chip" onClick={() => setSelected({})}>Tout décocher</button>
            <button className="chip" disabled={!count} onClick={() => setSameGoal(true)}>Même objectif pour tous</button>
            <button className="chip" disabled={!count} onClick={() => {
              const each = Math.ceil(goal / count);
              setSelected((sel) => Object.fromEntries(Object.keys(sel).map((k) => [k, String(each)])));
            }}>Répartir l'objectif global</button>
          </div>
          {members.length === 0 && (
            <EmptyState icon={<Users size={36} />} title="Aucun membre" message="Créez d'abord des participants."
              action={<button className="btn" onClick={() => navigate("/membre-nouveau")}>Créer un participant</button>} />
          )}
          {filtered.map((m) => {
            const checked = m.id in selected;
            const ex = existing[m.id];
            return (
              <Card key={m.id} className="assign-row">
                <input type="checkbox" className="check" checked={checked} onChange={() => toggle(m.id)} aria-label={m.full_name} />
                <div className="grow" onClick={() => toggle(m.id)}>
                  <div className="bold ellipsis">{m.full_name}</div>
                  <div className="muted small ellipsis">@{m.username}{m.role === "admin" ? " · Administrateur" : ""}{ex ? ` · déjà ${fmt(ex.count)} réalisés` : ""}</div>
                </div>
                {checked && (
                  <input className={`goal-input ${(Number(selected[m.id]) || 0) <= 0 ? "invalid" : ""}`} inputMode="numeric" placeholder="Objectif"
                    value={selected[m.id]} onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 12); setSelected((x) => ({ ...x, [m.id]: v })); }} />
                )}
              </Card>
            );
          })}
        </div>
      )}
      <div className="bottom-bar">
        <div className="bold">{count} participant(s) coché(s)</div>
        <div className="small bold" style={{ color: sumGoals >= goal ? "var(--success)" : "var(--warning)" }}>Total des objectifs : {fmt(sumGoals)} / {fmt(goal)}</div>
        {sumGoals < goal && count > 0 && <div className="small" style={{ color: "var(--warning)" }}>Il manque {fmt(goal - sumGoals)} pour couvrir l'objectif global.</div>}
        {error && <ErrorBanner message={error} />}
        <button className="btn big" disabled={busy || loading} onClick={() => (removedWithCounts.length ? setConfirmRemoval(true) : save())}>{busy ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
      {sameGoal && (
        <GoalDialog name="tous les participants cochés" current={Number(Object.values(selected).find((g) => Number(g) > 0) ?? 100)} onClose={() => setSameGoal(false)}
          onSave={(g) => { setSelected((sel) => Object.fromEntries(Object.keys(sel).map((k) => [k, String(g)]))); setSameGoal(false); }} />
      )}
      {confirmRemoval && (
        <ConfirmDialog title="Retirer des participants ?" confirmLabel="Confirmer" onConfirm={save} onClose={() => setConfirmRemoval(false)}
          message={`${removedWithCounts.length} participant(s) décoché(s) ont déjà effectué des décomptes. Ils ne pourront plus compter, mais leurs décomptes restent comptabilisés dans la campagne et dans l'historique.`} />
      )}
    </>
  );
}

// =====================================================================
// Membres
// =====================================================================
export function MembersScreen() {
  const navigate = useNavigate();
  const me = useProfile();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 300);
  const list = usePaged<Profile>((page) => admin.members(q, filter, page), [q, filter]);
  return (
    <div className="page">
      <SearchField value={search} onChange={setSearch} placeholder="Rechercher par nom, identifiant ou téléphone" />
      <div className="chips scroll">
        {[["all", "Tous"], ["participants", "Participants"], ["admins", "Administrateurs"], ["inactive", "Désactivés"]].map(([k, l]) => (
          <button key={k} className={`chip ${filter === k ? "on" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {list.error && <ErrorBanner message={list.error} onRetry={list.refresh} />}
      {list.loading ? <Spinner /> : list.items.length === 0 && !list.error ? (
        <EmptyState icon={<Users size={36} />} title="Aucun membre trouvé" message="Ajoutez des participants avec le bouton « Nouveau membre »." />
      ) : null}
      {list.items.map((m) => (
        <Card key={m.id} onClick={() => navigate(`/membre/${m.id}`)}>
          <div className="row">
            <Avatar name={m.full_name} />
            <div className="grow">
              <div className="bold ellipsis">{m.full_name}</div>
              <div className="muted small ellipsis">@{m.username}{m.phone ? ` · ${m.phone}` : ""}</div>
            </div>
            <div className="col-end">
              {m.role === "admin" && <Tag kind="gold">{m.is_owner ? "Principal" : "Admin"}</Tag>}
              {!m.is_active && <Tag kind="danger">Désactivé</Tag>}
            </div>
          </div>
        </Card>
      ))}
      {!list.loading && <LoadMore onVisible={list.loadMore} loading={list.loadingMore} />}
      <button className="fab" onClick={() => navigate("/membre-nouveau")}><UserPlus size={20} /> {me.is_owner ? "Nouveau membre" : "Nouveau participant"}</button>
    </div>
  );
}

export function MemberFormScreen() {
  const { id } = useParams();
  const me = useProfile();
  const navigate = useNavigate();
  const { refreshProfile } = useSession();
  const [loaded, setLoaded] = useState(!id);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [edited, setEdited] = useState(!!id);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generatePassword());
  const [role, setRole] = useState<"participant" | "admin">("participant");
  const [created, setCreated] = useState<Profile | null>(null);
  const { busy, error, setError, run } = useAction();

  useEffect(() => {
    if (!id) return;
    admin.member(id).then((m) => {
      if (m) { setFullName(m.full_name); setUsername(m.username); setPhone(m.phone ?? ""); }
      setLoaded(true);
    }).catch((e) => { setError(toUserMessage(e)); setLoaded(true); });
  }, [id, setError]);

  const save = () => {
    const u = username.trim().toLowerCase();
    if (fullName.trim().length < 2) return setError("Le nom complet doit contenir au moins 2 caractères.");
    if (!USERNAME_REGEX.test(u)) return setError("L'identifiant doit contenir de 3 à 32 caractères : lettres minuscules sans accent, chiffres, point ou tiret.");
    if (!id && password.length < 6) return setError("Le mot de passe doit contenir au moins 6 caractères.");
    void run(async () => {
      if (id) {
        await admin.updateMember(id, fullName.trim(), u, phone.trim());
        if (id === me.id) await refreshProfile();
        navigate(-1);
      } else {
        setCreated(await admin.createMember(fullName.trim(), u, phone.trim(), password, role));
      }
    });
  };

  return (
    <>
      <TopBar title={id ? "Modifier le membre" : "Nouveau membre"} back />
      {!loaded ? <Spinner /> : (
        <div className="page form">
          {!id && me.is_owner && (
            <div className="segmented">
              <button className={role === "participant" ? "on" : ""} onClick={() => setRole("participant")}>Participant</button>
              <button className={role === "admin" ? "on" : ""} onClick={() => setRole("admin")}>Administrateur</button>
            </div>
          )}
          <Field label="Nom complet">
            <input value={fullName} maxLength={80} onChange={(e) => { setFullName(e.target.value); if (!edited) setUsername(suggestUsername(e.target.value)); }} />
          </Field>
          <Field label="Identifiant de connexion" hint="Lettres minuscules sans accent, chiffres, point ou tiret (3 à 32)" error={!!username && !USERNAME_REGEX.test(username)}>
            <input value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              onChange={(e) => { setUsername(e.target.value.trim().toLowerCase().slice(0, 32)); setEdited(true); }} />
          </Field>
          <Field label="Téléphone (facultatif)"><input type="tel" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
          {!id && (
            <>
              <Field label="Mot de passe provisoire" hint="La personne devra le changer à sa première connexion">
                <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
              </Field>
              <button className="btn-text" onClick={() => setPassword(generatePassword())}><RefreshCw size={16} /> Générer un autre mot de passe</button>
            </>
          )}
          {error && <ErrorBanner message={error} />}
          <button className="btn big" disabled={busy} onClick={save}>{busy ? "Enregistrement…" : id ? "Enregistrer" : "Créer le compte"}</button>
        </div>
      )}
      {created && (
        <Modal title="Compte créé" onClose={() => navigate(-1)} actions={<button className="btn" onClick={() => navigate(-1)}>Terminé</button>}>
          <p>Transmettez ces informations de connexion à {created.full_name} :</p>
          <div className="credentials">
            <div>Identifiant : <strong>{created.username}</strong></div>
            <div>Mot de passe : <strong>{password}</strong></div>
          </div>
          <p className="small muted">Le mot de passe devra être changé à la première connexion.</p>
        </Modal>
      )}
    </>
  );
}

export function MemberDetailScreen() {
  const { id = "" } = useParams();
  const me = useProfile();
  const navigate = useNavigate();
  const { toast } = useSession();
  const [m, setM] = useState<Profile | null>(null);
  const [parts, setParts] = useState<Participation[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(0);
  const [confirm, setConfirm] = useState<"promote" | "demote" | "deactivate" | "delete" | null>(null);
  const [reset, setReset] = useState(false);
  const [pwd, setPwd] = useState(generatePassword());

  const load = useCallback(async () => {
    try {
      setM(await admin.member(id));
      setParts(await zikr.myParticipations(id).catch(() => []));
    } catch (e) {
      toast(toUserMessage(e));
    } finally {
      setLoading(false);
    }
  }, [id, toast]);
  useEffect(() => { void load(); }, [load]);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    try { await fn(); toast(success); await load(); } catch (e) { toast(toUserMessage(e)); }
  };

  if (loading) return <><TopBar title="Membre" back /><Spinner /></>;
  if (!m) return <><TopBar title="Membre" back /><div className="page"><ErrorBanner message="Membre introuvable." /></div></>;

  const isSelf = m.id === me.id;
  const canManage = !isSelf && !m.is_owner && (m.role !== "admin" || me.is_owner);
  const texts = {
    promote: ["Nommer administrateur ?", `${m.full_name} pourra gérer les campagnes et les participants.`, "Nommer", false],
    demote: ["Retirer les droits ?", `${m.full_name} redeviendra simple participant.`, "Retirer", true],
    deactivate: ["Désactiver le compte ?", `${m.full_name} ne pourra plus se connecter. Ses données sont conservées et le compte peut être réactivé.`, "Désactiver", true],
    delete: ["Supprimer le compte ?", `Le compte de ${m.full_name} sera supprimé définitivement. Ses décomptes restent conservés dans l'historique des campagnes.`, "Supprimer", true],
  } as const;

  return (
    <>
      <TopBar title={m.full_name} back actions={(canManage || isSelf) ? <button className="icon-btn" onClick={() => navigate(`/membre/${id}/modifier`)} aria-label="Modifier"><Pencil size={20} /></button> : undefined} />
      <Tabs tabs={["Fiche", "Décomptes"]} value={tab} onChange={setTab} />
      {tab === 1 ? <EntriesList userId={id} campaignId={null} showUser={false} /> : (
        <div className="page">
          <Card>
            <div className="row">
              <Avatar name={m.full_name} size={56} />
              <div className="grow">
                <div className="card-title big">{m.full_name}</div>
                <div className="muted">@{m.username}</div>
                <div className="primary-text small bold">{m.is_owner ? "Administrateur principal" : m.role === "admin" ? "Administrateur" : "Participant"}</div>
              </div>
              {!m.is_active && <Tag kind="danger">Désactivé</Tag>}
            </div>
            {m.phone && <div className="small">Téléphone : {m.phone}</div>}
          </Card>
          {canManage && (
            <Card>
              <SectionTitle>Actions</SectionTitle>
              <button className="list-link" onClick={() => { setPwd(generatePassword()); setReset(true); }}><KeyRound size={20} /> Réinitialiser le mot de passe</button>
              {me.is_owner && (m.role === "admin"
                ? <button className="list-link" onClick={() => setConfirm("demote")}><UserMinus size={20} /> Retirer les droits d'administrateur</button>
                : <button className="list-link" onClick={() => setConfirm("promote")}><ShieldCheck size={20} /> Nommer administrateur</button>)}
              {m.is_active
                ? <button className="list-link" onClick={() => setConfirm("deactivate")}><Ban size={20} /> Désactiver le compte</button>
                : <button className="list-link" onClick={() => void act(() => admin.setActive(id, true), "Compte réactivé.")}><CheckCircle2 size={20} /> Réactiver le compte</button>}
              <button className="list-link danger-text" onClick={() => setConfirm("delete")}><Trash2 size={20} /> Supprimer le compte</button>
            </Card>
          )}
          <SectionTitle>Participations ({parts.length})</SectionTitle>
          {parts.length === 0 && <p className="muted">Ce membre ne participe à aucune campagne.</p>}
          {parts.map((p) => (
            <Card key={p.campaign_id} onClick={() => navigate(`/campagne/${p.campaign_id}`)}>
              <div className="bold">{p.campaigns?.title ?? "Campagne"}</div>
              <div className="primary-text small">{p.campaigns?.zikr_type}</div>
              <LabeledProgress label="Objectif personnel" done={Number(p.count)} goal={Number(p.personal_goal)} />
            </Card>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmDialog title={texts[confirm][0]} message={texts[confirm][1]} confirmLabel={texts[confirm][2]} destructive={texts[confirm][3]}
          onClose={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "promote") void act(() => admin.setRole(id, "admin"), "Nommé administrateur.");
            if (confirm === "demote") void act(() => admin.setRole(id, "participant"), "Droits d'administrateur retirés.");
            if (confirm === "deactivate") void act(() => admin.setActive(id, false), "Compte désactivé.");
            if (confirm === "delete") void admin.deleteMember(id).then(() => { toast("Compte supprimé."); navigate(-1); }).catch((e) => toast(toUserMessage(e)));
          }} />
      )}
      {reset && (
        <Modal title="Nouveau mot de passe" onClose={() => setReset(false)} actions={<>
          <button className="btn-text" onClick={() => setReset(false)}>Annuler</button>
          <button className="btn" disabled={pwd.length < 6} onClick={() => { setReset(false); void act(() => admin.resetPassword(id, pwd), `Mot de passe réinitialisé : ${pwd}`); }}>Réinitialiser</button>
        </>}>
          <p>Communiquez ce mot de passe provisoire à {m.full_name}. Il devra le changer à sa prochaine connexion.</p>
          <PasswordInput value={pwd} onChange={setPwd} autoComplete="new-password" />
          <button className="btn-text" onClick={() => setPwd(generatePassword())}>Générer un autre</button>
        </Modal>
      )}
    </>
  );
}
