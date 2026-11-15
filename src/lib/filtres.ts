import type { Couvaison } from './types';
import { estActive, suivi, type Statut } from './calc';

export interface Filtres {
  texte: string;
  espece: string;
  race: string;
  du: string;
  au: string;
  couveuse: string;
  responsable: string;
  statut: '' | Statut;
}

export const FILTRES_VIDES: Filtres = { texte: '', espece: '', race: '', du: '', au: '', couveuse: '', responsable: '', statut: '' };

const norm = (s: string | null | undefined) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrer(cs: Couvaison[], f: Filtres, noms: { couveuse: (id: string | null) => string; responsable: (id: string | null) => string }): Couvaison[] {
  const t = norm(f.texte.trim());
  return cs.filter((c) => {
    if (f.espece && c.espece !== f.espece) return false;
    if (f.race && !norm(c.race).includes(norm(f.race))) return false;
    if (f.du && c.date_debut < f.du) return false;
    if (f.au && c.date_debut > f.au) return false;
    if (f.couveuse && c.couveuse_id !== f.couveuse) return false;
    if (f.responsable && c.responsable_id !== f.responsable) return false;
    if (f.statut && suivi(c).statut !== f.statut) return false;
    if (t) {
      const champs = [c.numero, c.nom_lot, c.espece, c.race, c.observations, noms.couveuse(c.couveuse_id), noms.responsable(c.responsable_id)];
      if (!champs.some((x) => norm(x).includes(t))) return false;
    }
    return true;
  });
}

export function trier(cs: Couvaison[], historique: boolean): Couvaison[] {
  return [...cs].sort((a, b) => historique
    ? b.date_debut.localeCompare(a.date_debut)
    : suivi(a).dateEclosion.localeCompare(suivi(b).dateEclosion));
}

export function separer(cs: Couvaison[]) {
  return { enCours: cs.filter(estActive), historique: cs.filter((c) => !estActive(c)) };
}

export function decrireFiltres(f: Filtres, noms: { couveuse: (id: string) => string; responsable: (id: string) => string }): string {
  const p: string[] = [];
  if (f.texte) p.push(`« ${f.texte} »`);
  if (f.espece) p.push(`espèce ${f.espece}`);
  if (f.race) p.push(`race ${f.race}`);
  if (f.du) p.push(`depuis le ${f.du.split('-').reverse().join('/')}`);
  if (f.au) p.push(`jusqu'au ${f.au.split('-').reverse().join('/')}`);
  if (f.couveuse) p.push(`couveuse ${noms.couveuse(f.couveuse)}`);
  if (f.responsable) p.push(`responsable ${noms.responsable(f.responsable)}`);
  if (f.statut) p.push(`statut ${f.statut}`);
  return p.join(', ');
}
