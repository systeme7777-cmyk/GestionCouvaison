import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Egg, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useCouvaisons, useOperations, useProfils } from '../hooks/useData';
import { estActive, suivi } from '../lib/calc';
import { NOMS_MOIS, diffDays, fmtLong, parseISODate, toISODate, today } from '../lib/dates';
import { modifier, supprimer } from '../lib/sync';
import type { Operation } from '../lib/types';
import { EnteteRetour, Vide, useDialogs } from '../components/ui';
import OperationForm from '../components/OperationForm';

export default function Calendrier() {
  const { peutEcrire } = useAuth();
  const { confirmer, toast } = useDialogs();
  const couvaisons = useCouvaisons();
  const ops = useOperations();
  const profils = useProfils();
  const [choisi, setChoisi] = useState(today());
  const [mois, setMois] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [edition, setEdition] = useState<Operation | 'nouvelle' | null>(null);
  const [toutes, setToutes] = useState(false);

  const parCouv = useMemo(() => new Map(couvaisons.map((c) => [c.id, c])), [couvaisons]);
  const visibles = ops.filter((o) => { const c = parCouv.get(o.couvaison_id); return c && (toutes || estActive(c)); });

  const parJour = useMemo(() => {
    const m = new Map<string, { op: number; eclo: number; fait: number }>();
    for (const o of visibles) {
      const e = m.get(o.date_prevue) ?? { op: 0, eclo: 0, fait: 0 };
      if (o.fait) e.fait++; else if (o.type === 'eclosion') e.eclo++; else e.op++;
      m.set(o.date_prevue, e);
    }
    return m;
  }, [visibles]);

  // Grille du mois (semaine commençant le lundi)
  const jours: string[] = [];
  const debut = new Date(mois);
  debut.setDate(1 - ((mois.getDay() + 6) % 7));
  for (let i = 0; i < 42; i++) { const d = new Date(debut); d.setDate(debut.getDate() + i); jours.push(toISODate(d)); }

  const duJour = visibles.filter((o) => o.date_prevue === choisi)
    .sort((a, b) => Number(a.fait) - Number(b.fait) || (a.heure ?? '').localeCompare(b.heure ?? ''));
  const enRetard = visibles.filter((o) => !o.fait && o.date_prevue < today()).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));
  const aVenir = visibles.filter((o) => !o.fait && o.date_prevue > today()).sort((a, b) => a.date_prevue.localeCompare(b.date_prevue)).slice(0, 8);

  const ligne = (o: Operation, avecDate = false) => {
    const c = parCouv.get(o.couvaison_id)!;
    const par = profils.find((p) => p.id === o.fait_par)?.nom;
    return (
      <div key={o.id} className={`ligne ${o.fait ? 'faite' : ''}`}>
        <button className={`coche ${o.fait ? 'ok' : ''}`} disabled={!peutEcrire} aria-label="Fait" onClick={() => modifier('operations', o.id, { fait: !o.fait })}>
          {o.fait && <Check size={16} strokeWidth={3} />}
        </button>
        <div className="corps" onClick={() => peutEcrire && setEdition(o)}>
          <div className="titre">{o.titre}</div>
          <div className="sous">
            <Link to={`/couvaisons/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'underline' }}>{c.nom_lot || c.numero}</Link>
            {` · J${diffDays(c.date_debut, o.date_prevue)}`}
            {avecDate ? ` · ${fmtLong(o.date_prevue)}` : ''}{o.heure ? ` · ${o.heure.slice(0, 5)}` : ''}{o.rappel ? ' · 🔔' : ''}
            {o.fait && par ? ` · fait par ${par}` : ''}
          </div>
        </div>
        {peutEcrire && (
          <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Supprimer" onClick={async () => {
            if (await confirmer({ titre: "Supprimer l'opération ?", message: `« ${o.titre} » sera supprimée.` })) { await supprimer('operations', o.id); toast('Opération supprimée'); }
          }}><Trash2 size={15} /></button>
        )}
      </div>
    );
  };

  const eclosionsDuJour = couvaisons.filter((c) => estActive(c) && suivi(c).dateEclosion === choisi);

  return (
    <div className="page">
      <EnteteRetour titre="Calendrier des opérations" droite={peutEcrire ? <button className="btn-rond" aria-label="Ajouter" onClick={() => setEdition('nouvelle')}><Plus size={20} /></button> : undefined} />

      <div className="calendrier">
        <div className="cal-entete">
          <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Mois précédent" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}><ChevronLeft size={18} /></button>
          <b>{NOMS_MOIS[mois.getMonth()]} {mois.getFullYear()}</b>
          <button className="btn-rond" style={{ width: 36, height: 36 }} aria-label="Mois suivant" onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}><ChevronRight size={18} /></button>
        </div>
        <div className="cal-grille">
          {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => <div key={i} className="jsem">{j}</div>)}
          {jours.map((j) => {
            const e = parJour.get(j);
            const hors = parseISODate(j).getMonth() !== mois.getMonth();
            return (
              <button key={j} className={`cal-jour ${hors ? 'hors' : ''} ${j === today() ? 'aujourdhui' : ''} ${j === choisi ? 'choisi' : ''}`} onClick={() => setChoisi(j)}>
                {parseISODate(j).getDate()}
                <span className="points">
                  {e?.eclo ? <i className="e" /> : null}
                  {e?.op ? <i /> : null}
                  {e?.fait && !e.op && !e.eclo ? <i className="f" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        <div className="legende" style={{ justifyContent: 'center' }}>
          <span><i style={{ background: 'var(--orange)', borderRadius: 9 }} />À faire</span>
          <span><i style={{ background: 'var(--rouge)', borderRadius: 9 }} />Éclosion</span>
          <span><i style={{ background: 'var(--gris-clair)', borderRadius: 9 }} />Fait</span>
        </div>
      </div>
      <label className="flex petit mt-s" style={{ justifyContent: 'flex-end' }}>
        <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} /> Inclure les couvaisons terminées
      </label>

      <div className="section-titre"><h2 style={{ textTransform: 'capitalize' }}>{fmtLong(choisi)}</h2></div>
      {eclosionsDuJour.map((c) => (
        <Link key={c.id} to={`/couvaisons/${c.id}`} className="note flex mb"><Egg size={18} /> Éclosion prévue : {c.nom_lot || c.numero}</Link>
      ))}
      {duJour.length === 0 ? <div className="carte"><Vide titre="Aucune opération ce jour" /></div> : <div className="carte liste">{duJour.map((o) => ligne(o))}</div>}

      {enRetard.length > 0 && (
        <>
          <div className="section-titre"><h2 className="rouge-txt">En retard ({enRetard.length})</h2></div>
          <div className="carte liste">{enRetard.map((o) => ligne(o, true))}</div>
        </>
      )}
      <div className="section-titre"><h2>À venir</h2></div>
      {aVenir.length === 0 ? <div className="carte"><Vide titre="Rien de planifié" /></div> : <div className="carte liste">{aVenir.map((o) => ligne(o, true))}</div>}

      {edition && <OperationForm op={edition === 'nouvelle' ? undefined : edition} couvaisons={couvaisons} dateDefaut={choisi} onFermer={() => setEdition(null)} />}
    </div>
  );
}
