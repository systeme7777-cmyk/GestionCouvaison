// Moteur de synchronisation : file d'attente locale -> Supabase, puis Supabase -> base locale,
// plus mises à jour en temps réel. Chaque enregistrement a un identifiant unique généré
// sur le téléphone : un renvoi après coupure ne crée jamais de doublon.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { db, getMeta, setMeta, table, type EntreeAttente } from './db';
import { supabase } from './supabase';
import { COLONNES_SERVEUR, TABLES, type TableNom } from './types';

export interface EtatSync {
  enLigne: boolean;
  enCours: boolean;
  attente: number;
  erreurs: number;
  derniere: string | null;
  tempsReel: boolean;
  message: string | null;
}

let etat: EtatSync = {
  enLigne: typeof navigator === 'undefined' ? true : navigator.onLine,
  enCours: false, attente: 0, erreurs: 0, derniere: null, tempsReel: false, message: null,
};
const abonnes = new Set<() => void>();
export function lireEtat() { return etat; }
export function abonner(f: () => void) { abonnes.add(f); return () => { abonnes.delete(f); }; }
function maj(p: Partial<EtatSync>) {
  etat = { ...etat, ...p };
  abonnes.forEach((f) => f());
}

let utilisateurCourant: string | null = null;
export function definirUtilisateur(id: string | null) { utilisateurCourant = id; }
export function utilisateur() { return utilisateurCourant; }

export async function compterAttente() {
  const attente = await db.attente.where('statut').equals('attente').count();
  const erreurs = await db.attente.where('statut').equals('erreur').count();
  maj({ attente, erreurs });
}

// ---------------------------------------------------------------------------
// Erreurs
// ---------------------------------------------------------------------------
export function estErreurReseau(err: any): boolean {
  if (!err) return false;
  const m = String(err.message ?? err ?? '');
  if (err.code === 'PGRST301' || /jwt expired/i.test(m)) return true;
  return !err.code && /fetch|network|load failed|timeout|abort|ECONN|Failed to/i.test(m);
}

export function traduireErreur(err: any): string {
  const m = String(err?.message ?? err ?? 'Erreur inconnue');
  const code = String(err?.code ?? '');
  const ae = m.match(/AE_[A-Z_]+:\s*(.*)$/s);
  if (ae) return ae[1];
  if (code === '42501' || /row-level security/i.test(m)) return "Droits insuffisants pour cette opération.";
  if (code === '23503') return "Un élément lié (produit, client, lot…) est introuvable ou supprimé.";
  if (code === '23514') return 'Valeur refusée par les contrôles : vérifiez les quantités et montants.';
  if (code === '23505') return 'Cet enregistrement existe déjà.';
  if (code === '22P02') return 'Valeur invalide.';
  return m;
}

// ---------------------------------------------------------------------------
// Envoi (file d'attente -> serveur)
// ---------------------------------------------------------------------------
function nettoyer(t: TableNom, p: Record<string, any>) {
  const out: Record<string, any> = {};
  const exclus = new Set([...(COLONNES_SERVEUR[t] ?? []), 'updated_at', 'updated_by']);
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('_') || exclus.has(k)) continue;
    out[k] = v === undefined ? null : v;
  }
  return out;
}

async function appliquerServeur(t: TableNom, row: any) {
  const restantes = await db.attente.where('id').equals(row.id).filter((e) => e.statut === 'attente').toArray();
  if (restantes.length === 0) {
    await table(t).put({ ...row, _attente: false, _erreur: null });
    return;
  }
  // D'autres modifications locales attendent : on garde leur contenu par-dessus la version serveur
  for (const r of restantes) {
    if (r.op === 'update') await db.attente.update(r.seq!, { base_updated_at: row.updated_at });
  }
  const local = (await table(t).get(row.id)) as any;
  const fusion = { ...row };
  for (const r of restantes) Object.assign(fusion, r.payload);
  await table(t).put({ ...fusion, _attente: true, _erreur: local?._erreur ?? null });
}

async function marquerErreur(e: EntreeAttente, err: any) {
  const msg = traduireErreur(err);
  await db.attente.update(e.seq!, { statut: 'erreur', erreur: msg, code: String(err?.code ?? ''), essais: e.essais + 1 });
  const local = (await table(e.table).get(e.id)) as any;
  if (local) await table(e.table).put({ ...local, _erreur: msg });
}

/** Renvoie 'ok', 'erreur' ou 'reseau' */
async function envoyerEntree(e: EntreeAttente): Promise<'ok' | 'erreur' | 'reseau'> {
  const payload = nettoyer(e.table, e.payload);
  if (e.op === 'insert') {
    const { data, error } = await supabase.from(e.table).insert(payload).select().maybeSingle();
    if (error) {
      if (estErreurReseau(error)) return 'reseau';
      if (error.code === '23505') {
        // Déjà reçu lors d'un envoi précédent interrompu : pas de doublon
        const { data: ex } = await supabase.from(e.table).select('*').eq('id', e.id).maybeSingle();
        await db.attente.delete(e.seq!);
        if (ex) await appliquerServeur(e.table, ex);
        return 'ok';
      }
      await marquerErreur(e, error);
      return 'erreur';
    }
    await db.attente.delete(e.seq!);
    if (data) await appliquerServeur(e.table, data);
    else {
      const local = (await table(e.table).get(e.id)) as any;
      if (local) await table(e.table).put({ ...local, _attente: false, _erreur: null });
    }
    return 'ok';
  }

  const corps = { ...payload };
  delete corps.id;
  delete corps.created_at;
  delete corps.created_by;
  if (e.base_updated_at) corps.updated_at = e.base_updated_at;
  const { data, error } = await supabase.from(e.table).update(corps).eq('id', e.id).select().maybeSingle();
  if (error) {
    if (estErreurReseau(error)) return 'reseau';
    await marquerErreur(e, error);
    return 'erreur';
  }
  if (!data) {
    await marquerErreur(e, { message: "Modification refusée : droits insuffisants ou enregistrement introuvable.", code: '42501' });
    return 'erreur';
  }
  await db.attente.delete(e.seq!);
  await appliquerServeur(e.table, data);
  return 'ok';
}

async function envoyerFichiers(): Promise<boolean> {
  const fichiers = await db.fichiers.toArray();
  for (const f of fichiers) {
    const { error } = await supabase.storage.from('ae-justificatifs').upload(f.path, f.blob, {
      contentType: f.type, upsert: false,
    });
    if (error && !/exists|Duplicate/i.test(error.message)) {
      if (estErreurReseau(error)) return false;
      console.warn('Justificatif non envoyé', error.message);
    }
    await db.fichiers.delete(f.path);
  }
  return true;
}

let envoiEnCours = false;
export async function envoyer() {
  if (envoiEnCours || !utilisateurCourant) return;
  envoiEnCours = true;
  try {
    if (!(await envoyerFichiers())) { maj({ enLigne: false }); return; }
    const entrees = (await db.attente.where('statut').equals('attente').toArray())
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    for (const e of entrees) {
      const r = await envoyerEntree(e);
      if (r === 'reseau') {
        maj({ enLigne: false });
        break;
      }
    }
  } finally {
    envoiEnCours = false;
    await compterAttente();
  }
}

// ---------------------------------------------------------------------------
// Réception (serveur -> base locale)
// ---------------------------------------------------------------------------
async function tirerTable(t: TableNom) {
  const cle = 'curseur_' + t;
  const curseur = await getMeta<string | null>(cle, null);
  const depuis = curseur ? new Date(Date.parse(curseur) - 120000).toISOString() : '1970-01-01T00:00:00Z';
  let max = curseur;
  const taille = 1000;
  for (let page = 0; page < 1000; page++) {
    const { data, error } = await supabase.from(t).select('*').gt('updated_at', depuis)
      .order('updated_at', { ascending: true }).order('id', { ascending: true })
      .range(page * taille, page * taille + taille - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    const enAttente = new Set((await db.attente.where('table').equals(t).toArray()).map((e) => e.id));
    const lignes = data.filter((r: any) => !enAttente.has(r.id)).map((r: any) => ({ ...r, _attente: false, _erreur: null }));
    if (lignes.length) await table(t).bulkPut(lignes);
    const dernier = (data[data.length - 1] as any).updated_at as string;
    if (!max || dernier > max) max = dernier;
    if (data.length < taille) break;
  }
  if (max && max !== curseur) await setMeta(cle, max);
}

async function tirerJournal() {
  const dernier = (await db.journal.orderBy('id').last())?.id ?? 0;
  let depuis = dernier;
  for (let page = 0; page < 200; page++) {
    const { data, error } = await supabase.from('ae_journal').select('*').gt('id', depuis)
      .order('id', { ascending: true }).limit(1000);
    if (error) return; // pas de droit « historique » : on ignore
    if (!data || data.length === 0) break;
    await db.journal.bulkPut(data as any);
    depuis = (data[data.length - 1] as any).id;
    if (data.length < 1000) break;
  }
}

let receptionEnCours: Promise<void> | null = null;
export async function recevoir() {
  if (!utilisateurCourant) return;
  if (receptionEnCours) return receptionEnCours;
  receptionEnCours = (async () => {
    try {
      // Le profil en premier : les droits conditionnent tout le reste
      await tirerTable('ae_profils');
      for (const t of TABLES) if (t !== 'ae_profils') await tirerTable(t);
      await tirerJournal();
      maj({ enLigne: true, derniere: new Date().toISOString(), message: null });
      await setMeta('derniere_sync', new Date().toISOString());
    } catch (err) {
      if (estErreurReseau(err)) maj({ enLigne: false });
      else maj({ message: traduireErreur(err) });
    } finally {
      receptionEnCours = null;
    }
  })();
  return receptionEnCours;
}

export async function synchroniser() {
  if (!utilisateurCourant) return;
  maj({ enCours: true });
  try {
    await envoyer();
    await recevoir();
    await envoyer();
  } finally {
    maj({ enCours: false });
    await compterAttente();
  }
}

// ---------------------------------------------------------------------------
// Résolution des erreurs et conflits
// ---------------------------------------------------------------------------
export async function reessayer(seq: number, imposer = false) {
  const e = await db.attente.get(seq);
  if (!e) return;
  let base = e.base_updated_at;
  if (imposer && e.op === 'update') {
    const { data } = await supabase.from(e.table).select('updated_at').eq('id', e.id).maybeSingle();
    if (data) base = (data as any).updated_at;
  }
  await db.attente.update(seq, { statut: 'attente', erreur: null, base_updated_at: base });
  await synchroniser();
}

export async function annulerEntree(seq: number) {
  const e = await db.attente.get(seq);
  if (!e) return;
  await db.attente.delete(seq);
  const autres = await db.attente.where('id').equals(e.id).count();
  if (autres === 0) {
    const { data } = await supabase.from(e.table).select('*').eq('id', e.id).maybeSingle();
    if (data) await table(e.table).put({ ...data, _attente: false, _erreur: null });
    else if (e.op === 'insert') await table(e.table).delete(e.id);
    else await setMeta('curseur_' + e.table, null);
  }
  await compterAttente();
}

// ---------------------------------------------------------------------------
// Temps réel + déclencheurs automatiques
// ---------------------------------------------------------------------------
let canal: RealtimeChannel | null = null;
let minuteur: any = null;

async function appliquerTempsReel(t: TableNom, row: any) {
  if (!row?.id) return;
  const enAttente = await db.attente.where('id').equals(row.id).count();
  if (enAttente > 0) return;
  const local = (await table(t).get(row.id)) as any;
  if (local && local.updated_at && row.updated_at && local.updated_at > row.updated_at) return;
  await table(t).put({ ...row, _attente: false, _erreur: null });
}

export function demarrerSynchronisation() {
  arreterSynchronisation();
  canal = supabase.channel('ansar-elevage');
  for (const t of TABLES) {
    canal.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, (p: any) => {
      if (p.new && Object.keys(p.new).length) appliquerTempsReel(t, p.new);
    });
  }
  canal.subscribe((statut) => maj({ tempsReel: statut === 'SUBSCRIBED' }));
  const surEnLigne = () => { maj({ enLigne: true }); synchroniser(); };
  const surHorsLigne = () => maj({ enLigne: false });
  window.addEventListener('online', surEnLigne);
  window.addEventListener('offline', surHorsLigne);
  document.addEventListener('visibilitychange', surVisible);
  minuteur = setInterval(() => synchroniser(), 45000);
  (demarrerSynchronisation as any)._nettoyer = () => {
    window.removeEventListener('online', surEnLigne);
    window.removeEventListener('offline', surHorsLigne);
    document.removeEventListener('visibilitychange', surVisible);
  };
  synchroniser();
}

function surVisible() {
  if (document.visibilityState === 'visible') synchroniser();
}

export function arreterSynchronisation() {
  if (canal) { supabase.removeChannel(canal); canal = null; }
  if (minuteur) { clearInterval(minuteur); minuteur = null; }
  (demarrerSynchronisation as any)._nettoyer?.();
}

/** Efface toutes les données locales (déconnexion / changement d'utilisateur) */
export async function viderLocal() {
  await Promise.all([...TABLES.map((t) => table(t).clear()), db.attente.clear(), db.fichiers.clear(), db.journal.clear()]);
  const metas = await db.meta.toArray();
  for (const m of metas) if (m.cle.startsWith('curseur_') || m.cle === 'derniere_sync') await db.meta.delete(m.cle);
  await compterAttente();
}
