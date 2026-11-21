// Synchronisation des décomptes : enregistrement immédiat sur l'appareil, envoi regroupé,
// renvoi automatique après une coupure, jamais compté deux fois (identifiant unique par envoi).
import { useSyncExternalStore } from "react";
import { supabase, zikr } from "./api";
import { isNetworkError, toUserMessage } from "./errors";
import * as Q from "./queue";

export type SyncStatus = "synced" | "pending" | "syncing" | "offline";

const STORAGE_KEY = "zikr-file-attente";
const DEBOUNCE_MS = 700;

function load(): Q.QueueState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...Q.EMPTY_QUEUE, ...JSON.parse(raw) } : Q.EMPTY_QUEUE;
  } catch {
    return Q.EMPTY_QUEUE;
  }
}

let state: Q.QueueState = load();
let status: SyncStatus = state.ops.length ? "pending" : "synced";
let inflight: Q.PendingOp | null = null;
let currentUser: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 1000;
let flushing = false;
const listeners = new Set<() => void>();
const errorListeners = new Set<(msg: string) => void>();
const invalidateListeners = new Set<(campaignId: string) => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(next: Q.QueueState) {
  state = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* stockage plein : l'état reste en mémoire */ }
  if (state.ops.length && status === "synced") status = "pending";
  emit();
}

const millis = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0);

export const sync = {
  setUser(uid: string | null) {
    currentUser = uid;
    if (uid) sync.scheduleFlush(0);
  },
  getState: () => state,
  getStatus: () => status,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  onError(l: (msg: string) => void) {
    errorListeners.add(l);
    return () => errorListeners.delete(l);
  },
  onInvalidate(l: (campaignId: string) => void) {
    invalidateListeners.add(l);
    return () => invalidateListeners.delete(l);
  },
  isInflight: (campaignId: string) => inflight?.campaignId === campaignId,
  pendingCount: () => state.ops.filter((o) => o.userId === currentUser).length,

  add(campaignId: string, amount: number) {
    if (!currentUser) return;
    setState(Q.add(state, currentUser, campaignId, amount, inflight?.clientId ?? null, Date.now()));
    sync.scheduleFlush(DEBOUNCE_MS);
  },

  undo(campaignId: string): number | null {
    if (!currentUser) return null;
    const r = Q.undo(state, currentUser, campaignId, inflight?.clientId ?? null, Date.now());
    if (!r) return null;
    setState(r[0]);
    sync.scheduleFlush(DEBOUNCE_MS);
    return r[1];
  },

  mergeSnapshot(campaignId: string, patch: Partial<Omit<Q.ServerSnapshot, "updatedAtMillis">>, updatedAt?: string | null) {
    if (sync.isInflight(campaignId)) return;
    setState(Q.mergeSnapshot(state, campaignId, patch, millis(updatedAt)));
  },

  resetSnapshot(campaignId: string, personalCount: number, personalGoal: number, total: number, globalGoal: number, updatedAt?: string | null) {
    if (sync.isInflight(campaignId)) return;
    const m = millis(updatedAt);
    const cur = state.snapshots[campaignId];
    if (cur && cur.updatedAtMillis > m) return;
    setState({ ...state, snapshots: { ...state.snapshots, [campaignId]: { personalCount, personalGoal, campaignTotal: total, globalGoal, updatedAtMillis: m } } });
  },

  scheduleFlush(delay = 0) {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => { void sync.flush(); }, delay);
  },

  async flush(): Promise<boolean> {
    if (flushing || !currentUser) return false;
    const { data } = await supabase.auth.getSession();
    if (!data.session) return false;
    flushing = true;
    try {
      for (;;) {
        const op = state.ops.find((o) => o.userId === currentUser);
        if (!op) break;
        inflight = op;
        status = "syncing";
        emit();
        try {
          const r = await zikr.addZikr(op.campaignId, op.amount, op.clientId);
          inflight = null;
          setState(Q.confirm(state, op.clientId, op.campaignId, {
            personalCount: Number(r.personal_count),
            personalGoal: Number(r.personal_goal),
            campaignTotal: Number(r.campaign_total),
            globalGoal: Number(r.global_goal),
            updatedAtMillis: millis(r.updated_at),
          }));
          retryDelay = 1000;
        } catch (e) {
          inflight = null;
          if (isNetworkError(e) || !navigator.onLine) {
            status = "offline";
            emit();
            const wait = retryDelay;
            retryDelay = Math.min(retryDelay * 2, 30000);
            sync.scheduleFlush(wait);
            return false;
          }
          // Refus du serveur (campagne clôturée, participant retiré…) : opération abandonnée
          setState(Q.drop(state, op.clientId));
          const msg = toUserMessage(e);
          errorListeners.forEach((l) => l(msg));
          invalidateListeners.forEach((l) => l(op.campaignId));
        }
      }
      status = state.ops.some((o) => o.userId === currentUser) ? "pending" : "synced";
      emit();
      return true;
    } finally {
      flushing = false;
    }
  },

  clearForSignOut(keepUnsentOf: string | null) {
    setState({ ops: state.ops.filter((o) => o.userId === keepUnsentOf), undo: {}, snapshots: {} });
  },
};

window.addEventListener("online", () => sync.scheduleFlush(0));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") sync.scheduleFlush(0);
});

export function useQueue(): Q.QueueState {
  return useSyncExternalStore(sync.subscribe, sync.getState);
}

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(sync.subscribe, sync.getStatus);
}
