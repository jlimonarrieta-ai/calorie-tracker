import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { computeMacroProgress, type MacroProgress } from "../lib/calculations/summary";

export type DailyTotals = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type DailyTargets = {
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

// Tailwind hex values inlined so the SVG donut can consume them directly
// without leaking string-name dependencies on the NativeWind runtime.
// Tailwind -600 variants chosen over -500 so each fill clears the WCAG
// 3:1 graphical-object guideline against the gray-200 track. The color
// family (blue / amber / emerald) is preserved.
const COLORS = {
  protein: "#2563EB", // blue-600
  carbs: "#D97706", //   amber-600
  fat: "#059669", //     emerald-600
  kcalArc: "#000000",
  // red-700, deliberately distinct from any macro color so the overflow
  // segment reads as "warning" rather than "more of the same macro".
  over: "#B91C1C",
  track: "#E5E7EB", //   gray-200
};

const DONUT_SIZE = 96;
const DONUT_STROKE = 10;
const DONUT_RADIUS = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CIRCUMFERENCE = 2 * Math.PI * DONUT_RADIUS;
const DONUT_CENTER = DONUT_SIZE / 2;

export function DailySummary({
  totals,
  targets,
}: {
  totals: DailyTotals;
  targets: DailyTargets;
}) {
  const kcal = computeMacroProgress(totals.kcal, targets.kcal);
  const protein = computeMacroProgress(totals.proteinG, targets.proteinG);
  const carbs = computeMacroProgress(totals.carbsG, targets.carbsG);
  const fat = computeMacroProgress(totals.fatG, targets.fatG);

  return (
    <View className="mb-6">
      <View className="flex-row items-center mb-5">
        <Donut progress={kcal} />
        <View className="ml-5 flex-1">
          <View className="flex-row items-baseline">
            <Text
              className={`text-4xl font-bold ${
                kcal.status === "over" ? "text-red-600" : "text-black"
              }`}
            >
              {Math.round(totals.kcal)}
            </Text>
            {kcal.status !== "no-target" && (
              <Text className="text-gray-500 ml-2">/ {kcal.target} kcal</Text>
            )}
          </View>
          <Text
            className={`text-sm mt-1 ${
              kcal.status === "over" ? "text-red-600 font-semibold" : "text-gray-500"
            }`}
          >
            {kcalSubtitle(kcal)}
          </Text>
        </View>
      </View>

      <MacroBar label="Proteína" color={COLORS.protein} progress={protein} />
      <MacroBar label="Carbos" color={COLORS.carbs} progress={carbs} />
      <MacroBar label="Grasa" color={COLORS.fat} progress={fat} />
    </View>
  );
}

function kcalSubtitle(p: MacroProgress): string {
  if (p.status === "no-target") return "Sin meta de calorías";
  if (p.status === "over") return `+${Math.round(p.overG)} kcal pasados`;
  if (p.status === "at") return "Meta alcanzada";
  return `${Math.round(p.remainingG)} kcal restantes`;
}

function macroHint(p: MacroProgress): string {
  if (p.status === "no-target") return "Sin meta";
  if (p.status === "over") return `+${Math.round(p.overG)} g pasados`;
  if (p.status === "at") return "Meta alcanzada";
  return `${Math.round(p.remainingG)} g restantes`;
}

function Donut({ progress }: { progress: MacroProgress }) {
  const fill = progress.status === "no-target" ? 0 : progress.fillPct;
  const isOver = progress.status === "over";
  const arcColor = isOver ? COLORS.over : COLORS.kcalArc;
  // Use a separate small offset of the dasharray so 0% renders as a clean
  // empty ring rather than a single dot at the start angle.
  const dashLen = Math.max(0, fill * DONUT_CIRCUMFERENCE);
  return (
    <Svg
      width={DONUT_SIZE}
      height={DONUT_SIZE}
      accessibilityRole="image"
      accessibilityLabel={
        progress.status === "no-target"
          ? `${Math.round(progress.consumed)} kilocalorías, sin meta`
          : `${Math.round(progress.consumed)} de ${progress.target} kilocalorías`
      }
    >
      <Circle
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        stroke={COLORS.track}
        strokeWidth={DONUT_STROKE}
        fill="none"
      />
      <Circle
        cx={DONUT_CENTER}
        cy={DONUT_CENTER}
        r={DONUT_RADIUS}
        stroke={arcColor}
        strokeWidth={DONUT_STROKE}
        fill="none"
        strokeDasharray={`${dashLen} ${DONUT_CIRCUMFERENCE}`}
        strokeLinecap="round"
        // Rotate -90° so 0% sits at the 12 o'clock position rather than
        // the SVG default 3 o'clock start.
        transform={`rotate(-90 ${DONUT_CENTER} ${DONUT_CENTER})`}
      />
    </Svg>
  );
}

function MacroBar({
  label,
  color,
  progress,
}: {
  label: string;
  color: string;
  progress: MacroProgress;
}) {
  const isOver = progress.status === "over";
  const isNoTarget = progress.status === "no-target";
  const valueColor = isOver
    ? "text-red-600 font-semibold"
    : isNoTarget
      ? "text-gray-400"
      : "text-gray-700";
  const hintColor = isOver
    ? "text-red-600"
    : isNoTarget
      ? "text-gray-400"
      : "text-gray-500";

  return (
    <View className="mb-3">
      <View className="flex-row justify-between items-start mb-1">
        <Text className="text-gray-700 text-sm">{label}</Text>
        <View className="items-end">
          {/* Always surface the target so users see what they were aiming
             for even when they've gone over. When no target exists we
             fall back to the hint line alone. */}
          {!isNoTarget && (
            <Text className={`text-sm ${valueColor}`}>
              {Math.round(progress.consumed)} / {progress.target} g
            </Text>
          )}
          <Text className={`text-xs ${hintColor}`}>{macroHint(progress)}</Text>
        </View>
      </View>
      <View className="h-2 bg-gray-100 rounded-full overflow-hidden flex-row relative">
        {!isNoTarget && (
          <View
            style={{
              width: `${progress.fillPct * 100}%`,
              backgroundColor: color,
            }}
            className="h-full"
          />
        )}
        {progress.overflowPct > 0 && (
          <View
            // Overlay the rightmost slice with `over` color so the bar still
            // sits inside its original width while signalling the overage.
            // Width is the fraction of the bar that should turn darker red.
            className="h-full absolute right-0 top-0"
            style={{
              width: `${progress.overflowPct * 100}%`,
              backgroundColor: COLORS.over,
            }}
          />
        )}
      </View>
    </View>
  );
}
