import type { Couvaison, Mesure, Operation, TypeOperation } from './types';
import { addDays, diffDays, today } from './dates';

export type Statut = 'preparation' | 'incubation' | 'proche' | 'terminee' | 'annulee';

export const STATUTS: Record<Statut, string> = {
  preparation: 'En préparation',
  incubation: 'En incubation',
  proche: "Proche de l'éclosion",
  terminee: 'Éclosion terminée',
  annulee: 'Annulée',
};

/** Seuil (en jours restants) à partir duquel une couvaison est « proche de l'éclosion ». */
export const SEUIL_PROCHE = 3;

export interface Suivi {
  jour: number;            // jours écoulés depuis la mise en incubation (J0 = jour de mise)
  joursRestants: number;
  dateEclosion: string;
  progression: number;     // 0..100
  statut: Statut;
  enRetard: boolean;       // date d'éclosion dépassée sans clôture
}

export function dateEclosionPrevue(c: Pick<Couvaison, 'date_debut' | 'duree_jours'>): string {
  return addDays(c.date_debut, c.duree_jours);
}

export function suivi(c: Couvaison, ref: string = today()): Suivi {
  const duree = Math.max(1, c.duree_jours);
  const dateEclosion = dateEclosionPrevue(c);
  const ecoules = diffDays(c.date_debut, ref);
  const jour = Math.max(0, Math.min(ecoules, duree));
  const joursRestants = Math.max(0, duree - Math.max(0, ecoules));
  let progression = Math.round((jour / duree) * 100);
  let statut: Statut;
  if (c.statut === 'annulee') statut = 'annulee';
  else if (c.statut === 'terminee') { statut = 'terminee'; progression = 100; }
  else if (c.statut === 'preparation' || ecoules < 0) { statut = 'preparation'; progression = 0; }
  else if (joursRestants <= SEUIL_PROCHE) statut = 'proche';
  else statut = 'incubation';
  return {
    jour: Math.max(0, ecoules),
    joursRestants,
    dateEclosion,
    progression: Math.max(0, Math.min(100, progression)),
    statut,
    enRetard: statut === 'proche' && ecoules > duree,
  };
}

export function estActive(c: Couvaison): boolean {
  const s = suivi(c).statut;
  return s === 'incubation' || s === 'proche' || s === 'preparation';
}

export function estEnIncubation(c: Couvaison): boolean {
  const s = suivi(c).statut;
  return s === 'incubation' || s === 'proche';
}

/** Œufs encore en couveuse : mis − retirés − cassés − non fécondés retirés au mirage. */
export function oeufsEnCours(c: Couvaison): number {
  const retires = (c.oeufs_retires ?? 0) + (c.oeufs_casses ?? 0);
  return Math.max(0, c.nb_oeufs - retires);
}

function pct(n: number, d: number): number | null {
  if (!d || d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

export interface Taux {
  fertilite: number | null;          // fécondés / œufs mis
  eclosionTotale: number | null;     // éclos / œufs mis
  eclosionFeconds: number | null;    // éclos / fécondés
}

export function taux(c: Couvaison): Taux {
  return {
    fertilite: c.oeufs_fecondes != null ? pct(c.oeufs_fecondes, c.nb_oeufs) : null,
    eclosionTotale: c.oeufs_eclos != null ? pct(c.oeufs_eclos, c.nb_oeufs) : null,
    eclosionFeconds: c.oeufs_eclos != null && c.oeufs_fecondes ? pct(c.oeufs_eclos, c.oeufs_fecondes) : null,
  };
}

/** Vérifie la cohérence des compteurs d'œufs ; renvoie la liste des erreurs. */
export function verifierOeufs(c: Partial<Couvaison> & { nb_oeufs: number }): string[] {
  const e: string[] = [];
  const n = c.nb_oeufs;
  const v = (x: number | null | undefined) => x ?? 0;
  const champs: [keyof Couvaison, string][] = [
    ['oeufs_fecondes', 'fécondés'], ['oeufs_non_fecondes', 'non fécondés'], ['oeufs_retires', 'retirés'],
    ['oeufs_casses', 'cassés'], ['oeufs_eclos', 'éclos'], ['oeufs_non_eclos', 'non éclos'],
  ];
  for (const [k, label] of champs) {
    const x = c[k] as number | null | undefined;
    if (x != null && (x < 0 || !Number.isInteger(x))) e.push(`Le nombre d'œufs ${label} doit être un entier positif.`);
    if (x != null && x > n) e.push(`Les œufs ${label} (${x}) dépassent les œufs mis (${n}).`);
  }
  if (v(c.oeufs_fecondes) + v(c.oeufs_non_fecondes) > n)
    e.push(`Fécondés + non fécondés (${v(c.oeufs_fecondes) + v(c.oeufs_non_fecondes)}) dépassent les œufs mis (${n}).`);
  if (v(c.oeufs_eclos) + v(c.oeufs_non_eclos) > n)
    e.push(`Éclos + non éclos (${v(c.oeufs_eclos) + v(c.oeufs_non_eclos)}) dépassent les œufs mis (${n}).`);
  if (c.oeufs_fecondes != null && c.oeufs_eclos != null && c.oeufs_eclos > c.oeufs_fecondes)
    e.push(`Les œufs éclos (${c.oeufs_eclos}) ne peuvent pas dépasser les œufs fécondés (${c.oeufs_fecondes}).`);
  return e;
}

export interface OperationPlanifiee {
  type: TypeOperation;
  titre: string;
  jour: number;
}

/** Plan d'opérations proposé par défaut, proportionnel à la durée choisie (modifiable ensuite). */
export function planOperations(duree: number): OperationPlanifiee[] {
  const j1 = Math.max(1, Math.round(duree / 3));       // ~J7 pour 21 j
  const j2 = Math.max(j1 + 1, Math.round((duree * 2) / 3)); // ~J14 pour 21 j
  const arret = Math.max(1, duree - 3);                 // J18 pour 21 j
  const plan: OperationPlanifiee[] = [
    { type: 'mirage', titre: `Mirage du ${j1}e jour`, jour: j1 },
    { type: 'mirage', titre: `Mirage du ${j2}e jour`, jour: j2 },
    { type: 'arret_retournement', titre: 'Arrêter le retournement', jour: arret },
    { type: 'preparation_eclosion', titre: "Préparer l'éclosion (humidité ↑)", jour: arret },
    { type: 'eclosion', titre: 'Éclosion prévue', jour: duree },
  ];
  return plan.filter((p) => p.jour <= duree);
}

/** Le retournement est-il encore d'actualité ce jour-là ? */
export function retournementActif(c: Couvaison, ops: Operation[], ref = today()): boolean {
  const arret = ops.find((o) => o.couvaison_id === c.id && o.type === 'arret_retournement');
  const limite = arret ? arret.date_prevue : addDays(c.date_debut, Math.max(1, c.duree_jours - 3));
  return ref >= c.date_debut && ref < limite;
}

export function mesureDuJour(mesures: Mesure[], couvaisonId: string, ref = today()): Mesure | undefined {
  return mesures.find((m) => m.couvaison_id === couvaisonId && m.date_mesure === ref);
}

export function fmtPct(x: number | null | undefined, dec = 0): string {
  if (x == null || Number.isNaN(x)) return '—';
  return `${x.toFixed(dec).replace('.', ',')} %`;
}

export function fmtNombre(x: number | null | undefined, dec = 0): string {
  if (x == null || Number.isNaN(x)) return '—';
  return Number(x).toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
