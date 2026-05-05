import { useState } from "react";
import { supabase } from "../supabase";
import { FoodItem, computeMacros } from "../openFoodFacts";

export type ManualEntry = {
  name: string;
  calories: number;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
};

export function useAddFoodEntry() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addFromOpenFoodFacts(userId: string, item: FoodItem, grams: number) {
    setSubmitting(true);
    setError(null);
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
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function addManual(userId: string, entry: ManualEntry) {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("food_entries").insert({
      user_id: userId,
      name: entry.name,
      calories: entry.calories,
      protein_g: entry.proteinG ?? null,
      carbs_g: entry.carbsG ?? null,
      fat_g: entry.fatG ?? null,
      source: "manual",
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  async function deleteEntry(entryId: string) {
    const { error } = await supabase.from("food_entries").delete().eq("id", entryId);
    if (error) {
      setError(error.message);
      return false;
    }
    return true;
  }

  return { addFromOpenFoodFacts, addManual, deleteEntry, submitting, error };
}
