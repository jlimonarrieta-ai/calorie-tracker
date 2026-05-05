// Open Food Facts API client
// Free, no auth, ~3M products. Docs: https://wiki.openfoodfacts.org/API
//
// We hit the search endpoint, then normalize the response into a `FoodItem`
// shape that's easy to render and to persist in our `food_entries` table.

const BASE = "https://world.openfoodfacts.org";

export type FoodItem = {
  externalId: string;
  name: string;
  brand: string | null;
  imageUrl: string | null;
  servingSizeGrams: number | null;
  per100g: {
    calories: number;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
  };
};

type OFFProduct = {
  code?: string;
  product_name?: string;
  product_name_es?: string;
  product_name_en?: string;
  brands?: string;
  image_small_url?: string;
  image_thumb_url?: string;
  serving_quantity?: string | number;
  nutriments?: {
    "energy-kcal_100g"?: number;
    "energy_100g"?: number;
    "proteins_100g"?: number;
    "carbohydrates_100g"?: number;
    "fat_100g"?: number;
  };
};

function pickName(p: OFFProduct): string | null {
  return p.product_name_es || p.product_name || p.product_name_en || null;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalize(p: OFFProduct): FoodItem | null {
  const name = pickName(p);
  if (!name || !p.code) return null;

  const n = p.nutriments ?? {};
  const kcal = toNumber(n["energy-kcal_100g"]);
  if (kcal === null) return null;

  return {
    externalId: p.code,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    imageUrl: p.image_small_url || p.image_thumb_url || null,
    servingSizeGrams: toNumber(p.serving_quantity),
    per100g: {
      calories: kcal,
      proteinG: toNumber(n["proteins_100g"]),
      carbsG: toNumber(n["carbohydrates_100g"]),
      fatG: toNumber(n["fat_100g"]),
    },
  };
}

export async function searchFoods(query: string, signal?: AbortSignal): Promise<FoodItem[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url =
    `${BASE}/cgi/search.pl?` +
    new URLSearchParams({
      search_terms: trimmed,
      search_simple: "1",
      action: "process",
      json: "1",
      page_size: "20",
      fields:
        "code,product_name,product_name_es,product_name_en,brands,image_small_url,image_thumb_url,serving_quantity,nutriments",
    }).toString();

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`OFF search failed: ${res.status}`);
  const data = (await res.json()) as { products?: OFFProduct[] };

  return (data.products ?? []).map(normalize).filter((x): x is FoodItem => x !== null);
}

// Compute calories + macros for a given gram amount based on per-100g values
export function computeMacros(item: FoodItem, grams: number) {
  const factor = grams / 100;
  return {
    calories: round1(item.per100g.calories * factor),
    proteinG: item.per100g.proteinG !== null ? round1(item.per100g.proteinG * factor) : null,
    carbsG: item.per100g.carbsG !== null ? round1(item.per100g.carbsG * factor) : null,
    fatG: item.per100g.fatG !== null ? round1(item.per100g.fatG * factor) : null,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
