import { computeTargets, TargetInput } from "../targets";

// Helper to build a base input quickly. Tests override the fields they care
// about so the rest of the signature stays implicit.
function build(overrides: Partial<TargetInput>): TargetInput {
  return {
    sex: "male",
    ageYears: 30,
    heightCm: 180,
    weightKg: 80,
    activity: "moderate",
    targetKgPerWeek: 0,
    ...overrides,
  };
}

describe("computeTargets", () => {
  describe("Mifflin-St Jeor base formula", () => {
    it("uses male offset (+5) and applies activity factor", () => {
      // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780
      // TDEE = 1780 * 1.55 (moderate) = 2759
      const r = computeTargets(build({}));
      expect(r.bmr).toBe(1780);
      expect(r.tdee).toBe(2759);
    });

    it("uses female offset (-161)", () => {
      // BMR = 10*65 + 6.25*165 - 5*28 - 161 = 1380.25
      // TDEE = 1380.25 * 1.2 (sedentary) = 1656.3
      const r = computeTargets(
        build({ sex: "female", weightKg: 65, heightCm: 165, ageYears: 28, activity: "sedentary" })
      );
      expect(r.bmr).toBe(1380);
      expect(r.tdee).toBe(1656);
    });

    it("uses other offset (-78), centered between male and female", () => {
      // BMR = 10*70 + 6.25*170 - 5*30 - 78 = 1534.5
      const r = computeTargets(build({ sex: "other", weightKg: 70, heightCm: 170 }));
      expect(r.bmr).toBe(1535);
    });
  });

  describe("daily kcal delta from target_kg_per_week", () => {
    it("maintain: dailyKcal == TDEE when targetKgPerWeek is 0", () => {
      const r = computeTargets(build({ targetKgPerWeek: 0 }));
      expect(r.dailyKcal).toBe(r.tdee);
      expect(r.flooredToMinimum).toBe(false);
    });

    it("maintain: dailyKcal == TDEE when targetKgPerWeek is null", () => {
      const r = computeTargets(build({ targetKgPerWeek: null }));
      expect(r.dailyKcal).toBe(r.tdee);
    });

    it("lose: subtracts 7700 kcal/kg / 7 days from TDEE", () => {
      // delta = -0.5 * 7700 / 7 = -550
      const r = computeTargets(build({ targetKgPerWeek: -0.5 }));
      expect(r.dailyKcal).toBe(r.tdee - 550);
      expect(r.flooredToMinimum).toBe(false);
    });

    it("gain: adds 7700 kcal/kg / 7 days to TDEE", () => {
      // delta = +0.25 * 7700 / 7 ≈ 275
      const r = computeTargets(build({ targetKgPerWeek: 0.25 }));
      expect(r.dailyKcal).toBe(r.tdee + 275);
    });
  });

  describe("per-sex safety floor on daily kcal", () => {
    it("floors female deficit at 1200 kcal and flags it", () => {
      // F 55kg 160cm 50y sedentary -1 kg/wk → TDEE ~1497, delta -1100 → 397 → floored to 1200
      const r = computeTargets(
        build({
          sex: "female",
          weightKg: 55,
          heightCm: 160,
          ageYears: 50,
          activity: "sedentary",
          targetKgPerWeek: -1,
        })
      );
      expect(r.dailyKcal).toBe(1200);
      expect(r.flooredToMinimum).toBe(true);
    });

    it("floors male deficit at 1500 kcal and flags it", () => {
      const r = computeTargets(
        build({
          sex: "male",
          weightKg: 60,
          heightCm: 165,
          ageYears: 55,
          activity: "sedentary",
          targetKgPerWeek: -1.5,
        })
      );
      expect(r.dailyKcal).toBe(1500);
      expect(r.flooredToMinimum).toBe(true);
    });

    it("does not flood-flag a moderate deficit that lands above the floor", () => {
      const r = computeTargets(build({ targetKgPerWeek: -0.5 }));
      expect(r.flooredToMinimum).toBe(false);
    });

    it("flags floor even when rounded raw exactly equals the floor (Codex round 3 Low #2)", () => {
      // M 18y 145cm 46.5kg sedentary -0.04 kg/wk
      // BMR = 465 + 906.25 - 90 + 5 = 1286.25
      // TDEE = 1286.25 * 1.2 = 1543.5
      // delta = -44; raw = 1499.5; Math.round(1499.5) = 1500 = floor.
      // The raw target IS below the floor — warning should fire even though
      // the returned int sits exactly on the floor.
      const r = computeTargets({
        sex: "male",
        ageYears: 18,
        heightCm: 145,
        weightKg: 46.5,
        activity: "sedentary",
        targetKgPerWeek: -0.04,
      });
      expect(r.dailyKcal).toBe(1500);
      expect(r.flooredToMinimum).toBe(true);
    });
  });

  describe("macro allocator — invariants", () => {
    it("typical case: macro kcal sum ≈ dailyKcal, no caps", () => {
      const r = computeTargets(build({ targetKgPerWeek: -0.5 }));
      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      // Allow rounding slack of 1 kcal — proteinG/fatG/carbsG are 1-decimal rounded.
      expect(Math.abs(macroKcal - r.dailyKcal)).toBeLessThan(2);
      expect(r.macrosCapped).toBe(false);
    });

    it("uses 1.8 g/kg protein and 0.9 g/kg fat for body-weight defaults", () => {
      const r = computeTargets(build({ weightKg: 80, targetKgPerWeek: -0.5 }));
      expect(r.proteinG).toBe(144); // 1.8 * 80
      expect(r.fatG).toBe(72); // 0.9 * 80
    });

    it("Codex pathological case: 100kg female on aggressive deficit caps fat, flags both", () => {
      // F 100kg 160cm 40y sedentary -0.75 kg/wk
      // BMR = 1000 + 1000 - 200 - 161 = 1639
      // TDEE = 1639 * 1.2 = 1966.8
      // delta = -0.75 * 7700 / 7 = -825
      // dailyKcal = 1141.8 → floored to 1200
      // Without cap: protein 180g (720) + fat 90g (810) = 1530 > 1200 (BUG)
      // With cap: protein 180g (720), fat capped to 480/9 ≈ 53.3, carbs 0
      const r = computeTargets(
        build({
          sex: "female",
          weightKg: 100,
          heightCm: 160,
          ageYears: 40,
          activity: "sedentary",
          targetKgPerWeek: -0.75,
        })
      );
      expect(r.dailyKcal).toBe(1200);
      expect(r.flooredToMinimum).toBe(true);
      expect(r.macrosCapped).toBe(true);
      expect(r.proteinG).toBe(180); // protein preserved (priority)
      expect(r.fatG).toBeLessThan(90); // fat capped
      expect(r.carbsG).toBe(0); // no kcal left for carbs

      // Critical invariant: macro kcal must not exceed dailyKcal anymore.
      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(macroKcal).toBeLessThanOrEqual(r.dailyKcal);
    });

    it("macrosCapped can fire without flooredToMinimum (heavy user, normal deficit)", () => {
      // A user with realistic anthropometry whose moderate deficit lands ABOVE
      // the floor, but whose body-weight-based macros still exceed dailyKcal.
      // Proves the two flags are independent.
      // F 105kg 165cm 35y sedentary -0.5 kg/wk
      // BMR = 1050 + 1031.25 - 175 - 161 = 1745.25
      // TDEE = 1745.25 * 1.2 = 2094.3
      // dailyKcal = 2094.3 - 550 = 1544.3 → rounded 1544 (above 1200 floor)
      // protein 189g (756) + fat 94.5g (850.5) = 1606.5 > 1544 → cap fat
      const r = computeTargets(
        build({
          sex: "female",
          weightKg: 105,
          heightCm: 165,
          ageYears: 35,
          activity: "sedentary",
          targetKgPerWeek: -0.5,
        })
      );
      expect(r.flooredToMinimum).toBe(false);
      expect(r.macrosCapped).toBe(true);

      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(macroKcal).toBeLessThanOrEqual(r.dailyKcal);
    });

    it("regression — capped path, raw dailyKcal with .4 fraction rounds down", () => {
      // Pre-fix bug: cap ran against unrounded dailyKcal (e.g. 1500.46875)
      // while the returned value was Math.round(...) = 1500. Macros could
      // sum to 1500.3 — passing the cap, breaking the post-round invariant.
      // M 98.5kg 145cm 41y light -0.75 kg/wk → raw dailyKcal 1500.46875.
      const r = computeTargets(
        build({
          sex: "male",
          weightKg: 98.5,
          heightCm: 145,
          ageYears: 41,
          activity: "light",
          targetKgPerWeek: -0.75,
        })
      );
      expect(r.macrosCapped).toBe(true);
      expect(r.flooredToMinimum).toBe(false);

      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(macroKcal).toBeLessThanOrEqual(r.dailyKcal);
    });

    it("regression — NON-capped path, raw dailyKcal with .4 fraction rounds down", () => {
      // Codex round-2 Low: the round-2 fix must also protect the non-capped
      // path. round1() on protein/fat can push them slightly above the body-
      // weight value (e.g. 0.9 * 80.5 = 72.45 -> 72.5 adds 0.45 kcal of fat).
      // Combined with a raw dailyKcal that rounds DOWN (e.g. 2621.44 -> 2621),
      // pre-fix this produced macros > returned integer goal.
      // M 80.5kg 165cm 30y moderate maintain → raw 2621.4375, rounds to 2621.
      const r = computeTargets(
        build({
          sex: "male",
          weightKg: 80.5,
          heightCm: 165,
          ageYears: 30,
          activity: "moderate",
          targetKgPerWeek: 0,
        })
      );
      expect(r.macrosCapped).toBe(false);
      expect(r.flooredToMinimum).toBe(false);
      expect(r.dailyKcal).toBe(2621);

      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(macroKcal).toBeLessThanOrEqual(r.dailyKcal);
    });

    it("FP defense: invariant holds at extreme inputs that surface IEEE-754 recombination (Codex round 3 Low #1)", () => {
      // From Codex's 1M randomized sweep:
      // other / 77.786y / 171.974cm / 291.803kg / very_active / +1.154 kg/wk
      // Pre-fix the rounded one-decimal macros summed to 7969.000000000001,
      // breaking strict <= dailyKcal=7969 by FP residual. Post-hoc carbs trim
      // restores the invariant.
      const r = computeTargets({
        sex: "other",
        ageYears: 77.786,
        heightCm: 171.974,
        weightKg: 291.803,
        activity: "very_active",
        targetKgPerWeek: 1.154,
      });
      const macroKcal = r.proteinG * 4 + r.fatG * 9 + r.carbsG * 4;
      expect(macroKcal).toBeLessThanOrEqual(r.dailyKcal);
    });

    it("never returns negative macros", () => {
      // Worst case engineered: try to push every dial to extreme.
      const r = computeTargets(
        build({
          sex: "female",
          weightKg: 200,
          heightCm: 150,
          ageYears: 80,
          activity: "sedentary",
          targetKgPerWeek: -2,
        })
      );
      expect(r.proteinG).toBeGreaterThanOrEqual(0);
      expect(r.fatG).toBeGreaterThanOrEqual(0);
      expect(r.carbsG).toBeGreaterThanOrEqual(0);
    });
  });

  describe("activity multipliers", () => {
    const cases: Array<[TargetInput["activity"], number]> = [
      ["sedentary", 1.2],
      ["light", 1.375],
      ["moderate", 1.55],
      ["active", 1.725],
      ["very_active", 1.9],
    ];

    it.each(cases)("%s multiplies BMR by %s", (activity, factor) => {
      const r = computeTargets(build({ activity }));
      // BMR for the default build (m/30/180/80) is 1780.
      const expectedTdee = Math.round(1780 * factor);
      expect(r.tdee).toBe(expectedTdee);
    });
  });
});
