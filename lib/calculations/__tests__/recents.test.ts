import { dedupeRecents, quickPickToFoodItem, RECENTS_LIMIT } from "../recents";
import { FoodEntry } from "../../../types/database";

let seq = 0;
function entry(overrides: Partial<FoodEntry>): FoodEntry {
  seq += 1;
  return {
    id: `id-${seq}`,
    user_id: "user-1",
    name: "Avena",
    calories: 150,
    protein_g: 5,
    carbs_g: 27,
    fat_g: 3,
    serving_grams: null,
    consumed_at: "2026-07-01T08:00:00+00:00",
    source: "manual",
    external_id: null,
    meal_type: "breakfast",
    created_at: "2026-07-01T08:00:00+00:00",
    ...overrides,
  };
}

describe("dedupeRecents", () => {
  it("returns an empty array for no entries", () => {
    expect(dedupeRecents([])).toEqual([]);
  });

  it("collapses repeated (name, source, external_id) keeping the most recent", () => {
    const older = entry({ consumed_at: "2026-06-25T09:00:00+00:00", calories: 150 });
    const newer = entry({ consumed_at: "2026-06-30T09:00:00+00:00", calories: 300 });
    const out = dedupeRecents([older, newer]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(newer.id);
  });

  it("orders the result newest-first", () => {
    const a = entry({ name: "A", consumed_at: "2026-06-20T10:00:00+00:00" });
    const b = entry({ name: "B", consumed_at: "2026-06-29T10:00:00+00:00" });
    const c = entry({ name: "C", consumed_at: "2026-06-25T10:00:00+00:00" });
    expect(dedupeRecents([a, b, c]).map((e) => e.name)).toEqual(["B", "C", "A"]);
  });

  it("does not collapse the same name across different sources", () => {
    const manual = entry({ name: "Yogurt", source: "manual", external_id: null });
    const off = entry({
      name: "Yogurt",
      source: "openfoodfacts",
      external_id: "7501000",
      consumed_at: "2026-06-30T10:00:00+00:00",
    });
    expect(dedupeRecents([manual, off])).toHaveLength(2);
  });

  it("does not collapse the same OFF name across different external ids", () => {
    const a = entry({ name: "Leche", source: "openfoodfacts", external_id: "111" });
    const b = entry({ name: "Leche", source: "openfoodfacts", external_id: "222" });
    expect(dedupeRecents([a, b])).toHaveLength(2);
  });

  it("caps at the default limit", () => {
    const entries = Array.from({ length: 15 }, (_, i) =>
      entry({ name: `Comida ${i}`, consumed_at: `2026-06-${String(i + 10)}T10:00:00+00:00` })
    );
    expect(dedupeRecents(entries)).toHaveLength(RECENTS_LIMIT);
  });

  it("honors a custom limit and keeps the newest ones", () => {
    const a = entry({ name: "A", consumed_at: "2026-06-20T10:00:00+00:00" });
    const b = entry({ name: "B", consumed_at: "2026-06-29T10:00:00+00:00" });
    const c = entry({ name: "C", consumed_at: "2026-06-25T10:00:00+00:00" });
    expect(dedupeRecents([a, b, c], 2).map((e) => e.name)).toEqual(["B", "C"]);
  });

  it("pushes entries with unparseable timestamps to the end", () => {
    const bad = entry({ name: "Rota", consumed_at: "garbage" });
    const good = entry({ name: "Buena", consumed_at: "2026-06-29T10:00:00+00:00" });
    expect(dedupeRecents([bad, good]).map((e) => e.name)).toEqual(["Buena", "Rota"]);
  });
});

describe("quickPickToFoodItem", () => {
  const offRow = {
    name: "Yogurt griego (Fage)",
    calories: 550,
    protein_g: 20,
    carbs_g: 30,
    fat_g: 40,
    serving_grams: 250,
    source: "openfoodfacts",
    external_id: "5201054",
  };

  it("rebuilds per-100g values from an OFF row with a serving base", () => {
    const item = quickPickToFoodItem(offRow);
    expect(item).not.toBeNull();
    expect(item?.externalId).toBe("5201054");
    expect(item?.servingSizeGrams).toBe(250);
    expect(item?.per100g).toEqual({
      calories: 220, // 550 / 250 × 100
      proteinG: 8,
      carbsG: 12,
      fatG: 16,
    });
  });

  it("keeps null macros null instead of fabricating zeros", () => {
    const item = quickPickToFoodItem({ ...offRow, protein_g: null, fat_g: null });
    expect(item?.per100g.proteinG).toBeNull();
    expect(item?.per100g.fatG).toBeNull();
    expect(item?.per100g.carbsG).toBe(12);
  });

  it("clamps negative macros to null (bad upstream data)", () => {
    const item = quickPickToFoodItem({ ...offRow, carbs_g: -3 });
    expect(item?.per100g.carbsG).toBeNull();
  });

  it("returns null for manual rows (direct insert path)", () => {
    expect(quickPickToFoodItem({ ...offRow, source: "manual", external_id: null })).toBeNull();
  });

  it("returns null for OFF rows without external id", () => {
    expect(quickPickToFoodItem({ ...offRow, external_id: null })).toBeNull();
  });

  it("returns null for OFF rows without a scalable serving base", () => {
    expect(quickPickToFoodItem({ ...offRow, serving_grams: null })).toBeNull();
    expect(quickPickToFoodItem({ ...offRow, serving_grams: 0 })).toBeNull();
    expect(quickPickToFoodItem({ ...offRow, serving_grams: -50 })).toBeNull();
  });

  it("returns null when calories are not usable", () => {
    expect(quickPickToFoodItem({ ...offRow, calories: Number.NaN })).toBeNull();
    expect(quickPickToFoodItem({ ...offRow, calories: -10 })).toBeNull();
  });

  it("rounds rebuilt values to one decimal", () => {
    const item = quickPickToFoodItem({ ...offRow, serving_grams: 30, calories: 100 });
    expect(item?.per100g.calories).toBeCloseTo(333.3);
  });
});
