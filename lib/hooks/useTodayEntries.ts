import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase";
import { FoodEntry } from "../../types/database";

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

  const refetch = useCallback(async () => {
    if (!userId) {
      setEntries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("food_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("consumed_at", startOfTodayISO())
      .lte("consumed_at", endOfTodayISO())
      .order("consumed_at", { ascending: false });

    if (error) setError(error.message);
    else setEntries((data ?? []) as FoodEntry[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const totalCalories = entries.reduce((sum, e) => sum + Number(e.calories), 0);

  return { entries, loading, error, refetch, totalCalories };
}
