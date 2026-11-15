import { Link } from 'react-router-dom';
import { Egg } from 'lucide-react';
import type { Couvaison, Couveuse, Operation } from '../lib/types';
import { suivi, taux, fmtPct } from '../lib/calc';
import { fmtCourt, today } from '../lib/dates';
import { Barre, COULEUR_STATUT } from './ui';

const COURT: Record<string, string> = {
  mirage: 'Mirage à faire', arret_retournement: 'Arrêt retournement', preparation_eclosion: 'Préparer éclosion',
  retournement: 'Retournement', temperature: 'Contrôle temp.', humidite: 'Contrôle hum.', eclosion: 'Éclosion', autre: 'À faire',
};

export function badgeCouvaison(c: Couvaison, ops: Operation[]): { texte: string; couleur: string } {
  const s = suivi(c);
  if (s.statut === 'annulee') return { texte: 'Annulée', couleur: 'rouge' };
  if (s.statut === 'terminee') {
    const t = taux(c).eclosionTotale;
    return { texte: t != null ? `Éclos ${fmtPct(t)}` : 'Terminée', couleur: 'gris' };
  }
  if (s.statut === 'preparation') return { texte: 'En préparation', couleur: 'bleu' };
  if (s.statut === 'proche') {
    if (s.enRetard) return { texte: 'Éclosion dépassée', couleur: 'rouge' };
    return { texte: s.joursRestants === 0 ? "Éclosion aujourd'hui" : `Éclosion J-${s.joursRestants}`, couleur: 'orange' };
  }
  const due = ops.filter((o) => o.couvaison_id === c.id && !o.fait && o.date_prevue <= today() && o.type !== 'eclosion')
    .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue))[0];
  if (due) return { texte: COURT[due.type] ?? 'À faire', couleur: 'rouge' };
  return { texte: 'Normal', couleur: 'vert' };
}

export default function CarteCouvaison({ c, ops, couveuses, enAttente }: {
  c: Couvaison; ops: Operation[]; couveuses: Couveuse[]; enAttente?: boolean;
}) {
  const s = suivi(c);
  const b = badgeCouvaison(c, ops);
  const coul = COULEUR_STATUT[s.statut];
  const couveuse = couveuses.find((x) => x.id === c.couveuse_id)?.nom;
  return (
    <Link to={`/couvaisons/${c.id}`} className="couv-carte">
      <div className="haut">
        <span className={`icone-oeuf ${coul}`}><Egg size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="gras" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nom_lot || c.numero || 'Couvaison'}
          </div>
          <div className="gris petit" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[c.espece + (c.race ? ` ${c.race}` : ''), `${c.nb_oeufs} œufs`, couveuse].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className={`badge ${b.couleur}`}>{b.texte}</span>
      </div>
      <Barre valeur={s.progression} couleur={coul === 'vert' ? '' : coul === 'gris' ? 'grise' : coul} />
      <div className="bas">
        <span>{c.numero ?? (enAttente ? 'N° attribué à la synchro' : '')} · Démarré le {fmtCourt(c.date_debut)}</span>
        <b>{s.statut === 'terminee' || s.statut === 'annulee' ? `Fin ${fmtCourt(c.date_fin ?? s.dateEclosion)}` : `J${Math.min(s.jour, c.duree_jours)} / ${c.duree_jours}`}</b>
      </div>
    </Link>
  );
}
