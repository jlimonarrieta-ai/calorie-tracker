// Open Food Facts API client
// Free, no auth, ~3M products. Docs: https://wiki.openfoodfacts.org/API
//
// We hit the search endpoint, then normalize the response into a `FoodItem`
// shape that's easy to render and to persist in our `food_entries` table.

const BASE = "https://world.openfoodfacts.org";
const KJ_PER_KCAL = 4.184;

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
    "energy-kcal_100g"?: number | string;
    energy_100g?: number | string;
    proteins_100g?: number | string;
    carbohydrates_100g?: number | string;
    fat_100g?: number | string;
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

// For nutrition fields we never expect negatives; clamp to null instead of
// trusting bad data from the upstream API.
function toNonNegative(v: unknown): number | null {
  const n = toNumber(v);
  if (n === null) return null;
  return n >= 0 ? n : null;
}

function pickKcal(n: NonNullable<OFFProduct["nutriments"]>): number | null {
  const direct = toNonNegative(n["energy-kcal_100g"]);
  if (direct !== null) return direct;
  // Fallback: many products only report `energy_100g` in kJ.
  const kj = toNonNegative(n.energy_100g);
  if (kj === null) return null;
  return kj / KJ_PER_KCAL;
}

function normalize(p: OFFProduct): FoodItem | null {
  const name = pickName(p);
  if (!name || !p.code) return null;

  const n = p.nutriments ?? {};
  const kcal = pickKcal(n);
  if (kcal === null) return null;

  return {
    externalId: p.code,
    name,
    brand: p.brands?.split(",")[0]?.trim() || null,
    imageUrl: p.image_small_url || p.image_thumb_url || null,
    servingSizeGrams: toNonNegative(p.serving_quantity),
    per100g: {
      calories: kcal,
      proteinG: toNonNegative(n.proteins_100g),
      carbsG: toNonNegative(n.carbohydrates_100g),
      fatG: toNonNegative(n.fat_100g),
    },
  };
}

// Barcode lookup discriminates three outcomes the scanner UI treats
// differently: a usable product, a product that exists but lacks the
// nutrition data we need (offer manual entry with the name pre-filled),
// and a code OFF simply doesn't know.
export type BarcodeLookup =
  | { status: "found"; item: FoodItem }
  | { status: "no-nutrition"; name: string | null }
  | { status: "not-found" };

// v2 product-by-barcode envelope: { code, status: 1|0, status_verbose,
// product? } — status 0 / missing `product` means unknown or invalid code.
// (Verified against the live API: both invalid and unknown codes answer
// HTTP 200 with status 0, so `product` presence is the discriminator.)
export function parseBarcodeResponse(data: unknown): BarcodeLookup {
  const envelope = data as { product?: OFFProduct } | null | undefined;
  const product = envelope?.product;
  if (!product || typeof product !== "object") return { status: "not-found" };
  const item = normalize(product);
  if (item) return { status: "found", item };
  return { status: "no-nutrition", name: pickName(product) };
}

export async function getByBarcode(code: string, signal?: AbortSignal): Promise<BarcodeLookup> {
  const trimmed = code.trim();
  // EAN-8 through EAN-13/UPC lengths; anything else can't be a food barcode
  // we scan, so skip the network round-trip.
  if (!/^\d{6,14}$/.test(trimmed)) return { status: "not-found" };

  const url =
    `${BASE}/api/v2/product/${trimmed}.json?` +
    new URLSearchParams({
      fields:
        "code,product_name,product_name_es,product_name_en,brands,image_small_url,image_thumb_url,serving_quantity,nutriments",
    }).toString();

  const res = await fetch(url, { signal });
  // Some deployments answer 404 for unknown codes instead of status 0.
  if (res.status === 404) return { status: "not-found" };
  if (!res.ok) throw new Error(`OFF product failed: ${res.status}`);
  return parseBarcodeResponse(await res.json());
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
  const data = (await res.json()) as { products?: unknown };

  if (!Array.isArray(data.products)) return [];
  return (data.products as OFFProduct[])
    .map(normalize)
    .filter((x): x is FoodItem => x !== null);
}

// Compute calories + macros for a given gram amount based on per-100g values.
// Negative or non-finite grams clamp to 0 so we never persist bad numbers.
export function computeMacros(item: FoodItem, grams: number) {
  const safeGrams = Number.isFinite(grams) && grams > 0 ? grams : 0;
  const factor = safeGrams / 100;
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
