import { FoodEntry, MealType } from "../../../types/database";
import { MEAL_ORDER, groupByMeal, mealFromHour } from "../meals";

function entry(overrides: Partial<FoodEntry> & { meal_type: MealType }): FoodEntry {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    user_id: "user-1",
    name: "Test food",
    calories: 100,
    protein_g: null,
    carbs_g: null,
    fat_g: null,
    serving_grams: null,
    consumed_at: "2026-05-25T12:00:00.000Z",
    source: "manual",
    external_id: null,
    created_at: "2026-05-25T12:00:00.000Z",
    ...overrides,
  };
}

describe("mealFromHour", () => {
  // Each boundary tested on both sides because off-by-one here would
  // mis-bucket a real-world entry created right at the transition.
  it.each<[number, MealType]>([
    [4, "breakfast"],
    [10, "breakfast"],
    [11, "lunch"],
    [15, "lunch"],
    [16, "dinner"],
    [21, "dinner"],
    [22, "snack"],
    [3, "snack"],
    [0, "snack"],
    [23, "snack"],
  ])("hour %i → %s", (hour, expected) => {
    expect(mealFromHour(hour)).toBe(expected);
  });
});

describe("groupByMeal", () => {
  it("returns 4 sections in canonical order even when input is empty", () => {
    const sections = groupByMeal([]);
    expect(sections.map((s) => s.meal)).toEqual(MEAL_ORDER);
    expect(sections.every((s) => s.entries.length === 0)).toBe(true);
    expect(sections.every((s) => s.totalCalories === 0)).toBe(true);
  });

  it("buckets a single entry into the correct section", () => {
    const sections = groupByMeal([entry({ meal_type: "lunch", calories: 450 })]);
    const lunch = sections.find((s) => s.meal === "lunch")!;
    expect(lunch.entries).toHaveLength(1);
    expect(lunch.totalCalories).toBe(450);
    expect(sections.filter((s) => s.meal !== "lunch").every((s) => s.entries.length === 0)).toBe(
      true
    );
  });

  it("sums calories per section and preserves input order within a section", () => {
    const sections = groupByMeal([
      entry({ id: "a", meal_type: "breakfast", calories: 300 }),
      entry({ id: "b", meal_type: "breakfast", calories: 150 }),
      entry({ id: "c", meal_type: "dinner", calories: 700 }),
    ]);
    const breakfast = sections.find((s) => s.meal === "breakfast")!;
    const dinner = sections.find((s) => s.meal === "dinner")!;
    expect(breakfast.entries.map((e) => e.id)).toEqual(["a", "b"]);
    expect(breakfast.totalCalories).toBe(450);
    expect(dinner.totalCalories).toBe(700);
  });

  it("coerces stringified calories from Supabase numeric columns", () => {
    const sections = groupByMeal([
      entry({ meal_type: "snack", calories: "200" as unknown as number }),
      entry({ meal_type: "snack", calories: "50.5" as unknown as number }),
    ]);
    const snack = sections.find((s) => s.meal === "snack")!;
    expect(snack.totalCalories).toBeCloseTo(250.5);
  });

  it("always emits the 4 canonical meals in MEAL_ORDER", () => {
    const sections = groupByMeal([entry({ meal_type: "snack" })]);
    expect(sections.map((s) => s.meal)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
  });
});
