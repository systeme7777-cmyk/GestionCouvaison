// Écritures : toujours d'abord en local (fonctionne hors connexion), puis mise en file d'attente.
import { db, table } from './db';
import { compterAttente, envoyer, utilisateur } from './sync';
import type { TableNom } from './types';

export function nouvelId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function calcules(t: TableNom, row: any) {
  if (t === 'ae_achats' || t === 'ae_ventes') {
    row.montant_total = Math.round(Number(row.quantite || 0) * Number(row.prix_unitaire || 0) * 100) / 100;
  }
  return row;
}

let planifie: any = null;
function envoyerBientot() {
  if (planifie) clearTimeout(planifie);
  planifie = setTimeout(() => { planifie = null; envoyer(); }, 300);
}

/** Crée ou modifie un enregistrement. Retourne son identifiant. */
export async function enregistrer<T extends Record<string, any>>(t: TableNom, donnees: T & { id?: string }): Promise<string> {
  const maintenant = new Date().toISOString();
  const propre: Record<string, any> = {};
  for (const [k, v] of Object.entries(donnees)) if (!k.startsWith('_') && v !== undefined) propre[k] = v;

  const existant = donnees.id ? ((await table(t).get(donnees.id)) as any) : null;

  if (!existant) {
    const id = donnees.id || nouvelId();
    const row = calcules(t, { ...propre, id, created_at: maintenant, updated_at: maintenant, created_by: utilisateur(), deleted_at: propre.deleted_at ?? null });
    await db.transaction('rw', table(t), db.attente, async () => {
      await table(t).put({ ...row, _attente: true, _erreur: null });
      await db.attente.add({
        table: t, op: 'insert', id, payload: row, statut: 'attente', essais: 0,
        cree_le: maintenant, user_id: utilisateur(),
      });
    });
    await compterAttente();
    envoyerBientot();
    return id;
  }

  const id = existant.id as string;
  const fusion = calcules(t, { ...existant, ...propre, updated_by: utilisateur() });
  await db.transaction('rw', table(t), db.attente, async () => {
    await table(t).put({ ...fusion, _attente: true });
    const enAttente = await db.attente.where('id').equals(id).filter((e) => e.statut === 'attente').toArray();
    const derniere = enAttente.sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0))[0];
    if (derniere) {
      await db.attente.update(derniere.seq!, { payload: calcules(t, { ...derniere.payload, ...propre }) });
    } else {
      await db.attente.add({
        table: t, op: 'update', id, payload: propre, base_updated_at: existant.updated_at,
        statut: 'attente', essais: 0, cree_le: maintenant, user_id: utilisateur(),
      });
    }
  });
  await compterAttente();
  envoyerBientot();
  return id;
}

/** Suppression logique (synchronisée sur tous les téléphones) */
export async function supprimer(t: TableNom, id: string) {
  await enregistrer(t, { id, deleted_at: new Date().toISOString() });
}

/** Justificatif photo : conservé localement puis envoyé au retour d'Internet */
export async function ajouterJustificatif(dossier: string, id: string, fichier: File): Promise<string> {
  const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${dossier}/${id}/${Date.now()}.${ext}`;
  const blob = await compresserImage(fichier);
  await db.fichiers.put({ path, blob, type: blob.type || fichier.type, cree_le: new Date().toISOString() });
  return path;
}

async function compresserImage(f: File): Promise<Blob> {
  if (!f.type.startsWith('image/') || typeof document === 'undefined') return f;
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = url;
    });
    const max = 1600;
    const r = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b || f), 'image/jpeg', 0.8));
  } catch {
    return f;
  }
}
