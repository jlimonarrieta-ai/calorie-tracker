import { useEffect, useRef, useState } from "react";
import { supabase } from "../supabase";
import { FoodItem, computeMacros } from "../openFoodFacts";
import { FoodEntry, MealType } from "../../types/database";
import { scaleMacros } from "../calculations/scaling";

export type ManualEntry = {
  name: string;
  calories: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  mealType: MealType;
};

// Updates the edit screen can request. Shape matches the two source types:
//   - OFF entries: caller passes `servingGrams`; macros scale linearly here.
//   - Manual entries: caller passes the macro fields directly.
// `mealType` is always required because both flows expose the meal picker.
export type EntryUpdates = {
  mealType: MealType;
  servingGrams?: number;
  calories?: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

// Tri-state result so a duplicate tap (skipped because another insert is in
// flight) doesn't get reported to the user as an error.
export type AddResult = "ok" | "duplicate" | "error";

export function useAddFoodEntry() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function safeSetSubmitting(v: boolean) {
    if (mountedRef.current) setSubmitting(v);
  }
  function safeSetError(v: string | null) {
    if (mountedRef.current) setError(v);
  }

  async function addFromOpenFoodFacts(
    userId: string,
    item: FoodItem,
    grams: number,
    mealType: MealType
  ): Promise<AddResult> {
    if (inFlightRef.current) return "duplicate";
    // Defensive: even though the UI validates, never persist non-finite or
    // non-positive grams since this hook may be called from other call sites.
    if (!Number.isFinite(grams) || grams <= 0) {
      safeSetError("Cantidad inválida");
      return "error";
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      const macros = computeMacros(item, grams);
      const { error } = await supabase.from("food_entries").insert({
        user_id: userId,
        name: item.brand ? `${item.name} (${item.brand})` : item.name,
        calories: macros.calories,
        protein_g: macros.proteinG,
        carbs_g: macros.carbsG,
        fat_g: macros.fatG,
        serving_grams: grams,
        source: "openfoodfacts",
        external_id: item.externalId,
        meal_type: mealType,
      });
      if (error) {
        safeSetError(error.message);
        return "error";
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

  async function addManual(userId: string, entry: ManualEntry): Promise<AddResult> {
    if (inFlightRef.current) return "duplicate";
    if (!entry.name || entry.name.trim() === "") {
      safeSetError("Nombre requerido");
      return "error";
    }
    if (!Number.isFinite(entry.calories) || entry.calories < 0) {
      safeSetError("Calorías inválidas");
      return "error";
    }
    // Each macro is either null/undefined (cleared) or a finite non-negative
    // number. Reject -1 / NaN / Infinity so callers other than the form layer
    // can't slip bad data past the UI-level guard. Mirrors updateEntry.
    const macroFields: Array<keyof ManualEntry> = ["proteinG", "carbsG", "fatG"];
    for (const key of macroFields) {
      const v = entry[key] as number | null | undefined;
      if (v == null) continue;
      if (!Number.isFinite(v) || v < 0) {
        safeSetError("Macro inválido");
        return "error";
      }
    }
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      const { error } = await supabase.from("food_entries").insert({
        user_id: userId,
        name: entry.name,
        calories: entry.calories,
        protein_g: entry.proteinG ?? null,
        carbs_g: entry.carbsG ?? null,
        fat_g: entry.fatG ?? null,
        source: "manual",
        meal_type: entry.mealType,
      });
      if (error) {
        safeSetError(error.message);
        return "error";
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

  async function updateEntry(
    entryId: string,
    userId: string,
    original: FoodEntry,
    updates: EntryUpdates
  ): Promise<AddResult> {
    if (inFlightRef.current) return "duplicate";
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      // Build the patch by source type so we never overwrite a field the
      // current source shouldn't expose (e.g. macros on an OFF entry, which
      // are derived from grams).
      const patch: Record<string, unknown> = { meal_type: updates.mealType };

      if (original.source === "openfoodfacts" && updates.servingGrams !== undefined) {
        if (!Number.isFinite(updates.servingGrams) || updates.servingGrams <= 0) {
          safeSetError("Cantidad inválida");
          return "error";
        }
        // Reject the save when the legacy row has no scalable base. Without this
        // guard scaleMacros falls back to zeros and we'd silently overwrite the
        // existing calories — better to surface the bad state to the user.
        const origGrams = Number(original.serving_grams);
        if (!Number.isFinite(origGrams) || origGrams <= 0) {
          safeSetError(
            "Esta entrada no tiene base de porción para escalar. Bórrala y vuelve a registrarla."
          );
          return "error";
        }
        const scaled = scaleMacros(original, updates.servingGrams);
        patch.serving_grams = updates.servingGrams;
        patch.calories = scaled.calories;
        patch.protein_g = scaled.proteinG;
        patch.carbs_g = scaled.carbsG;
        patch.fat_g = scaled.fatG;
      } else if (original.source === "manual") {
        if (updates.calories !== undefined) {
          if (!Number.isFinite(updates.calories) || updates.calories < 0) {
            safeSetError("Calorías inválidas");
            return "error";
          }
          patch.calories = updates.calories;
        }
        // Each macro is either null (cleared) or a finite non-negative number.
        // We reject -1 / NaN / Infinity here so callers other than the edit
        // screen can't slip bad data past the form-level guard.
        const macroFields: Array<[keyof EntryUpdates, string]> = [
          ["proteinG", "protein_g"],
          ["carbsG", "carbs_g"],
          ["fatG", "fat_g"],
        ];
        for (const [key, col] of macroFields) {
          const v = updates[key] as number | null | undefined;
          if (v === undefined) continue;
          if (v !== null && (!Number.isFinite(v) || v < 0)) {
            safeSetError("Macro inválido");
            return "error";
          }
          patch[col] = v;
        }
      }

      // `.select("id").maybeSingle()` lets us distinguish a save-after-delete
      // race (zero rows matched, no PostgREST error) from a successful update.
      const { data, error } = await supabase
        .from("food_entries")
        .update(patch)
        .eq("id", entryId)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      if (error) {
        safeSetError(error.message);
        return "error";
      }
      if (!data) {
        safeSetError("La entrada ya no existe");
        return "error";
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

  // Hardening: include user_id in the filter so intent is explicit and we don't
  // rely solely on RLS to scope deletes to the current user. Share inFlightRef
  // with the add/update path so a "save then quick-delete" tap or a double-tap
  // on the delete confirm can't fire two concurrent mutations.
  async function deleteEntry(entryId: string, userId: string) {
    if (inFlightRef.current) return false;
    inFlightRef.current = true;
    safeSetSubmitting(true);
    safeSetError(null);
    try {
      const { error } = await supabase
        .from("food_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", userId);
      if (error) {
        safeSetError(error.message);
        return false;
      }
      return true;
    } catch (e: unknown) {
      safeSetError((e as Error).message);
      return false;
    } finally {
      inFlightRef.current = false;
      safeSetSubmitting(false);
    }
  }

  return {
    addFromOpenFoodFacts,
    addManual,
    updateEntry,
    deleteEntry,
    submitting,
    error,
  };
}
