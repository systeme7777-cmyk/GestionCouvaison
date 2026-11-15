// Base locale (IndexedDB via Dexie) : copie des données + file d'attente hors connexion.
import Dexie, { type Table } from 'dexie';
import type { JournalEntree, TableNom } from './types';
import { TABLES } from './types';

export interface EntreeAttente {
  seq?: number;
  table: TableNom;
  op: 'insert' | 'update';
  id: string;
  payload: Record<string, any>;
  base_updated_at?: string | null;
  statut: 'attente' | 'erreur';
  erreur?: string | null;
  code?: string | null;
  essais: number;
  cree_le: string;
  user_id?: string | null;
}

export interface FichierAttente {
  path: string;
  blob: Blob;
  type: string;
  cree_le: string;
}

export interface Meta { cle: string; valeur: any; }

class BaseLocale extends Dexie {
  attente!: Table<EntreeAttente, number>;
  fichiers!: Table<FichierAttente, string>;
  meta!: Table<Meta, string>;
  journal!: Table<JournalEntree, number>;
  [k: string]: any;

  constructor() {
    super('ansar_elevage');
    const schema: Record<string, string> = {
      attente: '++seq, table, id, statut',
      fichiers: 'path',
      meta: 'cle',
      journal: 'id, fait_le, user_id, table_nom, enregistrement_id',
    };
    for (const t of TABLES) {
      schema[t] = 'id, updated_at, date, produit_id, lot_id, espece_id, client_id, fournisseur_id, vente_id, achat_id, cle';
    }
    this.version(1).stores(schema);
  }
}

export const db = new BaseLocale();

export function table<T = any>(nom: TableNom): Table<T, string> {
  return (db as any)[nom] as Table<T, string>;
}

export async function getMeta<T = any>(cle: string, defaut: T): Promise<T> {
  try {
    const m = await db.meta.get(cle);
    return (m?.valeur ?? defaut) as T;
  } catch {
    return defaut;
  }
}

export async function setMeta(cle: string, valeur: any) {
  await db.meta.put({ cle, valeur });
}
