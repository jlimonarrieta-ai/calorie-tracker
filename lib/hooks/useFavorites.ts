import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { Favorite, FavoriteSource, FoodEntry, MealType } from "../../types/database";

// User-curated quick-log shortcuts: list + add + remove.
//
// Concurrency primitives mirror useAddFoodEntry / useTodayEntries:
//   - requestIdRef: the last fetch wins; stale responses are dropped.
//   - mountedRef:   never setState after unmount.
//   - inFlightRef:  block double-submit on mutations (tri-state "duplicate").
//
// `addFavorite` upserts on the natural key (user_id, name, source,
// external_id) — the DB constraint is `unique nulls not distinct`, so manual
// favorites (null external_id) dedupe too. Re-favoriting an existing food
// refreshes its snapshot instead of erroring: idempotent from the UI.

export type FavoriteResult = "ok" | "duplicate" | "error";

export type NewFavorite = {
  name: string;
  calories: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  servingGrams?: number | null;
  source: FavoriteSource;
  externalId?: string | null;
  mealDefault?: MealType | null;
};

// Snapshot an existing log entry as a favorite. Entries from sources the
// favorites table doesn't admit (usda/photo, future) return null so callers
// can hide the action instead of failing at submit.
export function favoriteFromEntry(entry: FoodEntry): NewFavorite | null {
  if (entry.source !== "manual" && entry.source !== "openfoodfacts") return null;
  return {
    name: entry.name,
    calories: Number(entry.calories),
    proteinG: entry.protein_g,
    carbsG: entry.carbs_g,
    fatG: entry.fat_g,
    servingGrams: entry.serving_grams,
    source: entry.source,
    externalId: entry.external_id,
    mealDefault: entry.meal_type,
  };
}

export function useFavorites(userId: string | undefined) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);

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
        setFavorites([]);
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
        .from("favorites")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!mountedRef.current || myId !== requestIdRef.current) return;

      if (error) setError(error.message);
      else setFavorites((data ?? []) as Favorite[]);
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

  function safeSetSubmitting(v: boolean) {
    if (mountedRef.current) setSubmitting(v);
  }
  function safeSetError(v: string | null) {
    if (mountedRef.current) setError(v);
  }

  async function addFavorite(fav: NewFavorite): Promise<FavoriteResult> {
    if (inFlightRef.current) return "duplicate";
    if (!userId) {
      safeSetError("Sin sesión activa");
      return "error";
    }
    if (!fav.name || fav.name.trim() === "") {
      safeSetError("Nombre requerido");
      return "error";
    }
    if (!Number.isFinite(fav.calories) || fav.calories < 0) {
      safeSetError("Calorías inválidas");
      return "error";
    }
    // Macros: null/undefined (unknown) or a finite non-negative number —
    // mirror the addManual guard so no caller slips NaN past the DB CHECKs.
    const macroFields: Array<keyof NewFavorite> = ["proteinG", "carbsG", "fatG"];
    for (const key of macroFields) {
      const v = fav[key] as number | null | undefined;
      if (v == null) continue;
      if (!Number.isFinite(v) || v < 0) {
        safeSetError("Macro inválido");
        return "error";
      }
    }
    if (fav.servingGrams != null && (!Number.isFinite(fav.servingGrams) || fav.servingGrams <= 0)) {
      safeSetError("Porción inválida");
      return "error";
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      // `.select()` so a zero-row result (RLS rejecting the write) is
      // distinguishable from success.
      const { data, error } = await supabase
        .from("favorites")
        .upsert(
          {
            user_id: userId,
            name: fav.name,
            calories: fav.calories,
            protein_g: fav.proteinG ?? null,
            carbs_g: fav.carbsG ?? null,
            fat_g: fav.fatG ?? null,
            serving_grams: fav.servingGrams ?? null,
            source: fav.source,
            external_id: fav.externalId ?? null,
            meal_default: fav.mealDefault ?? null,
          },
          { onConflict: "user_id,name,source,external_id" }
        )
        .select();
      if (error) {
        safeSetError(error.message);
        return "error";
      }
      if (!data || data.length === 0) {
        safeSetError("No se pudo guardar el favorito.");
        return "error";
      }
      const saved = data[0] as Favorite;
      if (mountedRef.current) {
        setFavorites((prev) => [saved, ...prev.filter((f) => f.id !== saved.id)]);
      }
      return "ok";
    } catch (e: unknown) {
      safeSetError((e as Error).message);
      return "error";
    } finally {
      inFlightRef.current = false;
      safeSetSubmitting(false);
    }
  }

  async function removeFavorite(id: string): Promise<FavoriteResult> {
    if (inFlightRef.current) return "duplicate";
    if (!userId) {
      safeSetError("Sin sesión activa");
      return "error";
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      // user_id in the filter for explicit intent, not just RLS.
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) {
        safeSetError(error.message);
        return "error";
      }
      if (mountedRef.current) {
        setFavorites((prev) => prev.filter((f) => f.id !== id));
      }
      return "ok";
    } catch (e: unknown) {
      safeSetError((e as Error).message);
      return "error";
    } finally {
      inFlightRef.current = false;
      safeSetSubmitting(false);
    }
  }

  return { favorites, loading, error, submitting, refetch, addFavorite, removeFavorite };
}
