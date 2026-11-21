import { useEffect, useRef } from "react";
import { supabase } from "./api";

export type ChangeEvent<T> = { eventType: "INSERT" | "UPDATE" | "DELETE"; new: T; old: Partial<T> };

/**
 * Abonnement temps réel à une table (les règles RLS s'appliquent : chacun ne reçoit que ce qu'il peut voir).
 * L'abonnement est fermé automatiquement quand l'écran disparaît.
 */
export function useTableChanges<T>(
  table: string,
  filter: string | null,
  onChange: (e: ChangeEvent<T>) => void,
  enabled = true,
) {
  const handler = useRef(onChange);
  handler.current = onChange;
  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`zk-${table}-${filter ?? "all"}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: { eventType: ChangeEvent<T>["eventType"]; new: T; old: Partial<T> }) =>
          handler.current({ eventType: payload.eventType, new: payload.new, old: payload.old }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [table, filter, enabled]);
}
