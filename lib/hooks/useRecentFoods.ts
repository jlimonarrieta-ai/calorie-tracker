import { useCallback, useEffect, useRef, useState } from "react";
import { subDays } from "date-fns";
import { supabase } from "../supabase";
import { FoodEntry } from "../../types/database";
import { dedupeRecents } from "../calculations/recents";

// "Recientes" for the quick-log section: what the user actually logged in the
// last 14 days, deduped to one row per food (see dedupeRecents), top 10.
//
// The fetch is capped generously — 300 rows covers 20+ entries/day for the
// whole window — because dedupe needs the raw occurrences, not a DB distinct.
// Concurrency primitives mirror useTodayEntries (requestIdRef + mountedRef).

const WINDOW_DAYS = 14;
const FETCH_CAP = 300;

export function useRecentFoods(userId: string | undefined) {
  const [recents, setRecents] = useState<FoodEntry[]>([]);
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

    if (!userId) {
      if (mountedRef.current && myId === requestIdRef.current) {
        setRecents([]);
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
      const since = subDays(new Date(), WINDOW_DAYS).toISOString();
      const { data, error } = await supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("consumed_at", since)
        .order("consumed_at", { ascending: false })
        .limit(FETCH_CAP);

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) setError(error.message);
      else setRecents(dedupeRecents((data ?? []) as FoodEntry[]));
    } catch (e: unknown) {
      if (!mountedRef.current || myId !== requestIdRef.current) return;
      setError((e as Error).message);
    } finally {
      if (mountedRef.current && myId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { recents, loading, error, refetch };
}
