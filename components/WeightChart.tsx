import { useState } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import type { WeightDomain, WeightSeriesPoint } from "../lib/calculations/weight";

// Hand-rolled line chart (same approach as the DailySummary donut): plain
// react-native-svg primitives with hex colors inlined. Raw weigh-ins render
// as a thin gray line with dots; the 7-day trend is the bold blue line users
// should actually read — day-to-day water noise vs. real direction.

const COLORS = {
  raw: "#9CA3AF", //   gray-400
  dot: "#111827", //   gray-900
  trend: "#2563EB", // blue-600 — clears WCAG 3:1 on white, like the summary palette
  grid: "#F3F4F6", //  gray-100
};

const CHART_HEIGHT = 180;
const PAD = 8;
// Past this many weigh-ins the per-point dots just smear into the line, so
// only the polylines render. Affects dots only — every point stays in the line.
const MAX_DOTS = 90;
// Approximate width of the y-label gutter, used to align the x-label row.
const Y_GUTTER = 34;

export function WeightChart({
  points,
  trend,
  domain,
}: {
  points: WeightSeriesPoint[];
  trend: WeightSeriesPoint[];
  domain: WeightDomain | null;
}) {
  const [width, setWidth] = useState(0);

  if (points.length === 0 || !domain) return null;

  const px = (x: number) => PAD + x * (width - 2 * PAD);
  const py = (y: number) => PAD + (1 - y) * (CHART_HEIGHT - 2 * PAD);
  const toSvgPoints = (list: WeightSeriesPoint[]) =>
    list.map((p) => `${px(p.x)},${py(p.y)}`).join(" ");

  const flatDomain = domain.minWeightKg === domain.maxWeightKg;
  const singleDate = domain.minDate === domain.maxDate;

  return (
    <View>
      <View className="flex-row">
        <View
          className={flatDomain ? "justify-center pr-2" : "justify-between pr-2"}
          style={{ height: CHART_HEIGHT, paddingVertical: 2 }}
        >
          <Text className="text-gray-400 text-xs">{domain.maxWeightKg.toFixed(1)}</Text>
          {!flatDomain && (
            <Text className="text-gray-400 text-xs">{domain.minWeightKg.toFixed(1)}</Text>
          )}
        </View>
        <View
          className="flex-1"
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        >
          {width > 0 && (
            <Svg
              width={width}
              height={CHART_HEIGHT}
              accessibilityRole="image"
              accessibilityLabel={
                `Gráfica de peso: ${points.length} ` +
                `${points.length === 1 ? "pesaje" : "pesajes"} entre ` +
                `${fmtDate(domain.minDate)} y ${fmtDate(domain.maxDate)}, ` +
                `de ${domain.minWeightKg.toFixed(1)} a ${domain.maxWeightKg.toFixed(1)} kilogramos`
              }
            >
              <Line
                x1={PAD}
                y1={py(1)}
                x2={width - PAD}
                y2={py(1)}
                stroke={COLORS.grid}
                strokeWidth={1}
              />
              <Line
                x1={PAD}
                y1={py(0)}
                x2={width - PAD}
                y2={py(0)}
                stroke={COLORS.grid}
                strokeWidth={1}
              />
              {points.length > 1 && (
                <Polyline
                  points={toSvgPoints(points)}
                  fill="none"
                  stroke={COLORS.raw}
                  strokeWidth={1.5}
                />
              )}
              {trend.length > 1 && (
                <Polyline
                  points={toSvgPoints(trend)}
                  fill="none"
                  stroke={COLORS.trend}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )}
              {points.length <= MAX_DOTS &&
                points.map((p) => (
                  <Circle
                    key={p.measuredOn}
                    cx={px(p.x)}
                    cy={py(p.y)}
                    r={points.length === 1 ? 4 : 3}
                    fill={COLORS.dot}
                  />
                ))}
            </Svg>
          )}
        </View>
      </View>

      <View className="flex-row justify-between mt-1" style={{ paddingLeft: Y_GUTTER }}>
        <Text className="text-gray-400 text-xs">{fmtDate(domain.minDate)}</Text>
        {!singleDate && (
          <Text className="text-gray-400 text-xs">{fmtDate(domain.maxDate)}</Text>
        )}
      </View>

      <View className="flex-row items-center mt-2">
        <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: COLORS.trend }} />
        <Text className="text-gray-500 text-xs ml-1.5 mr-4">Tendencia (7 días)</Text>
        <View style={{ width: 12, height: 3, borderRadius: 2, backgroundColor: COLORS.raw }} />
        <Text className="text-gray-500 text-xs ml-1.5">Peso diario</Text>
      </View>
    </View>
  );
}

function fmtDate(d: string): string {
  // parseISO on a date-only string yields *local* midnight; new Date() would
  // parse it as UTC and render the previous day west of Greenwich.
  return format(parseISO(d), "d MMM", { locale: es });
}
