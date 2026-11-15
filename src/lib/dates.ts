// Gestion des dates « calendrier » (AAAA-MM-JJ) en heure locale, sans décalage de fuseau.

export function parseISODate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function today(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Nombre de jours calendaires entre a et b (b - a). */
export function diffDays(a: string, b: string): number {
  const da = parseISODate(a);
  const db = parseISODate(b);
  return Math.round((Date.UTC(db.getFullYear(), db.getMonth(), db.getDate()) -
    Date.UTC(da.getFullYear(), da.getMonth(), da.getDate())) / 86400000);
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

export const NOMS_MOIS = MOIS;

export function fmtCourt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
}

export function fmtCourtAnnee(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = parseISODate(iso);
  return `${d.getDate()} ${MOIS_COURTS[d.getMonth()]} ${d.getFullYear()}`;
}

export function fmtLong(iso: string): string {
  const d = parseISODate(iso);
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}

export function fmtNumerique(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

export function fmtHeure(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** « il y a 12 s », « il y a 2 h », « hier », « 8 nov. » */
export function fmtRelatif(ts: string | null | undefined, now = Date.now()): string {
  if (!ts) return 'jamais';
  const t = new Date(ts).getTime();
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `il y a ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  const dToday = toISODate(new Date(now));
  const dTs = toISODate(new Date(t));
  if (dTs === dToday) return `il y a ${h} h`;
  if (diffDays(dTs, dToday) === 1) return 'hier';
  return fmtCourt(dTs);
}

/** Moment de l'activité : « 08:12 » aujourd'hui, sinon « 8 nov. » */
export function fmtMoment(ts: string): string {
  const d = new Date(ts);
  return toISODate(d) === today() ? fmtHeure(ts) : fmtCourt(toISODate(d));
}
