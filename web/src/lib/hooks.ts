import { useCallback, useEffect, useRef, useState } from "react";
import { PAGE_SIZE } from "./api";
import { toUserMessage } from "./errors";

export interface Paged<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  endReached: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
  setItems: (f: (items: T[]) => T[]) => void;
}

/** Liste paginée générique ; se recharge quand une dépendance change. */
export function usePaged<T>(fetchPage: (page: number) => Promise<T[]>, deps: unknown[]): Paged<T> {
  const [items, setItemsState] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [endReached, setEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const page = useRef(0);
  const gen = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const refresh = useCallback(() => {
    const g = ++gen.current;
    page.current = 0;
    setLoading(true);
    setError(null);
    fetchRef.current(0)
      .then((r) => { if (g === gen.current) { setItemsState(r); setEnd(r.length < PAGE_SIZE); } })
      .catch((e) => { if (g === gen.current) setError(toUserMessage(e)); })
      .finally(() => { if (g === gen.current) setLoading(false); });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, deps);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || endReached) return;
    const g = gen.current;
    setLoadingMore(true);
    fetchRef.current(page.current + 1)
      .then((r) => {
        if (g !== gen.current) return;
        page.current += 1;
        setItemsState((x) => [...x, ...r]);
        setEnd(r.length < PAGE_SIZE);
      })
      .catch((e) => setError(toUserMessage(e)))
      .finally(() => setLoadingMore(false));
  }, [loading, loadingMore, endReached]);

  return { items, loading, loadingMore, endReached, error, refresh, loadMore, setItems: setItemsState };
}

export function useDebounced<T>(value: T, ms = 350): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** Exécute une action asynchrone avec état de chargement et message d'erreur. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(toUserMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
