let devise = 'FCFA';
export function definirDevise(d: string) { devise = d || ''; }
export function laDevise() { return devise; }

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const nf3 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 });

export function argent(n: number | null | undefined, avecDevise = true): string {
  const v = Number(n || 0);
  const s = Math.abs(v) >= 1000 || Number.isInteger(v) ? nf0.format(Math.round(v)) : nf2.format(v);
  return avecDevise && devise ? `${s} ${devise}` : s;
}

export function nombre(n: number | null | undefined): string {
  return nf3.format(Number(n || 0));
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dateFr(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function dateHeureFr(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function joursDepuis(iso: string): number {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export function ageTexte(jours: number): string {
  if (jours < 0) return '—';
  if (jours < 14) return `${jours} j`;
  if (jours < 90) return `${Math.floor(jours / 7)} sem.`;
  const mois = Math.floor(jours / 30.44);
  if (mois < 24) return `${mois} mois`;
  return `${(jours / 365.25).toFixed(1).replace('.', ',')} ans`;
}

export const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function semaineIso(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  const jour = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const premierJeudi = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((d.getTime() - premierJeudi.getTime()) / 86400000 - 3 + ((premierJeudi.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-S${String(n).padStart(2, '0')}`;
}

export function normaliser(s: string | null | undefined) {
  return (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
