// Pure helpers for the daily summary header (donut + macro bars).
//
// The visualizations need to communicate four states for each metric:
//   - no-target: profile lacks a target for this macro (rare, legacy)
//   - under: consumed < target
//   - at: consumed === target (or rounds to it)
//   - over: consumed > target — both the textual delta and a visual
//           overflow segment are rendered.

export type MacroStatus = "no-target" | "under" | "at" | "over";

export type MacroProgress = {
  consumed: number;
  target: number | null;
  status: MacroStatus;
  // 0..1, capped at 1. Fraction of the bar that should render in the
  // macro's primary color.
  fillPct: number;
  // 0..0.5, capped. Fraction of the bar that should render in the
  // "over" color, overlaying the rightmost portion of the fill so the
  // visual reads "you blew past the target by this much". Hard cap at
  // 0.5 prevents extreme overages (2×, 5×) from breaking layout.
  overflowPct: number;
  // Positive when status === 'under', 0 otherwise.
  remainingG: number;
  // Positive when status === 'over', 0 otherwise.
  overG: number;
};

const MAX_OVERFLOW_VISUAL = 0.5;

export function computeMacroProgress(
  consumed: number,
  target: number | null
): MacroProgress {
  if (target === null || target <= 0 || !Number.isFinite(target)) {
    return {
      consumed,
      target,
      status: "no-target",
      fillPct: 0,
      overflowPct: 0,
      remainingG: 0,
      overG: 0,
    };
  }

  const safeConsumed = Number.isFinite(consumed) ? Math.max(0, consumed) : 0;
  const ratio = safeConsumed / target;

  if (ratio >= 1) {
    const overG = safeConsumed - target;
    return {
      consumed: safeConsumed,
      target,
      status: overG > 0 ? "over" : "at",
      fillPct: 1,
      overflowPct: Math.min(MAX_OVERFLOW_VISUAL, ratio - 1),
      remainingG: 0,
      overG,
    };
  }

  return {
    consumed: safeConsumed,
    target,
    status: "under",
    fillPct: ratio,
    overflowPct: 0,
    remainingG: target - safeConsumed,
    overG: 0,
  };
}
