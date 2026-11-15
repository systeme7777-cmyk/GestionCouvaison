import { AlertTriangle, ChevronLeft, Download, Inbox, Plus, Search, X } from 'lucide-react';
import {
  Children, cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef, useState, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useEtatSync } from '../hooks/useData';
import { synchroniser } from '../lib/sync';
import { aujourdhui } from '../lib/format';

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------
type Toast = { texte: string; err?: boolean } | null;
const ToastCtx = createContext<(t: string, err?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<Toast>(null);
  const timer = useRef<any>(null);
  const montrer = (texte: string, err = false) => {
    setT({ texte, err });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setT(null), err ? 5000 : 2600);
  };
  return (
    <ToastCtx.Provider value={montrer}>
      {children}
      {t && <div className={'toast' + (t.err ? ' err' : '')} role="status">{t.texte}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------------------
// En-tête
// ---------------------------------------------------------------------------
export function PastilleSync() {
  const e = useEtatSync();
  const nav = useNavigate();
  let cls = 'sync', txt = 'Synchronisé';
  if (e.erreurs > 0) { cls += ' erreur'; txt = `${e.erreurs} erreur${e.erreurs > 1 ? 's' : ''}`; }
  else if (!e.enLigne) { cls += ' hors'; txt = e.attente ? `Hors ligne · ${e.attente}` : 'Hors ligne'; }
  else if (e.attente > 0) { cls += ' encours'; txt = `Envoi · ${e.attente}`; }
  else if (e.enCours) { cls += ' encours'; txt = 'Synchro…'; }
  return (
    <button className={cls} onClick={() => { synchroniser(); nav('/parametres/synchronisation'); }} aria-label="État de synchronisation">
      <span className="point" />{txt}
    </button>
  );
}

export function Entete({ titre, sousTitre, retour }: { titre: string; sousTitre?: string; retour?: boolean }) {
  const nav = useNavigate();
  return (
    <header className="entete">
      {retour ? (
        <button className="retour" onClick={() => nav(-1)} aria-label="Retour"><ChevronLeft size={26} /></button>
      ) : (
        <div className="logo-mini"><img src="./icon.png" alt="" /></div>
      )}
      <div className="titre">
        <b>{titre}</b>
        <small>{sousTitre ?? 'ANSAR ELEVAGE · Gestion Avicole'}</small>
      </div>
      <PastilleSync />
    </header>
  );
}

export function Page({ titre, sousTitre, retour, children, action }: {
  titre: string; sousTitre?: string; retour?: boolean; children: ReactNode; action?: ReactNode;
}) {
  return (
    <>
      <Entete titre={titre} sousTitre={sousTitre} retour={retour} />
      <main className="contenu">{children}</main>
      {action}
    </>
  );
}

export function BoutonAjout({ onClick, libelle = 'Ajouter' }: { onClick: () => void; libelle?: string }) {
  return <button className="fab" onClick={onClick} aria-label={libelle}><Plus size={28} /></button>;
}

// ---------------------------------------------------------------------------
// Feuille modale (formulaires)
// ---------------------------------------------------------------------------
export function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); onFermer(); };
    window.addEventListener('ae-retour', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('ae-retour', h); document.body.style.overflow = ''; };
  }, [onFermer]);
  return createPortal(
    <div className="voile" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="feuille" role="dialog" aria-label={titre}>
        <div className="feuille-tete">
          <h3>{titre}</h3>
          <button onClick={onFermer} aria-label="Fermer"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// Confirmation
type Conf = { texte: string; ok: string; danger?: boolean; resoudre: (v: boolean) => void } | null;
const ConfCtx = createContext<(texte: string, ok?: string, danger?: boolean) => Promise<boolean>>(async () => false);
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [c, setC] = useState<Conf>(null);
  const demander = (texte: string, ok = 'Confirmer', danger = true) =>
    new Promise<boolean>((resoudre) => setC({ texte, ok, danger, resoudre }));
  const fin = (v: boolean) => { c?.resoudre(v); setC(null); };
  return (
    <ConfCtx.Provider value={demander}>
      {children}
      {c && (
        <Feuille titre="Confirmation" onFermer={() => fin(false)}>
          <p style={{ marginTop: 0 }}>{c.texte}</p>
          <div className="actions">
            <button className="btn second" onClick={() => fin(false)}>Annuler</button>
            <button className={'btn' + (c.danger ? ' danger' : '')} onClick={() => fin(true)}>{c.ok}</button>
          </div>
        </Feuille>
      )}
    </ConfCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfCtx);

// ---------------------------------------------------------------------------
// Champs de formulaire
// ---------------------------------------------------------------------------
export function Champ({ label, aide, erreur, children }: { label: string; aide?: ReactNode; erreur?: string | null; children: ReactNode }) {
  const id = useId();
  const kids = Children.toArray(children);
  const premier = kids[0];
  const lie = isValidElement(premier) ? cloneElement(premier as any, { id }) : premier;
  return (
    <div className="champ">
      <label htmlFor={id}>{label}</label>
      {lie}{kids.slice(1)}
      {erreur ? <div className="aide err">{erreur}</div> : aide ? <div className="aide">{aide}</div> : null}
    </div>
  );
}

export function Texte({ label, valeur, onChange, type = 'text', placeholder, aide, requis, ...rest }: {
  label: string; valeur: any; onChange: (v: string) => void; type?: string; placeholder?: string; aide?: ReactNode;
  requis?: boolean; [k: string]: any;
}) {
  return (
    <Champ label={label + (requis ? ' *' : '')} aide={aide}>
      <input className="saisie" type={type} value={valeur ?? ''} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} {...rest} />
    </Champ>
  );
}

export function Nombre({ label, valeur, onChange, aide, min = 0, pas = 'any', requis, entier }: {
  label: string; valeur: any; onChange: (v: number | '') => void; aide?: ReactNode; min?: number; pas?: string; requis?: boolean; entier?: boolean;
}) {
  return (
    <Champ label={label + (requis ? ' *' : '')} aide={aide}>
      <input className="saisie" type="number" inputMode={entier ? 'numeric' : 'decimal'} min={min} step={entier ? 1 : pas}
        value={valeur === null || valeur === undefined ? '' : valeur}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
    </Champ>
  );
}

export function DateChamp({ label, valeur, onChange, requis }: { label: string; valeur: string; onChange: (v: string) => void; requis?: boolean }) {
  return (
    <Champ label={label + (requis ? ' *' : '')}>
      <input className="saisie" type="date" value={valeur || ''} max="2100-12-31" onChange={(e) => onChange(e.target.value)} />
    </Champ>
  );
}

export function Choix({ label, valeur, onChange, options, vide, aide, requis }: {
  label: string; valeur: any; onChange: (v: string) => void; options: { v: string; t: string }[];
  vide?: string; aide?: ReactNode; requis?: boolean;
}) {
  return (
    <Champ label={label + (requis ? ' *' : '')} aide={aide}>
      <select className="saisie" value={valeur ?? ''} onChange={(e) => onChange(e.target.value)}>
        {vide !== undefined && <option value="">{vide}</option>}
        {options.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
    </Champ>
  );
}

export function Zone({ label, valeur, onChange, placeholder }: { label: string; valeur: any; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Champ label={label}>
      <textarea className="saisie" value={valeur ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </Champ>
  );
}

export function Case({ label, valeur, onChange }: { label: ReactNode; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="case">
      <input type="checkbox" checked={!!valeur} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

/** Champ texte avec suggestions (liste de clients, fournisseurs…) */
export function TexteSuggestions({ label, valeur, onChange, suggestions, placeholder, requis }: {
  label: string; valeur: string; onChange: (v: string) => void; suggestions: string[]; placeholder?: string; requis?: boolean;
}) {
  const id = useRef('dl' + Math.random().toString(36).slice(2)).current;
  return (
    <Champ label={label + (requis ? ' *' : '')}>
      <input className="saisie" list={id} value={valeur ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <datalist id={id}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
    </Champ>
  );
}

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------
export function Vide({ texte, children }: { texte: string; children?: ReactNode }) {
  return <div className="vide"><Inbox size={46} /><div>{texte}</div>{children}</div>;
}

export function Recherche({ valeur, onChange, placeholder = 'Rechercher…' }: { valeur: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="recherche">
      <Search size={18} />
      <input className="saisie" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Puces<T extends string>({ valeur, onChange, options }: { valeur: T; onChange: (v: T) => void; options: { v: T; t: string }[] }) {
  return (
    <div className="puces">
      {options.map((o) => (
        <button key={o.v} className={'puce' + (o.v === valeur ? ' actif' : '')} onClick={() => onChange(o.v)}>{o.t}</button>
      ))}
    </div>
  );
}

export function Alerte({ type = 'jaune', children }: { type?: 'jaune' | 'rouge' | 'vert'; children: ReactNode }) {
  return <div className={'alerte ' + type}><AlertTriangle size={17} /><div>{children}</div></div>;
}

export function Kpi({ lib, val, sous, cls = '', icone }: { lib: string; val: ReactNode; sous?: ReactNode; cls?: string; icone?: ReactNode }) {
  return (
    <div className={'kpi ' + cls}>
      <div className="lib">{icone}{lib}</div>
      <div className="val">{val}</div>
      {sous && <div className="sous">{sous}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Période
// ---------------------------------------------------------------------------
export type CodePeriode = 'jour' | 'semaine' | 'mois' | 'annee' | 'tout' | 'perso';
export interface Periode { code: CodePeriode; du: string | null; au: string | null }

export function bornesPeriode(code: CodePeriode, du?: string | null, au?: string | null): Periode {
  const auj = aujourdhui();
  const d = new Date();
  const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (code === 'jour') return { code, du: auj, au: auj };
  if (code === 'semaine') {
    const l = new Date(d); l.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { code, du: fmt(l), au: auj };
  }
  if (code === 'mois') return { code, du: auj.slice(0, 8) + '01', au: auj };
  if (code === 'annee') return { code, du: auj.slice(0, 4) + '-01-01', au: auj };
  if (code === 'perso') return { code, du: du ?? null, au: au ?? null };
  return { code: 'tout', du: null, au: null };
}

export function ChoixPeriode({ periode, onChange }: { periode: Periode; onChange: (p: Periode) => void }) {
  return (
    <>
      <Puces<CodePeriode> valeur={periode.code} onChange={(c) => onChange(bornesPeriode(c, periode.du, periode.au))} options={[
        { v: 'jour', t: "Aujourd'hui" }, { v: 'semaine', t: 'Semaine' }, { v: 'mois', t: 'Ce mois' },
        { v: 'annee', t: 'Cette année' }, { v: 'tout', t: 'Tout' }, { v: 'perso', t: 'Dates…' },
      ]} />
      {periode.code === 'perso' && (
        <div className="filtres-grille">
          <input className="saisie" type="date" value={periode.du ?? ''} onChange={(e) => onChange({ ...periode, du: e.target.value || null })} aria-label="Du" />
          <input className="saisie" type="date" value={periode.au ?? ''} onChange={(e) => onChange({ ...periode, au: e.target.value || null })} aria-label="Au" />
        </div>
      )}
    </>
  );
}

export function MenuExport({ onExport }: { onExport: (f: 'pdf' | 'xlsx' | 'csv') => Promise<void> | void }) {
  const [ouvert, setOuvert] = useState(false);
  const toast = useToast();
  const go = async (f: 'pdf' | 'xlsx' | 'csv') => {
    setOuvert(false);
    try { await onExport(f); } catch (e: any) { toast('Export impossible : ' + (e?.message ?? e), true); }
  };
  return (
    <>
      <button className="btn second petit" onClick={() => setOuvert(true)}><Download size={16} />Exporter</button>
      {ouvert && (
        <Feuille titre="Exporter" onFermer={() => setOuvert(false)}>
          <div className="liste">
            <button className="ligne" onClick={() => go('pdf')}><div className="ico-rond">📄</div><div className="corps"><b>PDF</b><small>Pour imprimer ou envoyer</small></div></button>
            <button className="ligne" onClick={() => go('xlsx')}><div className="ico-rond">📊</div><div className="corps"><b>Excel (.xlsx)</b><small>Pour calculer et analyser</small></div></button>
            <button className="ligne" onClick={() => go('csv')}><div className="ico-rond">🧾</div><div className="corps"><b>CSV</b><small>Format universel</small></div></button>
          </div>
        </Feuille>
      )}
    </>
  );
}
