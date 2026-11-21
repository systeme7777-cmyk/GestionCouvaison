import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, ArrowLeft, Eye, EyeOff, Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmt, initials, percentOf, dateShort } from "../lib/format";
import { PHASE_LABEL, type DailyStat, type Phase } from "../lib/types";

export function ProgressRing({ progress, size = 200, stroke = 14, color = "var(--primary)", children }: {
  progress: number; size?: number; stroke?: number; color?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset .45s ease" }}
        />
      </svg>
      <div className="ring-content">{children}</div>
    </div>
  );
}

export function LabeledProgress({ label, done, goal, color = "var(--primary)" }: { label: string; done: number; goal: number; color?: string }) {
  const reached = goal > 0 && done >= goal;
  const c = reached ? "var(--success)" : color;
  const p = goal > 0 ? Math.min(1, done / goal) : 0;
  return (
    <div className="lprog">
      <div className="row between"><span className="label-strong">{label}</span><span className="muted small">{fmt(done)} / {fmt(goal)}</span></div>
      <div className="bar"><div className="bar-fill" style={{ width: `${p * 100}%`, background: c }} /></div>
      <div className="row between small">
        <strong style={{ color: c }}>{percentOf(done, goal)} %</strong>
        <span className="muted">{reached ? "Objectif atteint" : `Reste ${fmt(Math.max(0, goal - done))}`}</span>
      </div>
    </div>
  );
}

export function StatTile({ label, value, icon, accent = "var(--primary)" }: { label: string; value: string; icon: ReactNode; accent?: string }) {
  return (
    <div className="card stat">
      <div className="stat-icon" style={{ color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)` }}>{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="muted small">{label}</div>
    </div>
  );
}

export function Card({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <div className={`card ${onClick ? "clickable" : ""} ${className}`} onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="section-title"><h3>{children}</h3>{action}</div>;
}

export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p className="muted">{message}</p>
      {action}
    </div>
  );
}

export const Spinner = () => <div className="spinner-wrap"><div className="spinner" /></div>;

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner">
      <AlertCircle size={20} />
      <span>{message}</span>
      {onRetry && <button className="btn-text" onClick={onRetry}>Réessayer</button>}
    </div>
  );
}

export function Modal({ title, children, actions, onClose }: { title: string; children: ReactNode; actions: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose, destructive = false }: {
  title: string; message: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; destructive?: boolean;
}) {
  return (
    <Modal title={title} onClose={onClose} actions={<>
      <button className="btn-text" onClick={onClose}>Annuler</button>
      <button className={destructive ? "btn danger" : "btn"} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
    </>}>
      <p>{message}</p>
    </Modal>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="search">
      <Search size={18} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} type="search" />
      {value && <button className="icon-btn" onClick={() => onChange("")} aria-label="Effacer"><X size={18} /></button>}
    </div>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: boolean; children: ReactNode }) {
  return (
    <label className={`field ${error ? "field-error" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function PasswordInput({ value, onChange, autoComplete = "current-password", onEnter }: {
  value: string; onChange: (v: string) => void; autoComplete?: string; onEnter?: () => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="password">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete}
        onKeyDown={(e) => { if (e.key === "Enter" && onEnter) onEnter(); }} />
      <button type="button" tabIndex={-1} className="icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

export function PhaseChip({ phase, goalReached = false }: { phase: Phase; goalReached?: boolean }) {
  if (goalReached && phase !== "ended" && phase !== "closed") return <span className="tag tag-gold">Objectif atteint</span>;
  const cls = phase === "active" ? "tag-success" : phase === "upcoming" ? "tag-blue" : "tag-muted";
  return <span className={`tag ${cls}`}>{PHASE_LABEL[phase]}</span>;
}

export const Tag = ({ children, kind = "muted" }: { children: ReactNode; kind?: string }) => <span className={`tag tag-${kind}`}>{children}</span>;

export function Avatar({ name, size = 42 }: { name: string; size?: number }) {
  return <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</div>;
}

export function DailyBarChart({ stats }: { stats: DailyStat[] }) {
  const max = Math.max(1, ...stats.map((s) => Number(s.total)));
  return (
    <div>
      <div className="chart">
        {stats.map((s, i) => (
          <div key={s.day} className="chart-col" title={`${dateShort(s.day)} : ${fmt(s.total)}`}>
            <div className="chart-bar" style={{ height: `${(Math.max(0, Number(s.total)) / max) * 100}%`, background: i === stats.length - 1 ? "var(--gold)" : "var(--primary)" }} />
          </div>
        ))}
      </div>
      <div className="row between small muted">
        <span>{stats[0] ? dateShort(stats[0].day) : ""}</span>
        <span>Aujourd'hui : {fmt(stats[stats.length - 1]?.total ?? 0)}</span>
      </div>
    </div>
  );
}

export function TopBar({ title, subtitle, back, actions }: { title: string; subtitle?: string; back?: boolean; actions?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back && <button className="icon-btn" onClick={() => (history.length > 1 ? navigate(-1) : navigate("/"))} aria-label="Retour"><ArrowLeft size={22} /></button>}
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle && <div className="topbar-sub">{subtitle}</div>}
      </div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

/** Déclenche le chargement suivant quand la fin de liste devient visible. */
export function LoadMore({ onVisible, loading }: { onVisible: () => void; loading: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) cb.current(); }, { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{loading && <Spinner />}</div>;
}

export function goalColor(done: number, goal: number): string {
  if (goal > 0 && done >= goal) return "var(--success)";
  if (goal > 0 && done * 2 >= goal) return "var(--primary)";
  if (done > 0) return "var(--warning)";
  return "var(--outline)";
}
