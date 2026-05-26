import { FoodEntry } from "../../types/database";

export type ScaledMacros = {
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

// Linearly rescale the calories + macros of an OFF-sourced entry to a new gram
// amount. Null macros stay null (we don't fabricate data the upstream API
// didn't provide). Non-finite / non-positive `newGrams` or a corrupt original
// `serving_grams` collapse to zeros to avoid persisting NaN/Infinity.
export function scaleMacros(original: FoodEntry, newGrams: number): ScaledMacros {
  const origGrams = Number(original.serving_grams);
  const target = Number(newGrams);

  if (
    !Number.isFinite(origGrams) ||
    origGrams <= 0 ||
    !Number.isFinite(target) ||
    target <= 0
  ) {
    return {
      calories: 0,
      proteinG: original.protein_g === null ? null : 0,
      carbsG: original.carbs_g === null ? null : 0,
      fatG: original.fat_g === null ? null : 0,
    };
  }

  const ratio = target / origGrams;
  return {
    calories: round1(Number(original.calories) * ratio),
    proteinG: scaleNullable(original.protein_g, ratio),
    carbsG: scaleNullable(original.carbs_g, ratio),
    fatG: scaleNullable(original.fat_g, ratio),
  };
}

function scaleNullable(value: number | null, ratio: number): number | null {
  if (value === null) return null;
  return round1(Number(value) * ratio);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
