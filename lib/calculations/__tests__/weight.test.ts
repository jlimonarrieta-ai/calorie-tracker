import { computeWeightStats, deltaTone, WeightEntryLike } from "../weight";

function entry(measured_on: string, weight_kg: number): WeightEntryLike {
  return { measured_on, weight_kg };
}

describe("computeWeightStats", () => {
  describe("empty and degenerate inputs", () => {
    it("returns empty stats for an empty array", () => {
      const s = computeWeightStats([]);
      expect(s.latest).toBeNull();
      expect(s.delta7d).toBeNull();
      expect(s.delta30d).toBeNull();
      expect(s.points).toEqual([]);
      expect(s.trend).toEqual([]);
      expect(s.domain).toBeNull();
    });

    it("centers a single point at the domain midpoint", () => {
      const s = computeWeightStats([entry("2026-07-01", 81.4)]);
      expect(s.latest).toEqual({ weightKg: 81.4, measuredOn: "2026-07-01" });
      expect(s.delta7d).toBeNull();
      expect(s.delta30d).toBeNull();
      expect(s.points).toEqual([
        { x: 0.5, y: 0.5, weightKg: 81.4, measuredOn: "2026-07-01" },
      ]);
      expect(s.trend).toHaveLength(1);
      expect(s.trend[0].weightKg).toBe(81.4);
      expect(s.domain).toEqual({
        minWeightKg: 81.4,
        maxWeightKg: 81.4,
        minDate: "2026-07-01",
        maxDate: "2026-07-01",
      });
    });

    it("maps a flat series (all weights equal) to y = 0.5", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-05", 80),
        entry("2026-06-11", 80),
      ]);
      expect(s.points.map((p) => p.y)).toEqual([0.5, 0.5, 0.5]);
      // Baseline 10 days back exists, so the delta is 0 — not null.
      expect(s.delta7d).toBe(0);
    });
  });

  describe("sanitization", () => {
    it("filters out non-positive, NaN and unparseable rows", () => {
      const s = computeWeightStats([
        entry("2026-07-01", 0),
        entry("2026-07-02", -5),
        entry("2026-07-03", Number.NaN),
        entry("2026-13-40", 80), // invalid month/day
        entry("2026-02-31", 80), // calendar rollover
        entry("not-a-date", 80),
        entry("2026-07-04", 79.5),
      ]);
      expect(s.points).toHaveLength(1);
      expect(s.latest).toEqual({ weightKg: 79.5, measuredOn: "2026-07-04" });
    });

    it("sorts unsorted input ascending by date", () => {
      const s = computeWeightStats([
        entry("2026-06-20", 81),
        entry("2026-06-10", 83),
        entry("2026-06-15", 82),
      ]);
      expect(s.points.map((p) => p.measuredOn)).toEqual([
        "2026-06-10",
        "2026-06-15",
        "2026-06-20",
      ]);
      expect(s.points[0].x).toBe(0);
      expect(s.points[2].x).toBe(1);
    });

    it("dedupes duplicated dates keeping the last occurrence", () => {
      const s = computeWeightStats([
        entry("2026-06-10", 83),
        entry("2026-06-10", 82.2),
      ]);
      expect(s.points).toHaveLength(1);
      expect(s.latest?.weightKg).toBe(82.2);
    });
  });

  describe("deltas with gaps", () => {
    it("uses the most recent weigh-in at least 7 days older than the latest", () => {
      // Days 0, 3, 10 → for the day-10 anchor, the 7d baseline is day 3.
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-04", 79),
        entry("2026-06-11", 78),
      ]);
      expect(s.delta7d).toBe(-1); // 78 − 79
      expect(s.delta30d).toBeNull();
    });

    it("includes a baseline exactly 7 days back", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-08", 79.2),
      ]);
      expect(s.delta7d).toBeCloseTo(-0.8);
    });

    it("returns null when the span is under 7 days", () => {
      const s = computeWeightStats([
        entry("2026-06-02", 80),
        entry("2026-06-08", 79),
      ]);
      expect(s.delta7d).toBeNull();
      expect(s.delta30d).toBeNull();
    });

    it("computes delta30d across month boundaries", () => {
      const s = computeWeightStats([
        entry("2026-05-30", 84),
        entry("2026-06-15", 82.5),
        entry("2026-07-01", 81.9),
      ]);
      // Anchor Jul 1: 30d baseline = May 30 (32 days back); Jun 15 is only 16.
      expect(s.delta30d).toBeCloseTo(-2.1);
      // 7d baseline = Jun 15 (16 days back).
      expect(s.delta7d).toBeCloseTo(-0.6);
    });

    it("anchors to the latest measurement, not today", () => {
      // Old data only: deltas still compute relative to the last weigh-in.
      const s = computeWeightStats([
        entry("2020-01-01", 90),
        entry("2020-01-20", 88),
      ]);
      expect(s.latest?.measuredOn).toBe("2020-01-20");
      expect(s.delta7d).toBe(-2);
    });

    it("rounds deltas to one decimal", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 81.17),
        entry("2026-06-10", 80),
      ]);
      expect(s.delta7d).toBe(-1.2); // −1.17 → round1 → −1.2
    });
  });

  describe("trend (trailing 7-day SMA)", () => {
    it("averages only rows inside the trailing 7-day window", () => {
      // Daily weights 80, 81, 82 → SMA: 80, 80.5, 81.
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-02", 81),
        entry("2026-06-03", 82),
      ]);
      expect(s.trend.map((t) => t.weightKg)).toEqual([80, 80.5, 81]);
    });

    it("drops rows older than 7 days from the window", () => {
      // 10 daily points weighing 0-indexed day number + 70.
      const entries = Array.from({ length: 10 }, (_, i) =>
        entry(`2026-06-${String(i + 1).padStart(2, "0")}`, 70 + i)
      );
      const s = computeWeightStats(entries);
      // Last point (day idx 9): window = days idx 3..9 → mean = 76.
      expect(s.trend[9].weightKg).toBe(76);
    });

    it("ignores the gap: a lone point after a long break is its own average", () => {
      const s = computeWeightStats([
        entry("2026-05-01", 85),
        entry("2026-06-20", 80),
      ]);
      expect(s.trend[1].weightKg).toBe(80);
    });
  });

  describe("normalization", () => {
    it("spreads x by calendar distance and y by weight range", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-06", 90),
        entry("2026-06-11", 100),
      ]);
      expect(s.points.map((p) => p.x)).toEqual([0, 0.5, 1]);
      expect(s.points.map((p) => p.y)).toEqual([0, 0.5, 1]);
    });

    it("keeps trend inside the raw domain", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 80),
        entry("2026-06-02", 90),
        entry("2026-06-03", 70),
      ]);
      for (const t of s.trend) {
        expect(t.y).toBeGreaterThanOrEqual(0);
        expect(t.y).toBeLessThanOrEqual(1);
      }
    });

    it("handles extreme magnitudes without producing non-finite output", () => {
      const s = computeWeightStats([
        entry("2026-06-01", 0.1),
        entry("2026-06-08", 499.9),
      ]);
      expect(s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
      expect(s.delta7d).toBeCloseTo(499.8);
    });
  });
});

describe("deltaTone", () => {
  it("is neutral without a delta, with a zero delta, or without a direction goal", () => {
    expect(deltaTone(null, -0.5)).toBe("neutral");
    expect(deltaTone(0, -0.5)).toBe("neutral");
    expect(deltaTone(-1, null)).toBe("neutral");
    expect(deltaTone(-1, undefined)).toBe("neutral");
    expect(deltaTone(-1, 0)).toBe("neutral");
    expect(deltaTone(Number.NaN, -0.5)).toBe("neutral");
  });

  it("marks losses good and gains bad when the goal is to lose", () => {
    expect(deltaTone(-0.6, -0.5)).toBe("good");
    expect(deltaTone(0.6, -0.5)).toBe("bad");
  });

  it("marks gains good and losses bad when the goal is to gain", () => {
    expect(deltaTone(0.4, 0.25)).toBe("good");
    expect(deltaTone(-0.4, 0.25)).toBe("bad");
  });
});
