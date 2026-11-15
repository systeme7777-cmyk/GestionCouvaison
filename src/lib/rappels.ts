/**
 * Rappels automatiques : notifications locales Android programmées à partir des opérations
 * (retournement, mirage, arrêt du retournement, éclosion…) et d'un rappel quotidien de suivi.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { estNatif } from './natif';
import { db } from './db';
import { estActive, suivi } from './calc';
import { parseISODate, today } from './dates';

const CLE_HEURE = 'gc-heure-rappel';
const CLE_ACTIF = 'gc-rappel-quotidien';
const ID_QUOTIDIEN = 1;

export function heureRappelQuotidien(): string {
  try { return localStorage.getItem(CLE_HEURE) || '08:00'; } catch { return '08:00'; }
}
export function rappelQuotidienActif(): boolean {
  try { return localStorage.getItem(CLE_ACTIF) !== 'non'; } catch { return true; }
}
export function reglerRappelQuotidien(actif: boolean, heure: string) {
  try {
    localStorage.setItem(CLE_ACTIF, actif ? 'oui' : 'non');
    localStorage.setItem(CLE_HEURE, heure);
  } catch { /* stockage indisponible */ }
  planifierRappels();
}

function idNumerique(uuid: string): number {
  let h = 7;
  for (let i = 0; i < uuid.length; i++) h = (Math.imul(h, 31) + uuid.charCodeAt(i)) | 0;
  return (Math.abs(h) % 2000000000) + 10;
}

export async function autorisationRappels(): Promise<boolean> {
  if (!estNatif()) return false;
  let p = await LocalNotifications.checkPermissions();
  if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await LocalNotifications.requestPermissions();
  return p.display === 'granted';
}

let enCours = false;
let relance = false;

export async function planifierRappels() {
  if (!estNatif()) return;
  if (enCours) { relance = true; return; }
  enCours = true;
  try {
    if (!(await autorisationRappels())) return;
    const enAttente = await LocalNotifications.getPending();
    if (enAttente.notifications.length) await LocalNotifications.cancel({ notifications: enAttente.notifications.map((n) => ({ id: n.id })) });

    const couvaisons = (await db.couvaisons.toArray()).filter((c) => estActive(c) && c.rappels_actifs);
    const parId = new Map(couvaisons.map((c) => [c.id, c]));
    const ops = (await db.operations.toArray())
      .filter((o) => o.rappel && !o.fait && parId.has(o.couvaison_id) && o.date_prevue >= today())
      .sort((a, b) => (a.date_prevue + (a.heure ?? '')).localeCompare(b.date_prevue + (b.heure ?? '')))
      .slice(0, 60);

    const maintenant = Date.now();
    const notifs = ops.map((o) => {
      const c = parId.get(o.couvaison_id)!;
      const d = parseISODate(o.date_prevue);
      const [h, m] = (o.heure ?? '08:00').split(':').map(Number);
      d.setHours(h || 0, m || 0, 0, 0);
      return {
        id: idNumerique(o.id),
        title: o.titre ?? 'Opération de couvaison',
        body: `${c.nom_lot || c.numero || c.espece} · J${suivi(c, o.date_prevue).jour}/${c.duree_jours}`,
        schedule: { at: d, allowWhileIdle: true },
        extra: { couvaison_id: c.id },
      };
    }).filter((n) => n.schedule.at.getTime() > maintenant);

    if (rappelQuotidienActif() && couvaisons.some((c) => suivi(c).statut !== 'preparation')) {
      const [h, m] = heureRappelQuotidien().split(':').map(Number);
      notifs.push({
        id: ID_QUOTIDIEN,
        title: 'Suivi du jour',
        body: `${couvaisons.length} couvaison(s) en cours : température, humidité et retournements.`,
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true } as any,
        extra: {} as any,
      });
    }
    if (notifs.length) await LocalNotifications.schedule({ notifications: notifs as any });
  } catch (e) {
    console.warn('Rappels non programmés', e);
  } finally {
    enCours = false;
    if (relance) { relance = false; planifierRappels(); }
  }
}
