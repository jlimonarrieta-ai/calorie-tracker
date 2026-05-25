// Mifflin-St Jeor BMR → TDEE → daily kcal + macro grams.
// All inputs are SI. kcal are returned as integers; grams as 1-decimal numbers.
//
// Safety: daily kcal is floored to a per-sex minimum so an aggressive deficit
// can't drive the target below a healthy threshold. The caller is informed via
// `flooredToMinimum` so the UI can show a warning.

import { ActivityLevel, Sex } from "../../types/database";

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const KCAL_PER_KG_BODY_MASS = 7700;

const MIN_DAILY_KCAL: Record<Sex, number> = {
  male: 1500,
  female: 1200,
  other: 1300,
};

// g per kg of body weight. Conservative defaults; users can override via the
// macro scheduler feature later (P2).
const PROTEIN_G_PER_KG = 1.8;
const FAT_G_PER_KG = 0.9;

export type TargetInput = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  // Signed: negative = lose, positive = gain, 0/null = maintain.
  targetKgPerWeek: number | null;
};

export type TargetOutput = {
  bmr: number;
  tdee: number;
  dailyKcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  flooredToMinimum: boolean;
};

export function computeTargets(input: TargetInput): TargetOutput {
  const { sex, ageYears, heightCm, weightKg, activity, targetKgPerWeek } = input;

  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  const bmr =
    sex === "male"
      ? base + 5
      : sex === "female"
      ? base - 161
      : base - 78; // average of m/f offsets for 'other' so estimates stay centered

  const tdee = bmr * ACTIVITY_FACTORS[activity];

  const dailyDelta = ((targetKgPerWeek ?? 0) * KCAL_PER_KG_BODY_MASS) / 7;
  let dailyKcal = tdee + dailyDelta;

  const floor = MIN_DAILY_KCAL[sex];
  const flooredToMinimum = dailyKcal < floor;
  if (flooredToMinimum) dailyKcal = floor;

  const proteinG = round1(PROTEIN_G_PER_KG * weightKg);
  const fatG = round1(FAT_G_PER_KG * weightKg);
  // Remaining kcal after protein + fat go to carbs. Never let carbs go negative
  // (can happen if floor + high body weight push the macro budget below 0).
  const carbsKcal = Math.max(0, dailyKcal - proteinG * 4 - fatG * 9);
  const carbsG = round1(carbsKcal / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    dailyKcal: Math.round(dailyKcal),
    proteinG,
    carbsG,
    fatG,
    flooredToMinimum,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
