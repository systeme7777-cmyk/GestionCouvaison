import Dexie, { type Table } from 'dexie';
import type {
  Couvaison, Couveuse, Espece, Historique, Mesure, Mirage, Operation, Photo, Profile, TableName,
} from './types';

export type OpOutbox = 'insert' | 'update' | 'delete' | 'upload';

export interface OutboxItem {
  seq?: number;
  table: TableName;
  op: OpOutbox;
  rowId: string;
  data: any;
  created: number;
}

export interface BlobRow { id: string; blob: Blob; }
export interface MetaRow { key: string; value: any; }
export interface ErreurSync { id?: number; date: number; message: string; table: string; op: string; }

class BaseLocale extends Dexie {
  profiles!: Table<Profile, string>;
  especes!: Table<Espece, string>;
  couveuses!: Table<Couveuse, string>;
  couvaisons!: Table<Couvaison, string>;
  operations!: Table<Operation, string>;
  mesures!: Table<Mesure, string>;
  mirages!: Table<Mirage, string>;
  photos!: Table<Photo, string>;
  historique!: Table<Historique, string>;
  outbox!: Table<OutboxItem, number>;
  blobs!: Table<BlobRow, string>;
  meta!: Table<MetaRow, string>;
  erreurs!: Table<ErreurSync, number>;

  constructor() {
    super('gestion-couvaison');
    this.version(1).stores({
      profiles: 'id',
      especes: 'id, ordre',
      couveuses: 'id',
      couvaisons: 'id, couveuse_id, date_debut, responsable_id',
      operations: 'id, couvaison_id, date_prevue',
      mesures: 'id, couvaison_id, date_mesure',
      mirages: 'id, couvaison_id',
      photos: 'id, couvaison_id',
      historique: 'id, couvaison_id, created_at',
      outbox: '++seq, rowId, table',
      blobs: 'id',
      meta: 'key',
      erreurs: '++id, date',
    });
  }
}

export const db = new BaseLocale();

export const TABLES_SYNC: TableName[] = [
  'profiles', 'especes', 'couveuses', 'couvaisons', 'operations', 'mesures', 'mirages', 'photos', 'historique',
];

export function table(name: TableName): Table<any, string> {
  return (db as any)[name];
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value;
}

export async function setMeta(key: string, value: any) {
  await db.meta.put({ key, value });
}

/** Efface toutes les données locales (déconnexion / changement de compte). */
export async function viderBaseLocale() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
}
