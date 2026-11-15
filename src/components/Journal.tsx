import { useState } from 'react';
import type { Historique } from '../lib/types';
import { fmtCourt, fmtHeure, toISODate } from '../lib/dates';
import { Vide } from './ui';

const CHAMPS: Record<string, string> = {
  nom_lot: 'Nom du lot', espece: 'Espèce', race: 'Race', date_debut: 'Date de mise', duree_jours: 'Durée (j)',
  nb_oeufs: 'Œufs mis', couveuse_id: 'Couveuse', responsable_id: 'Responsable', observations: 'Observations',
  statut: 'Statut', date_fin: 'Date de fin', oeufs_fecondes: 'Fécondés', oeufs_non_fecondes: 'Non fécondés',
  oeufs_retires: 'Retirés', oeufs_casses: 'Cassés', oeufs_eclos: 'Éclos', oeufs_non_eclos: 'Non éclos',
  rappels_actifs: 'Rappels', titre: 'Intitulé', date_prevue: 'Date prévue', heure: 'Heure', rappel: 'Rappel',
  fait: 'Fait', notes: 'Notes', temperature: 'Température', humidite: 'Humidité', retournements: 'Retournements',
  retournements_prevus: 'Retournements prévus', fecondes: 'Fécondés', clairs: 'Clairs', morts: 'Morts',
  nom: 'Nom', capacite: 'Capacité', type: 'Type', etat: 'État', duree_defaut: 'Durée par défaut', legende: 'Légende',
  numero: 'Numéro',
};

const IGNORER = new Set(['id', 'created_at', 'updated_at', 'created_by', 'updated_by', 'fait_par', 'fait_le', 'couvaison_id', 'auto', 'ordre', 'chemin']);

function val(v: unknown): string {
  if (v == null || v === '') return '—';
  if (v === true) return 'oui';
  if (v === false) return 'non';
  if (typeof v === 'string' && /^[0-9a-f]{8}-/.test(v)) return '(modifié)';
  return String(v);
}

export function quand(ts: string) {
  const d = new Date(ts);
  return `${fmtCourt(toISODate(d))} · ${fmtHeure(ts)}`;
}

export default function Journal({ lignes, avecLibelle = false }: { lignes: Historique[]; avecLibelle?: boolean }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  if (!lignes.length) return <Vide titre="Aucune modification enregistrée" texte="Les actions de l'équipe apparaîtront ici après synchronisation." />;
  return (
    <div className="carte liste">
      {lignes.map((h) => {
        const details = h.action === 'UPDATE' && h.changements
          ? Object.entries(h.changements).filter(([k]) => !IGNORER.has(k))
          : [];
        return (
          <button key={h.id} className="ligne" style={{ display: 'block' }} onClick={() => setOuvert(ouvert === h.id ? null : h.id)}>
            <div className="petit">
              <b>{h.utilisateur_nom ?? 'Système'}</b> {h.resume}
              {avecLibelle && h.libelle ? <> · <b>{h.libelle}</b></> : null}
            </div>
            <div className="gris petit">{quand(h.created_at)}{details.length ? ` · ${details.length} champ(s) — toucher pour voir` : ''}</div>
            {ouvert === h.id && details.length > 0 && (
              <div className="mt-s petit">
                {details.map(([k, v]: [string, any]) => (
                  <div key={k}><span className="gris">{CHAMPS[k] ?? k} :</span> {val(v?.avant)} → <b>{val(v?.apres)}</b></div>
                ))}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
