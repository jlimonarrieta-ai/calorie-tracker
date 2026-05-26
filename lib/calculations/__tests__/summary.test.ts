import { computeMacroProgress } from "../summary";

describe("computeMacroProgress", () => {
  describe("no-target branch", () => {
    it("returns no-target when target is null", () => {
      const p = computeMacroProgress(50, null);
      expect(p.status).toBe("no-target");
      expect(p.fillPct).toBe(0);
      expect(p.overflowPct).toBe(0);
      expect(p.remainingG).toBe(0);
      expect(p.overG).toBe(0);
    });

    it("returns no-target when target is zero", () => {
      const p = computeMacroProgress(50, 0);
      expect(p.status).toBe("no-target");
    });

    it("returns no-target when target is negative", () => {
      const p = computeMacroProgress(50, -10);
      expect(p.status).toBe("no-target");
    });

    it("returns no-target when target is NaN or Infinity", () => {
      expect(computeMacroProgress(50, Number.NaN).status).toBe("no-target");
      expect(computeMacroProgress(50, Number.POSITIVE_INFINITY).status).toBe("no-target");
    });
  });

  describe("under-target branch", () => {
    it("computes remaining and fill fraction", () => {
      const p = computeMacroProgress(60, 120);
      expect(p.status).toBe("under");
      expect(p.fillPct).toBeCloseTo(0.5);
      expect(p.overflowPct).toBe(0);
      expect(p.remainingG).toBe(60);
      expect(p.overG).toBe(0);
    });

    it("treats consumed=0 with a positive target as under", () => {
      const p = computeMacroProgress(0, 100);
      expect(p.status).toBe("under");
      expect(p.fillPct).toBe(0);
      expect(p.remainingG).toBe(100);
    });

    it("clamps negative or NaN consumed to zero", () => {
      const p = computeMacroProgress(-30, 100);
      expect(p.status).toBe("under");
      expect(p.fillPct).toBe(0);
      expect(p.remainingG).toBe(100);

      expect(computeMacroProgress(Number.NaN, 100).fillPct).toBe(0);
    });
  });

  describe("at-target branch", () => {
    it("returns 'at' exactly when consumed === target", () => {
      const p = computeMacroProgress(120, 120);
      expect(p.status).toBe("at");
      expect(p.fillPct).toBe(1);
      expect(p.overflowPct).toBe(0);
      expect(p.remainingG).toBe(0);
      expect(p.overG).toBe(0);
    });
  });

  describe("over-target branch", () => {
    it("caps fillPct at 1 and reports overflowPct for moderate overage", () => {
      const p = computeMacroProgress(155, 120);
      expect(p.status).toBe("over");
      expect(p.fillPct).toBe(1);
      // 155/120 - 1 ≈ 0.2917
      expect(p.overflowPct).toBeCloseTo(35 / 120);
      expect(p.overG).toBeCloseTo(35);
      expect(p.remainingG).toBe(0);
    });

    it("caps overflowPct at 0.5 even for extreme overage", () => {
      // 4× target → ratio - 1 = 3, must still cap at 0.5
      const p = computeMacroProgress(480, 120);
      expect(p.status).toBe("over");
      expect(p.fillPct).toBe(1);
      expect(p.overflowPct).toBe(0.5);
      // The overG number itself is uncapped — only the visualization is capped.
      expect(p.overG).toBe(360);
    });

    it("transitions cleanly at the boundary just above target", () => {
      const p = computeMacroProgress(120.0001, 120);
      expect(p.status).toBe("over");
      expect(p.fillPct).toBe(1);
      expect(p.overflowPct).toBeGreaterThan(0);
    });
  });

  describe("kcal use case (large numbers)", () => {
    it("works the same with kcal-scale magnitudes", () => {
      const p = computeMacroProgress(1247, 1900);
      expect(p.status).toBe("under");
      expect(p.remainingG).toBe(653);
      expect(p.fillPct).toBeCloseTo(1247 / 1900);
    });

    it("over-target case in kcal", () => {
      const p = computeMacroProgress(2050, 1900);
      expect(p.status).toBe("over");
      expect(p.overG).toBe(150);
    });
  });
});
