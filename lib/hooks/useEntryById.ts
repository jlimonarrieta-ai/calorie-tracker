import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { FoodEntry } from "../../types/database";

// Fetches a single food_entries row by id, scoped to the current user. Used by
// the edit screen so deep links / cold loads work even when the Today screen
// hasn't pre-warmed the row in memory.
//
// Concurrency primitives mirror `useTodayEntries`:
//   - requestIdRef: drop stale responses if the user navigates entry → entry
//     and the second fetch resolves before the first.
//   - mountedRef:   never setState after unmount.
// (This is the "landmine #6" pattern; do not regress.)
export function useEntryById(userId: string | undefined, entryId: string | undefined) {
  const [entry, setEntry] = useState<FoodEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(async () => {
    const myId = ++requestIdRef.current;

    if (!userId || !entryId) {
      if (mountedRef.current && myId === requestIdRef.current) {
        setEntry(null);
        setLoading(false);
        setError(null);
      }
      return;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    try {
      // `.maybeSingle()` returns null (not an error) when the row is missing,
      // so a deleted-then-deep-linked entry surfaces a clean "no encontrada"
      // state instead of a PostgREST error string.
      const { data, error } = await supabase
        .from("food_entries")
        .select("*")
        .eq("id", entryId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) {
        setError(error.message);
        setEntry(null);
      } else {
        setEntry((data ?? null) as FoodEntry | null);
      }
    } catch (e: unknown) {
      if (!mountedRef.current || myId !== requestIdRef.current) return;
      setError((e as Error).message);
      setEntry(null);
    } finally {
      if (mountedRef.current && myId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId, entryId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { entry, loading, error, refetch };
}
