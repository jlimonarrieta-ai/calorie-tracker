import { parseBarcodeResponse } from "../openFoodFacts";

// Fixtures mirror the live v2 envelope: { code, status, status_verbose,
// product? } with per-100g nutriment keys.

const fullProduct = {
  code: "3017620422003",
  status: 1,
  status_verbose: "product found",
  product: {
    code: "3017620422003",
    product_name: "Nutella",
    brands: "Ferrero, Nutella",
    serving_quantity: "15",
    nutriments: {
      "energy-kcal_100g": 539,
      proteins_100g: 6.3,
      carbohydrates_100g: 57.5,
      fat_100g: 30.9,
    },
  },
};

describe("parseBarcodeResponse", () => {
  it("maps a full product to a found FoodItem", () => {
    const result = parseBarcodeResponse(fullProduct);
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.item.externalId).toBe("3017620422003");
    expect(result.item.name).toBe("Nutella");
    expect(result.item.brand).toBe("Ferrero");
    expect(result.item.servingSizeGrams).toBe(15);
    expect(result.item.per100g).toEqual({
      calories: 539,
      proteinG: 6.3,
      carbsG: 57.5,
      fatG: 30.9,
    });
  });

  it("prefers the Spanish product name when present", () => {
    const result = parseBarcodeResponse({
      ...fullProduct,
      product: { ...fullProduct.product, product_name_es: "Crema de avellanas" },
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.item.name).toBe("Crema de avellanas");
  });

  it("falls back from kJ to kcal when energy-kcal_100g is missing", () => {
    const result = parseBarcodeResponse({
      ...fullProduct,
      product: {
        ...fullProduct.product,
        nutriments: { energy_100g: 2092 }, // kJ → ÷ 4.184 = 500 kcal
      },
    });
    expect(result.status).toBe("found");
    if (result.status !== "found") return;
    expect(result.item.per100g.calories).toBeCloseTo(500);
    expect(result.item.per100g.proteinG).toBeNull();
  });

  it("returns not-found when the envelope has no product (status 0)", () => {
    expect(
      parseBarcodeResponse({
        code: "00000017",
        status: 0,
        status_verbose: "no code or invalid code",
      }).status
    ).toBe("not-found");
  });

  it("returns not-found for null, undefined and junk payloads", () => {
    expect(parseBarcodeResponse(null).status).toBe("not-found");
    expect(parseBarcodeResponse(undefined).status).toBe("not-found");
    expect(parseBarcodeResponse("garbage").status).toBe("not-found");
    expect(parseBarcodeResponse({ product: "not-an-object" }).status).toBe("not-found");
  });

  it("returns no-nutrition with the name when the product lacks kcal data", () => {
    const result = parseBarcodeResponse({
      ...fullProduct,
      product: {
        code: "123",
        product_name: "Agua mineral",
        nutriments: {},
      },
    });
    expect(result).toEqual({ status: "no-nutrition", name: "Agua mineral" });
  });

  it("returns no-nutrition with null name when the product lacks a name too", () => {
    const result = parseBarcodeResponse({
      ...fullProduct,
      product: { code: "123", nutriments: { "energy-kcal_100g": 100 } },
    });
    // normalize() rejects nameless products, so this lands on no-nutrition.
    expect(result).toEqual({ status: "no-nutrition", name: null });
  });
});
