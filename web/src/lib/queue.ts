// Logique pure de la file d'attente des décomptes (identique à l'application Android).
export interface PendingOp {
  clientId: string;
  userId: string;
  campaignId: string;
  amount: number;
  createdAt: number;
}

export interface ServerSnapshot {
  personalCount: number;
  personalGoal: number;
  campaignTotal: number;
  globalGoal: number;
  updatedAtMillis: number;
}

export interface QueueState {
  ops: PendingOp[];
  undo: Record<string, number[]>;
  snapshots: Record<string, ServerSnapshot>;
}

export const EMPTY_QUEUE: QueueState = { ops: [], undo: {}, snapshots: {} };
export const MAX_OP_AMOUNT = 100_000;
export const MAX_UNDO = 200;

const uuid = () => crypto.randomUUID();

export function pendingSum(s: QueueState, userId: string, campaignId: string): number {
  return s.ops.filter((o) => o.userId === userId && o.campaignId === campaignId).reduce((a, o) => a + o.amount, 0);
}

export function personalDisplayed(s: QueueState, userId: string, campaignId: string): number | null {
  const snap = s.snapshots[campaignId];
  return snap ? snap.personalCount + pendingSum(s, userId, campaignId) : null;
}

export function add(
  s: QueueState, userId: string, campaignId: string, amount: number,
  inflightId: string | null, now: number, recordUndo = true, newId: () => string = uuid,
): QueueState {
  if (amount === 0) return s;
  const ops = [...s.ops];
  let lastIndex = -1;
  ops.forEach((o, i) => { if (o.userId === userId && o.campaignId === campaignId) lastIndex = i; });
  const last = lastIndex >= 0 ? ops[lastIndex] : null;
  const canMerge = last !== null && last.clientId !== inflightId && lastIndex === ops.length - 1 &&
    (last.amount > 0) === (amount > 0) && Math.abs(last.amount + amount) <= MAX_OP_AMOUNT;
  if (canMerge && last) ops[lastIndex] = { ...last, amount: last.amount + amount };
  else ops.push({ clientId: newId(), userId, campaignId, amount, createdAt: now });
  let undo = s.undo;
  if (recordUndo && amount > 0) {
    undo = { ...s.undo, [campaignId]: [...(s.undo[campaignId] ?? []), amount].slice(-MAX_UNDO) };
  }
  return { ...s, ops, undo };
}

/** Annule la dernière action : retirée localement si non envoyée, sinon correction négative. */
export function undo(
  s: QueueState, userId: string, campaignId: string, inflightId: string | null, now: number, newId: () => string = uuid,
): [QueueState, number] | null {
  const stack = s.undo[campaignId] ?? [];
  const amount = stack[stack.length - 1];
  if (amount === undefined) return null;
  const displayed = personalDisplayed(s, userId, campaignId);
  if (displayed === null || displayed < amount) return null;
  const newUndo = { ...s.undo, [campaignId]: stack.slice(0, -1) };
  const ops = [...s.ops];
  let lastIndex = -1;
  ops.forEach((o, i) => { if (o.userId === userId && o.campaignId === campaignId) lastIndex = i; });
  const last = lastIndex >= 0 ? ops[lastIndex] : null;
  if (last && last.clientId !== inflightId && last.amount > 0 && last.amount >= amount) {
    const remaining = last.amount - amount;
    if (remaining === 0) ops.splice(lastIndex, 1);
    else ops[lastIndex] = { ...last, amount: remaining };
    return [{ ...s, ops, undo: newUndo }, amount];
  }
  return [add({ ...s, undo: newUndo }, userId, campaignId, -amount, inflightId, now, false, newId), amount];
}

export function confirm(s: QueueState, clientId: string, campaignId: string, snap: ServerSnapshot): QueueState {
  const cur = s.snapshots[campaignId];
  const next = cur && cur.updatedAtMillis > snap.updatedAtMillis
    ? { ...cur, personalCount: snap.personalCount, personalGoal: snap.personalGoal }
    : snap;
  return { ...s, ops: s.ops.filter((o) => o.clientId !== clientId), snapshots: { ...s.snapshots, [campaignId]: next } };
}

export function drop(s: QueueState, clientId: string): QueueState {
  return { ...s, ops: s.ops.filter((o) => o.clientId !== clientId) };
}

export function mergeSnapshot(
  s: QueueState, campaignId: string,
  patch: Partial<Omit<ServerSnapshot, "updatedAtMillis">>, updatedAtMillis: number,
): QueueState {
  const cur = s.snapshots[campaignId];
  if (!cur) {
    const { personalCount, personalGoal, campaignTotal, globalGoal } = patch;
    if (personalCount === undefined || personalGoal === undefined || campaignTotal === undefined || globalGoal === undefined) return s;
    return { ...s, snapshots: { ...s.snapshots, [campaignId]: { personalCount, personalGoal, campaignTotal, globalGoal, updatedAtMillis } } };
  }
  if (updatedAtMillis < cur.updatedAtMillis) return s;
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  return { ...s, snapshots: { ...s.snapshots, [campaignId]: { ...cur, ...clean, updatedAtMillis } } };
}
