import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabase";
import { FoodEntry } from "../../types/database";
import { groupByMeal } from "../calculations/meals";

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function endOfTodayISO(): string {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

export function useTodayEntries(userId: string | undefined) {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // requestId guards against stale responses overwriting newer ones,
  // and against setState after unmount.
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
        setEntries([]);
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
      const { data, error } = await supabase
        .from("food_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("consumed_at", startOfTodayISO())
        .lte("consumed_at", endOfTodayISO())
        .order("consumed_at", { ascending: false });

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) setError(error.message);
      else setEntries((data ?? []) as FoodEntry[]);
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

  const entriesByMeal = useMemo(() => groupByMeal(entries), [entries]);
  const totals = useMemo(
    () =>
      entries.reduce(
        (acc, e) => ({
          kcal: acc.kcal + Number(e.calories),
          proteinG: acc.proteinG + Number(e.protein_g ?? 0),
          carbsG: acc.carbsG + Number(e.carbs_g ?? 0),
          fatG: acc.fatG + Number(e.fat_g ?? 0),
        }),
        { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
      ),
    [entries]
  );

  return { entries, entriesByMeal, totals, loading, error, refetch };
}
