// Pure helpers for the weight-tracking feature (Historial tab).
//
// Input rows mirror `body_metrics`: one weigh-in per calendar day, with a
// date-only string ("YYYY-MM-DD"). All date math here happens in epoch *days*
// derived via Date.UTC so results are timezone-independent — parsing
// "YYYY-MM-DD" with `new Date()` yields UTC midnight and shifts a day west
// of UTC (CDMX included).

export type WeightEntryLike = {
  weight_kg: number;
  measured_on: string; // "YYYY-MM-DD"
};

export type WeightSeriesPoint = {
  // Normalized 0..1 within the series domain. x grows with time; y grows
  // with weight (the chart flips y into screen space). Degenerate domains
  // (single date / flat weights) map to the midpoint 0.5 so a lone weigh-in
  // still renders centered instead of dividing by zero.
  x: number;
  y: number;
  weightKg: number;
  measuredOn: string;
};

export type WeightDomain = {
  minWeightKg: number;
  maxWeightKg: number;
  minDate: string;
  maxDate: string;
};

export type WeightStats = {
  latest: { weightKg: number; measuredOn: string } | null;
  // Latest weight minus the most recent weigh-in at least 7/30 days older
  // than the latest one. Anchored to the last *measurement* (not "today") so
  // the stats stay meaningful when the user skips a few days on the scale.
  // Null when no baseline that old exists. Rounded to 1 decimal.
  delta7d: number | null;
  delta30d: number | null;
  points: WeightSeriesPoint[];
  // Trailing 7-day simple moving average per point. The window is by *date*
  // (not by count) so gaps don't drag stale values in. Averages of member
  // weights can never leave [min, max], so trend shares the raw domain.
  trend: WeightSeriesPoint[];
  domain: WeightDomain | null;
};

const MS_PER_DAY = 86_400_000;
const TREND_WINDOW_DAYS = 7;

// "YYYY-MM-DD" → integer epoch day, or null when malformed. Rejects calendar
// rollovers (e.g. 2026-02-31, which Date.UTC would silently turn into Mar 3).
function epochDay(dateStr: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  if (!Number.isFinite(ms)) return null;
  const roundTrip = new Date(ms);
  if (
    roundTrip.getUTCFullYear() !== y ||
    roundTrip.getUTCMonth() !== mo - 1 ||
    roundTrip.getUTCDate() !== d
  ) {
    return null;
  }
  return ms / MS_PER_DAY;
}

export function computeWeightStats(entries: WeightEntryLike[]): WeightStats {
  // Sanitize: finite positive weight + parseable date. Dedupe by day keeping
  // the last occurrence — the DB's unique constraint makes duplicates
  // impossible, but the pure layer shouldn't rely on that.
  const byDay = new Map<number, { day: number; weightKg: number; measuredOn: string }>();
  for (const e of entries) {
    const day = epochDay(e.measured_on);
    const weightKg = Number(e.weight_kg);
    if (day === null || !Number.isFinite(weightKg) || weightKg <= 0) continue;
    byDay.set(day, { day, weightKg, measuredOn: e.measured_on });
  }

  const sorted = [...byDay.values()].sort((a, b) => a.day - b.day);
  if (sorted.length === 0) {
    return { latest: null, delta7d: null, delta30d: null, points: [], trend: [], domain: null };
  }

  const latestRow = sorted[sorted.length - 1];

  // Most recent weigh-in at least `daysBack` days older than the latest one.
  function baseline(daysBack: number) {
    const cutoff = latestRow.day - daysBack;
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (sorted[i].day <= cutoff) return sorted[i];
    }
    return null;
  }
  const base7 = baseline(7);
  const base30 = baseline(30);

  // Trailing SMA over the last TREND_WINDOW_DAYS calendar days (inclusive).
  const trendWeights = sorted.map((p, i) => {
    let sum = 0;
    let n = 0;
    for (let j = i; j >= 0 && sorted[j].day > p.day - TREND_WINDOW_DAYS; j--) {
      sum += sorted[j].weightKg;
      n++;
    }
    return sum / n;
  });

  const minWeightKg = Math.min(...sorted.map((p) => p.weightKg));
  const maxWeightKg = Math.max(...sorted.map((p) => p.weightKg));
  const minDay = sorted[0].day;
  const xSpan = latestRow.day - minDay;
  const ySpan = maxWeightKg - minWeightKg;
  const normX = (day: number) => (xSpan === 0 ? 0.5 : (day - minDay) / xSpan);
  const normY = (w: number) => (ySpan === 0 ? 0.5 : (w - minWeightKg) / ySpan);

  const points = sorted.map((p) => ({
    x: normX(p.day),
    y: normY(p.weightKg),
    weightKg: p.weightKg,
    measuredOn: p.measuredOn,
  }));
  const trend = sorted.map((p, i) => ({
    x: normX(p.day),
    y: normY(trendWeights[i]),
    weightKg: round1(trendWeights[i]),
    measuredOn: p.measuredOn,
  }));

  return {
    latest: { weightKg: latestRow.weightKg, measuredOn: latestRow.measuredOn },
    delta7d: base7 ? round1(latestRow.weightKg - base7.weightKg) : null,
    delta30d: base30 ? round1(latestRow.weightKg - base30.weightKg) : null,
    points,
    trend,
    domain: {
      minWeightKg,
      maxWeightKg,
      minDate: sorted[0].measuredOn,
      maxDate: latestRow.measuredOn,
    },
  };
}

export type DeltaTone = "good" | "bad" | "neutral";

// Colors a weight delta by whether it moves toward the user's goal.
// `targetKgPerWeek` is signed (negative = lose, positive = gain); maintainers
// (0/null) get neutral because for them no direction is "good".
export function deltaTone(
  delta: number | null,
  targetKgPerWeek: number | null | undefined
): DeltaTone {
  if (delta === null || delta === 0 || !Number.isFinite(delta)) return "neutral";
  if (targetKgPerWeek == null || targetKgPerWeek === 0 || !Number.isFinite(targetKgPerWeek)) {
    return "neutral";
  }
  const wantsLoss = targetKgPerWeek < 0;
  const isLoss = delta < 0;
  return wantsLoss === isLoss ? "good" : "bad";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
