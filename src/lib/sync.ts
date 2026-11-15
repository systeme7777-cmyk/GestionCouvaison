/**
 * Moteur de synchronisation hors ligne ↔ Supabase.
 *
 * - L'interface lit UNIQUEMENT la base locale (IndexedDB via Dexie) : l'app fonctionne sans réseau.
 * - Chaque modification est appliquée localement puis placée dans une file d'attente (« outbox »).
 * - Dès que le réseau est disponible, la file est envoyée à Supabase dans l'ordre.
 * - Supabase Realtime pousse les changements des autres téléphones vers la base locale.
 * - À chaque reconnexion, une resynchronisation complète rattrape les changements manqués.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { db, getMeta, setMeta, table, TABLES_SYNC, type OutboxItem } from './db';
import { BUCKET_PHOTOS, supabase } from './supabase';
import type { TableName } from './types';
import { uuid } from './uuid';

export interface EtatSync {
  enLigne: boolean;
  synchronisation: boolean;
  enAttente: number;
  derniereSync: number | null;
  temps_reel: boolean;
  presents: string[]; // ids des utilisateurs connectés en ce moment
  erreur: string | null;
}

let etat: EtatSync = {
  enLigne: typeof navigator !== 'undefined' ? navigator.onLine : true,
  synchronisation: false,
  enAttente: 0,
  derniereSync: null,
  temps_reel: false,
  presents: [],
  erreur: null,
};

const abonnes = new Set<(e: EtatSync) => void>();

export function etatSync(): EtatSync { return etat; }

export function abonnerSync(fn: (e: EtatSync) => void): () => void {
  abonnes.add(fn);
  return () => { abonnes.delete(fn); };
}

function maj(p: Partial<EtatSync>) {
  etat = { ...etat, ...p };
  abonnes.forEach((f) => f(etat));
}

let utilisateurId: string | null = null;
let canalDonnees: RealtimeChannel | null = null;
let canalPresence: RealtimeChannel | null = null;
let minuterie: ReturnType<typeof setInterval> | null = null;
let ecouteurs: (() => void)[] = [];
let envoiEnCours: Promise<void> | null = null;
let appareil = '';

export function utilisateurCourant() { return utilisateurId; }

async function compterAttente() {
  maj({ enAttente: await db.outbox.count() });
}

/* ------------------------------------------------------------------ */
/* Écritures locales + mise en file                                    */
/* ------------------------------------------------------------------ */

const ENFANTS_COUVAISON: TableName[] = ['operations', 'mesures', 'mirages', 'photos'];

async function mettreEnFile(item: Omit<OutboxItem, 'seq' | 'created'>) {
  await db.outbox.add({ ...item, created: Date.now() });
}

/** Ajoute un enregistrement (id généré côté téléphone pour fonctionner hors ligne). */
export async function ajouter<T extends Record<string, any>>(nom: TableName, ligne: T): Promise<T & { id: string }> {
  const id = (ligne.id as string) ?? uuid();
  const maintenant = new Date().toISOString();
  const data = { ...ligne, id };
  const locale = { created_at: maintenant, updated_at: maintenant, created_by: utilisateurId, updated_by: utilisateurId, ...data };
  await db.transaction('rw', table(nom), db.outbox, async () => {
    await table(nom).put(locale);
    await mettreEnFile({ table: nom, op: 'insert', rowId: id, data });
  });
  declencher();
  return locale as T & { id: string };
}

/** Ajoute ou remplace (utilisé pour le suivi du jour, dont l'id est déterministe). */
export async function enregistrer<T extends Record<string, any>>(nom: TableName, ligne: T & { id: string }) {
  const existe = await table(nom).get(ligne.id);
  if (existe) {
    const { id, ...patch } = ligne;
    await modifier(nom, id, patch);
  } else {
    await ajouter(nom, ligne);
  }
}

/** Modifie un enregistrement : seuls les champs modifiés sont envoyés au serveur. */
export async function modifier(nom: TableName, id: string, patch: Record<string, any>) {
  await db.transaction('rw', table(nom), db.outbox, async () => {
    await table(nom).update(id, { ...patch, updated_at: new Date().toISOString(), updated_by: utilisateurId });
    await mettreEnFile({ table: nom, op: 'update', rowId: id, data: patch });
  });
  declencher();
}

/** Supprime un enregistrement (et ses éléments liés pour une couvaison). */
export async function supprimer(nom: TableName, id: string) {
  const tables = [table(nom), db.outbox, db.photos, db.blobs, ...ENFANTS_COUVAISON.map(table)];
  await db.transaction('rw', tables, async () => {
    const data: Record<string, any> = {};
    if (nom === 'couvaisons') {
      const photos = await db.photos.where('couvaison_id').equals(id).toArray();
      data.chemins = photos.filter((p) => !p.chemin.startsWith('local:')).map((p) => p.chemin);
      for (const p of photos) await db.blobs.delete(p.id);
      for (const t of ENFANTS_COUVAISON) {
        const ids = await table(t).where('couvaison_id').equals(id).primaryKeys();
        if (ids.length) await db.outbox.where('rowId').anyOf(ids as string[]).delete();
        await table(t).where('couvaison_id').equals(id).delete();
      }
    }
    if (nom === 'photos') {
      const p = await db.photos.get(id);
      if (p) data.chemins = [p.chemin];
      await db.blobs.delete(id);
    }
    await table(nom).delete(id);
    // Un ajout pas encore envoyé n'a pas besoin d'être supprimé sur le serveur
    const enFile = await db.outbox.where('rowId').equals(id).toArray();
    const insertionNonEnvoyee = enFile.some((i) => i.op === 'insert' || i.op === 'upload');
    await db.outbox.where('rowId').equals(id).delete();
    if (!insertionNonEnvoyee) await mettreEnFile({ table: nom, op: 'delete', rowId: id, data });
  });
  declencher();
}

/** Ajoute une photo : stockée localement tout de suite, envoyée au serveur dès que possible. */
export async function ajouterPhoto(couvaisonId: string, blob: Blob, legende: string | null) {
  const id = uuid();
  const chemin = `${couvaisonId}/${id}.jpg`;
  const maintenant = new Date().toISOString();
  await db.transaction('rw', db.photos, db.blobs, db.outbox, async () => {
    await db.blobs.put({ id, blob });
    await db.photos.put({
      id, couvaison_id: couvaisonId, chemin, legende,
      created_at: maintenant, updated_at: maintenant, created_by: utilisateurId, updated_by: utilisateurId,
    });
    await mettreEnFile({ table: 'photos', op: 'upload', rowId: id, data: { id, couvaison_id: couvaisonId, chemin, legende } });
  });
  declencher();
}

/** Renvoie une URL affichable pour une photo (cache local, sinon téléchargement puis mise en cache). */
export async function urlPhoto(id: string, chemin: string): Promise<string | null> {
  const local = await db.blobs.get(id);
  if (local) return URL.createObjectURL(local.blob);
  if (!etat.enLigne) return null;
  const { data, error } = await supabase.storage.from(BUCKET_PHOTOS).download(chemin);
  if (error || !data) return null;
  await db.blobs.put({ id, blob: data });
  return URL.createObjectURL(data);
}

/* ------------------------------------------------------------------ */
/* Envoi de la file vers Supabase                                      */
/* ------------------------------------------------------------------ */

class ErreurReseau extends Error {}

function estErreurReseau(err: any): boolean {
  if (!err) return false;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const msg = String(err.message ?? err).toLowerCase();
  const code = String(err.code ?? err.statusCode ?? err.status ?? '');
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed') || msg.includes('timeout')) return true;
  if (code.startsWith('5') || code === '' && msg.includes('fetch')) return true;
  if (code === 'PGRST301' || code === 'PGRST303' || msg.includes('jwt')) return true; // session expirée : on réessaiera
  return false;
}

function verifier(error: any) {
  if (!error) return;
  if (estErreurReseau(error)) throw new ErreurReseau(error.message);
  throw error;
}

async function appliquerRetour(nom: TableName, ligne: any) {
  if (!ligne) return;
  // Ne pas écraser une modification locale plus récente encore en file
  const enFile = await db.outbox.where('rowId').equals(ligne.id).count();
  if (enFile <= 1) await table(nom).put(ligne);
}

async function envoyer(item: OutboxItem) {
  const t = item.table;
  switch (item.op) {
    case 'insert': {
      const { data, error } = await supabase.from(t).upsert(item.data, { onConflict: 'id' }).select().maybeSingle();
      verifier(error);
      await appliquerRetour(t, data);
      break;
    }
    case 'update': {
      const { data, error } = await supabase.from(t).update(item.data).eq('id', item.rowId).select();
      verifier(error);
      await appliquerRetour(t, data?.[0]);
      break;
    }
    case 'delete': {
      const { error } = await supabase.from(t).delete().eq('id', item.rowId);
      verifier(error);
      const chemins: string[] = item.data?.chemins ?? [];
      if (chemins.length) await supabase.storage.from(BUCKET_PHOTOS).remove(chemins);
      break;
    }
    case 'upload': {
      const b = await db.blobs.get(item.rowId);
      if (!b) break; // photo supprimée entre-temps
      const up = await supabase.storage.from(BUCKET_PHOTOS).upload(item.data.chemin, b.blob, {
        contentType: b.blob.type || 'image/jpeg', upsert: true,
      });
      verifier(up.error);
      const { data, error } = await supabase.from('photos').upsert(item.data, { onConflict: 'id' }).select().maybeSingle();
      verifier(error);
      await appliquerRetour('photos', data);
      break;
    }
  }
}

function messageErreur(err: any): string {
  const m = String(err?.message ?? err);
  if (m.includes('row-level security') || err?.code === '42501') return "Action refusée : vous n'avez pas la permission nécessaire.";
  if (err?.code === '23505') return 'Doublon : cet enregistrement existe déjà.';
  if (err?.code === '23503') return "Élément lié introuvable (peut-être supprimé par un autre utilisateur).";
  if (err?.code === '23514') return 'Valeur refusée par le serveur (contrôle de cohérence).';
  return m;
}

async function viderFile() {
  if (!utilisateurId) return;
  for (;;) {
    const item = await db.outbox.orderBy('seq').first();
    if (!item) break;
    try {
      await envoyer(item);
      await db.outbox.delete(item.seq!);
    } catch (err: any) {
      if (err instanceof ErreurReseau) {
        maj({ erreur: 'Connexion au serveur impossible, nouvel essai automatique.' });
        if (String(err.message).toLowerCase().includes('jwt')) await supabase.auth.refreshSession();
        throw err;
      }
      // Refus définitif du serveur : on retire l'élément et on le signale
      await db.outbox.delete(item.seq!);
      await db.erreurs.add({ date: Date.now(), message: messageErreur(err), table: item.table, op: item.op });
      maj({ erreur: messageErreur(err) });
    }
    await compterAttente();
  }
}

/* ------------------------------------------------------------------ */
/* Récupération complète depuis Supabase                               */
/* ------------------------------------------------------------------ */

async function toutLire(nom: TableName): Promise<any[]> {
  const lignes: any[] = [];
  const taille = 1000;
  if (nom === 'historique') {
    const { data, error } = await supabase.from(nom).select('*').order('created_at', { ascending: false }).limit(1000);
    verifier(error);
    return data ?? [];
  }
  for (let debut = 0; ; debut += taille) {
    const { data, error } = await supabase.from(nom).select('*').order('id').range(debut, debut + taille - 1);
    verifier(error);
    lignes.push(...(data ?? []));
    if (!data || data.length < taille) break;
  }
  return lignes;
}

async function toutRecuperer() {
  const resultats: Partial<Record<TableName, any[]>> = {};
  for (const nom of TABLES_SYNC) resultats[nom] = await toutLire(nom);
  await db.transaction('rw', [...TABLES_SYNC.map(table), db.outbox], async () => {
    const enAttente = new Set((await db.outbox.toArray()).map((i) => i.rowId));
    for (const nom of TABLES_SYNC) {
      const t = table(nom);
      const conserves = enAttente.size ? (await t.toArray()).filter((r: any) => enAttente.has(r.id)) : [];
      await t.clear();
      await t.bulkPut(resultats[nom]!.filter((r: any) => !enAttente.has(r.id)));
      if (conserves.length) await t.bulkPut(conserves);
    }
  });
  // Nettoyage du cache des photos supprimées
  const ids = new Set((await db.photos.toArray()).map((p) => p.id));
  const orphelins = (await db.blobs.toCollection().primaryKeys()).filter((k) => !ids.has(k));
  if (orphelins.length) await db.blobs.bulkDelete(orphelins);
  const now = Date.now();
  await setMeta('derniereSync', now);
  maj({ derniereSync: now });
}

/** Synchronisation complète : envoi de la file puis récupération des données du serveur. */
export async function synchroniser(): Promise<void> {
  if (!utilisateurId) return;
  if (envoiEnCours) return envoiEnCours;
  envoiEnCours = (async () => {
    maj({ synchronisation: true });
    try {
      await viderFile();
      await toutRecuperer();
      maj({ erreur: null, enLigne: true });
    } catch (err: any) {
      if (!(err instanceof ErreurReseau)) maj({ erreur: messageErreur(err) });
    } finally {
      maj({ synchronisation: false });
      await compterAttente();
      envoiEnCours = null;
      if (demandeEnvoi) programmerEnvoi();
    }
  })();
  return envoiEnCours;
}

let delai: ReturnType<typeof setTimeout> | null = null;
let demandeEnvoi = false;

function programmerEnvoi(ms = 300) {
  if (delai) clearTimeout(delai);
  delai = setTimeout(executerEnvoi, ms);
}

/** Envoi rapide de la file après une modification locale. */
function declencher() {
  compterAttente();
  demandeEnvoi = true;
  programmerEnvoi();
}

async function executerEnvoi() {
  if (!utilisateurId || !etat.enLigne || !demandeEnvoi) return;
  // Un envoi est déjà en cours : on relancera à sa fin (voir « finally »)
  if (envoiEnCours) return;
  demandeEnvoi = false;
  envoiEnCours = (async () => {
    maj({ synchronisation: true });
    try { await viderFile(); maj({ derniereSync: Date.now(), erreur: null }); }
    catch { /* réseau indisponible : réessai automatique */ }
    finally {
      maj({ synchronisation: false });
      await compterAttente();
      envoiEnCours = null;
      if (demandeEnvoi) programmerEnvoi();
    }
  })();
}

/* ------------------------------------------------------------------ */
/* Temps réel                                                          */
/* ------------------------------------------------------------------ */

async function appliquerChangement(nom: TableName, payload: any) {
  const id = payload.new?.id ?? payload.old?.id;
  if (!id) return;
  const enFile = await db.outbox.where('rowId').equals(id).count();
  if (enFile > 0) return; // une modification locale plus récente sera envoyée
  if (payload.eventType === 'DELETE') {
    await table(nom).delete(id);
    if (nom === 'couvaisons') {
      for (const t of ENFANTS_COUVAISON) await table(t).where('couvaison_id').equals(id).delete();
    }
    if (nom === 'photos') await db.blobs.delete(id);
  } else {
    await table(nom).put(payload.new);
  }
  maj({ derniereSync: Date.now() });
}

function abonnerTempsReel() {
  canalDonnees?.unsubscribe();
  let c = supabase.channel('donnees-couvaison');
  for (const nom of TABLES_SYNC) {
    c = c.on('postgres_changes' as any, { event: '*', schema: 'public', table: nom }, (p: any) => {
      appliquerChangement(nom, p);
    });
  }
  canalDonnees = c.subscribe((statut) => {
    const ok = statut === 'SUBSCRIBED';
    maj({ temps_reel: ok });
    if (ok) synchroniser(); // rattrape ce qui a pu être manqué pendant la déconnexion
  });

  canalPresence?.unsubscribe();
  canalPresence = supabase.channel('presence-equipe', { config: { presence: { key: utilisateurId! } } });
  canalPresence
    .on('presence', { event: 'sync' }, () => {
      const st = canalPresence!.presenceState();
      maj({ presents: Object.keys(st) });
    })
    .subscribe(async (statut) => {
      if (statut === 'SUBSCRIBED') await canalPresence!.track({ appareil, depuis: new Date().toISOString() });
    });
}

/* ------------------------------------------------------------------ */
/* Démarrage / arrêt                                                   */
/* ------------------------------------------------------------------ */

async function signalerConnexion() {
  if (!utilisateurId || !etat.enLigne) return;
  await supabase.from('profiles').update({ derniere_connexion: new Date().toISOString(), appareil: appareil || null })
    .eq('id', utilisateurId);
}

async function changementReseau(enLigne: boolean) {
  const avant = etat.enLigne;
  maj({ enLigne });
  if (enLigne && !avant) {
    supabase.realtime.connect();
    await synchroniser();
    signalerConnexion();
  }
}

export async function demarrerSync(userId: string, nomAppareil: string) {
  if (utilisateurId === userId) return;
  arreterSync();
  utilisateurId = userId;
  appareil = nomAppareil;
  maj({ derniereSync: (await getMeta<number>('derniereSync')) ?? null });
  await compterAttente();

  if (Capacitor.isNativePlatform()) {
    const s = await Network.getStatus();
    maj({ enLigne: s.connected });
    const h1 = await Network.addListener('networkStatusChange', (st) => changementReseau(st.connected));
    const h2 = await App.addListener('resume', () => { synchroniser(); signalerConnexion(); });
    ecouteurs.push(() => h1.remove(), () => h2.remove());
  }
  const enLigne = () => changementReseau(true);
  const horsLigne = () => changementReseau(false);
  window.addEventListener('online', enLigne);
  window.addEventListener('offline', horsLigne);
  const visible = () => { if (document.visibilityState === 'visible') synchroniser(); };
  document.addEventListener('visibilitychange', visible);
  ecouteurs.push(
    () => window.removeEventListener('online', enLigne),
    () => window.removeEventListener('offline', horsLigne),
    () => document.removeEventListener('visibilitychange', visible),
  );

  abonnerTempsReel();
  synchroniser();
  signalerConnexion();
  // Filet de sécurité : envoi régulier de la file, resynchronisation complète toutes les 5 min
  let tour = 0;
  minuterie = setInterval(() => {
    tour++;
    if (!etat.enLigne) return;
    if (tour % 10 === 0) { synchroniser(); signalerConnexion(); } else if (etat.enAttente) declencher();
  }, 30000);
}

export function arreterSync() {
  utilisateurId = null;
  canalDonnees?.unsubscribe(); canalDonnees = null;
  canalPresence?.unsubscribe(); canalPresence = null;
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
  ecouteurs.forEach((f) => f());
  ecouteurs = [];
  maj({ temps_reel: false, presents: [] });
}
