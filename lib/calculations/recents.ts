import type { FoodEntry } from "../../types/database";
import type { FoodItem } from "../openFoodFacts";

// Pure helpers for the quick-log section of add-food.
//
// "Recientes" derives from raw food_entries rows: the same food logged many
// times collapses to one representative (the most recent occurrence), ordered
// newest-first and capped. Identity is (name, source, external_id) — the same
// product logged with different gram amounts is still "the same food", while
// a manual entry that happens to share a name with an OFF product is not.

export const RECENTS_LIMIT = 10;

// Unparseable timestamps sort last instead of poisoning the comparator.
function ts(s: string): number {
  const n = Date.parse(s);
  return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n;
}

export function dedupeRecents(
  entries: FoodEntry[],
  limit: number = RECENTS_LIMIT
): FoodEntry[] {
  const sorted = [...entries].sort((a, b) => ts(b.consumed_at) - ts(a.consumed_at));
  const seen = new Set<string>();
  const out: FoodEntry[] = [];
  for (const e of sorted) {
    const key = `${e.source}|${e.external_id ?? ""}|${e.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

// Structural shape shared by FoodEntry and Favorite rows — everything a quick
// pick needs to either rebuild a FoodItem or insert directly.
export type QuickPick = {
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_grams: number | null;
  source: string;
  external_id: string | null;
};

// OFF-sourced rows with a scalable serving base hop back into the add-food
// quantity step: rebuild the per-100g FoodItem that step consumes. Manual
// rows — or OFF rows without a base (legacy) — return null; quick log inserts
// those directly with their stored absolute macros instead.
export function quickPickToFoodItem(row: QuickPick): FoodItem | null {
  if (row.source !== "openfoodfacts" || !row.external_id) return null;
  const grams = Number(row.serving_grams);
  const kcal = Number(row.calories);
  if (!Number.isFinite(grams) || grams <= 0 || !Number.isFinite(kcal) || kcal < 0) {
    return null;
  }
  const factor = 100 / grams;
  const per = (v: number | null): number | null => {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return round1(n * factor);
  };
  return {
    externalId: row.external_id,
    name: row.name,
    // Brand was folded into `name` when the entry was first inserted
    // ("Producto (Marca)"), so there's nothing separate to recover.
    brand: null,
    imageUrl: null,
    servingSizeGrams: grams,
    per100g: {
      calories: round1(kcal * factor),
      proteinG: per(row.protein_g),
      carbsG: per(row.carbs_g),
      fatG: per(row.fat_g),
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
