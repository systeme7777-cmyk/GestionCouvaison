import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from '../lib/db';
import { abonnerSync, etatSync, type EtatSync } from '../lib/sync';
import type { Couvaison, Couveuse, Espece, Historique, Mesure, Mirage, Operation, Photo, Profile } from '../lib/types';

const VIDE: never[] = [];

export const useCouvaisons = (): Couvaison[] => useLiveQuery(() => db.couvaisons.toArray(), []) ?? VIDE;
export const useCouvaison = (id?: string) => useLiveQuery(() => (id ? db.couvaisons.get(id) : undefined), [id]);
export const useCouveuses = (): Couveuse[] =>
  useLiveQuery(async () => (await db.couveuses.toArray()).sort((a, b) => a.nom.localeCompare(b.nom, 'fr', { numeric: true })), []) ?? VIDE;
export const useEspeces = (): Espece[] =>
  useLiveQuery(async () => (await db.especes.toArray()).sort((a, b) => a.ordre - b.ordre || a.nom.localeCompare(b.nom)), []) ?? VIDE;
export const useProfils = (): Profile[] =>
  useLiveQuery(async () => (await db.profiles.toArray()).sort((a, b) => a.created_at.localeCompare(b.created_at)), []) ?? VIDE;
export const useOperations = (couvaisonId?: string): Operation[] =>
  useLiveQuery(() => (couvaisonId ? db.operations.where('couvaison_id').equals(couvaisonId).toArray() : db.operations.toArray()), [couvaisonId]) ?? VIDE;
export const useMesures = (couvaisonId?: string): Mesure[] =>
  useLiveQuery(() => (couvaisonId ? db.mesures.where('couvaison_id').equals(couvaisonId).toArray() : db.mesures.toArray()), [couvaisonId]) ?? VIDE;
export const useMirages = (couvaisonId?: string): Mirage[] =>
  useLiveQuery(() => (couvaisonId ? db.mirages.where('couvaison_id').equals(couvaisonId).toArray() : db.mirages.toArray()), [couvaisonId]) ?? VIDE;
export const usePhotos = (couvaisonId: string): Photo[] =>
  useLiveQuery(async () => (await db.photos.where('couvaison_id').equals(couvaisonId).toArray()).sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? '')), [couvaisonId]) ?? VIDE;
export const useHistorique = (couvaisonId?: string, limite = 50): Historique[] =>
  useLiveQuery(async () => {
    const c = couvaisonId ? db.historique.where('couvaison_id').equals(couvaisonId) : db.historique.toCollection();
    return (await c.toArray()).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limite);
  }, [couvaisonId, limite]) ?? VIDE;
export const useEnAttente = (): Set<string> =>
  useLiveQuery(async () => new Set((await db.outbox.toArray()).map((i) => i.rowId)), []) ?? new Set();

export function useSync(): EtatSync {
  const [e, setE] = useState(etatSync());
  useEffect(() => abonnerSync(setE), []);
  return e;
}

/** Force un rendu périodique (pour les « il y a 12 s »). */
export function useHorloge(ms = 10000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
