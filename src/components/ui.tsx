import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Egg, Loader2 } from 'lucide-react';
import type { Statut } from '../lib/calc';
import { STATUTS } from '../lib/calc';

/* -------------------- Confirmation & messages -------------------- */

interface Confirmation {
  titre: string;
  message: string;
  bouton?: string;
  danger?: boolean;
}

interface DialogCtx {
  confirmer: (c: Confirmation) => Promise<boolean>;
  toast: (msg: string, erreur?: boolean) => void;
}

const Dialogs = createContext<DialogCtx>(null as any);
export const useDialogs = () => useContext(Dialogs);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [conf, setConf] = useState<(Confirmation & { resoudre: (b: boolean) => void }) | null>(null);
  const [msg, setMsg] = useState<{ texte: string; erreur: boolean } | null>(null);
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);

  const confirmer = useCallback((c: Confirmation) => new Promise<boolean>((resoudre) => setConf({ ...c, resoudre })), []);
  const toast = useCallback((texte: string, erreur = false) => {
    setMsg({ texte, erreur });
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => setMsg(null), erreur ? 5000 : 2600);
  }, []);

  const fermer = (r: boolean) => { conf?.resoudre(r); setConf(null); };

  return (
    <Dialogs.Provider value={{ confirmer, toast }}>
      {children}
      {conf && (
        <div className="voile centre" onClick={() => fermer(false)}>
          <div className="dialogue" onClick={(e) => e.stopPropagation()} role="alertdialog">
            <h3>{conf.titre}</h3>
            <p>{conf.message}</p>
            <div className="rangee-btn">
              <button className="btn" onClick={() => fermer(false)}>Annuler</button>
              <button className={`btn ${conf.danger !== false ? 'danger' : 'primaire'}`} onClick={() => fermer(true)}>
                {conf.bouton ?? 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {msg && <div className={`toast ${msg.erreur ? 'erreur' : ''}`}>{msg.texte}</div>}
    </Dialogs.Provider>
  );
}

/* -------------------- Mise en page -------------------- */

export function EnteteRetour({ titre, droite, retour }: { titre: string; droite?: ReactNode; retour?: string }) {
  const nav = useNavigate();
  return (
    <div className="entete-centre">
      <button className="btn-rond" aria-label="Retour" onClick={() => (retour ? nav(retour) : nav(-1))}>
        <ChevronLeft size={22} />
      </button>
      <h1>{titre}</h1>
      <div style={{ justifySelf: 'end' }}>{droite}</div>
    </div>
  );
}

export function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onFermer();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onFermer]);
  return (
    <div className="voile" onClick={onFermer}>
      <div className="feuille" onClick={(e) => e.stopPropagation()}>
        <div className="poignee" />
        <h3>{titre}</h3>
        {children}
      </div>
    </div>
  );
}

export function Vide({ titre, texte, icone }: { titre: string; texte?: string; icone?: ReactNode }) {
  return (
    <div className="vide">
      {icone ?? <Egg size={34} />}
      <b>{titre}</b>
      {texte && <span className="petit">{texte}</span>}
    </div>
  );
}

export function Chargement() {
  return <div className="chargement"><Loader2 className="tourne" /></div>;
}

/* -------------------- Éléments -------------------- */

export function Barre({ valeur, couleur = '' }: { valeur: number; couleur?: string }) {
  return <div className={`barre ${couleur}`}><div style={{ width: `${Math.max(0, Math.min(100, valeur))}%` }} /></div>;
}

export function Anneau({ valeur, haut, bas }: { valeur: number; haut: string; bas: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="anneau">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e3efe7" strokeWidth="9" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="#1f5c40" strokeWidth="9" strokeLinecap="butt"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, valeur) / 100)} transform="rotate(-90 48 48)" />
      </svg>
      <div className="centre"><b>{haut}</b><span>{bas}</span></div>
    </div>
  );
}

export const COULEUR_STATUT: Record<Statut, string> = {
  preparation: 'bleu', incubation: 'vert', proche: 'orange', terminee: 'gris', annulee: 'rouge',
};

export function BadgeStatut({ statut, texte }: { statut: Statut; texte?: string }) {
  return <span className={`badge ${COULEUR_STATUT[statut]}`}>{texte ?? STATUTS[statut]}</span>;
}

export function Bascule({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button type="button" aria-label={label} aria-pressed={on} className={`bascule ${on ? 'on' : ''}`} onClick={() => onChange(!on)} />;
}

export function initiales(nom: string): string {
  const p = nom.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return ((p[0][0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] ?? ''))).toUpperCase();
}

export function Avatar({ nom, index }: { nom: string; index: number }) {
  return <span className={`avatar c${index % 5}`}>{initiales(nom)}</span>;
}

/** Champ numérique tolérant la virgule (claviers français). */
export function nombreOuNull(v: string): number | null {
  const t = v.replace(',', '.').trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function entierOuNull(v: string): number | null {
  const n = nombreOuNull(v);
  return n == null ? null : Math.trunc(n);
}

export function versTexte(n: number | null | undefined): string {
  return n == null ? '' : String(n).replace('.', ',');
}
