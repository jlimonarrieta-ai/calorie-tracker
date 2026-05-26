import { FoodEntry, MealType } from "../../types/database";

// Canonical display order. Today screen renders sections in this sequence
// regardless of how rows arrive from the query.
export const MEAL_ORDER: readonly MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

export type MealSection = {
  meal: MealType;
  entries: FoodEntry[];
  totalCalories: number;
};

// Maps the local hour-of-day to the meal a fresh entry most likely belongs to.
// Boundaries are inclusive on the lower edge:
//   breakfast 4:00–10:59 | lunch 11:00–15:59 | dinner 16:00–21:59 | snack rest.
export function mealFromHour(hour: number): MealType {
  if (hour >= 4 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 16) return "lunch";
  if (hour >= 16 && hour < 22) return "dinner";
  return "snack";
}

export function mealFromDate(date: Date = new Date()): MealType {
  return mealFromHour(date.getHours());
}

// Always returns 4 sections in MEAL_ORDER, even when a meal has zero entries,
// so the UI can render fixed buckets without extra branching.
export function groupByMeal(entries: FoodEntry[]): MealSection[] {
  const buckets: Record<MealType, FoodEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const entry of entries) {
    const bucket = buckets[entry.meal_type] ?? buckets.snack;
    bucket.push(entry);
  }

  return MEAL_ORDER.map((meal) => {
    const list = buckets[meal];
    const totalCalories = list.reduce((sum, e) => sum + Number(e.calories), 0);
    return { meal, entries: list, totalCalories };
  });
}
