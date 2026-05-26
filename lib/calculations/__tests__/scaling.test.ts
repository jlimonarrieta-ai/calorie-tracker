import { FoodEntry } from "../../../types/database";
import { scaleMacros } from "../scaling";

function offEntry(overrides: Partial<FoodEntry> = {}): FoodEntry {
  return {
    id: "entry-1",
    user_id: "user-1",
    name: "Avena",
    calories: 380,
    protein_g: 13.5,
    carbs_g: 66,
    fat_g: 6.5,
    serving_grams: 100,
    consumed_at: "2026-05-25T08:00:00.000Z",
    source: "openfoodfacts",
    external_id: "1234567890",
    meal_type: "breakfast",
    created_at: "2026-05-25T08:00:00.000Z",
    ...overrides,
  };
}

describe("scaleMacros", () => {
  it("scales linearly when target equals original grams (identity)", () => {
    const result = scaleMacros(offEntry(), 100);
    expect(result).toEqual({ calories: 380, proteinG: 13.5, carbsG: 66, fatG: 6.5 });
  });

  it("scales linearly when target doubles the grams", () => {
    const result = scaleMacros(offEntry(), 200);
    expect(result).toEqual({ calories: 760, proteinG: 27, carbsG: 132, fatG: 13 });
  });

  it("preserves null macros after scaling", () => {
    const result = scaleMacros(
      offEntry({ protein_g: null, carbs_g: null, fat_g: 6.5 }),
      50
    );
    expect(result.calories).toBe(190);
    expect(result.proteinG).toBeNull();
    expect(result.carbsG).toBeNull();
    expect(result.fatG).toBe(3.3);
  });

  it("rounds to one decimal place like the OFF computeMacros pipeline", () => {
    const result = scaleMacros(offEntry({ calories: 100, protein_g: 1 }), 33);
    expect(result.calories).toBe(33);
    expect(result.proteinG).toBe(0.3);
  });

  it("defends against serving_grams === 0 by zeroing scaled fields", () => {
    const result = scaleMacros(offEntry({ serving_grams: 0 }), 100);
    expect(result).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
  });

  it("defends against null serving_grams by zeroing scaled fields", () => {
    const result = scaleMacros(offEntry({ serving_grams: null }), 100);
    expect(result.calories).toBe(0);
  });

  it("defends against non-positive newGrams by zeroing scaled fields", () => {
    expect(scaleMacros(offEntry(), 0).calories).toBe(0);
    expect(scaleMacros(offEntry(), -10).calories).toBe(0);
    expect(scaleMacros(offEntry(), Number.NaN).calories).toBe(0);
  });
});
