export type Sex = "male" | "female" | "other";

export type ActivityLevel =
  | "sedentary"
  | "light"
  | "moderate"
  | "active"
  | "very_active";

export type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  daily_calorie_goal: number | null;
  sex: Sex | null;
  age_years: number | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  activity_level: ActivityLevel | null;
  // Signed: negative = lose, positive = gain, 0/null = maintain.
  target_kg_per_week: number | null;
  protein_g_target: number | null;
  carbs_g_target: number | null;
  fat_g_target: number | null;
  onboarded_at: string | null;
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
