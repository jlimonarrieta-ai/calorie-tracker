export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  daily_calorie_goal: number | null;
  created_at: string;
};

export type FoodEntry = {
  id: string;
  user_id: string;
  name: string;
  calories: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  serving_grams: number | null;
  consumed_at: string;
  source: "manual" | "openfoodfacts" | "usda" | "photo";
  external_id: string | null;
  created_at: string;
};

export type Share = {
  id: string;
  owner_id: string;
  viewer_id: string;
  created_at: string;
};
