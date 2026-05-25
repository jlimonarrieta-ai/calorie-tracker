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
  // True when body-weight-based macros had to be reduced so their total kcal
  // fit within `dailyKcal`. Can happen independent of `flooredToMinimum` for
  // a heavy user on a moderate deficit (TDEE − deficit can still be below
  // the body-weight macro budget without triggering the per-sex floor).
  macrosCapped: boolean;
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

  // Body-weight-based defaults, then capped so total macro kcal never exceeds
  // dailyKcal. Priority: protein > fat > carbs. Clamping carbs to zero alone
  // (the previous behaviour) silently created targets whose protein+fat kcal
  // exceeded the daily goal — e.g. 100 kg female floored to 1200 kcal ended
  // up with 180 g protein + 90 g fat = 1530 kcal of macros.
  let proteinG = round1(PROTEIN_G_PER_KG * weightKg);
  let fatG = round1(FAT_G_PER_KG * weightKg);
  let macrosCapped = false;

  if (proteinG * 4 > dailyKcal) {
    // Extreme: protein alone exceeds the daily budget. Cap to dailyKcal/4.
    // Floor rather than round so the invariant `macroKcal <= dailyKcal` holds
    // strictly — half-up rounding could otherwise push us back over the budget.
    proteinG = floor1(dailyKcal / 4);
    macrosCapped = true;
  }

  const proteinKcal = proteinG * 4;
  const maxFatKcal = Math.max(0, dailyKcal - proteinKcal);
  if (fatG * 9 > maxFatKcal) {
    fatG = floor1(maxFatKcal / 9);
    macrosCapped = true;
  }

  // Carbs are residual — floor so any rounding remainder is absorbed silently
  // rather than pushed back into the macro total.
  const carbsKcal = Math.max(0, dailyKcal - proteinKcal - fatG * 9);
  const carbsG = floor1(carbsKcal / 4);

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    dailyKcal: Math.round(dailyKcal),
    proteinG,
    carbsG,
    fatG,
    flooredToMinimum,
    macrosCapped,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// Floor to 1 decimal. Used in macro cap paths to guarantee the macro total
// never exceeds `dailyKcal` (`round1` can round up and break the invariant).
function floor1(n: number): number {
  return Math.floor(n * 10) / 10;
}
