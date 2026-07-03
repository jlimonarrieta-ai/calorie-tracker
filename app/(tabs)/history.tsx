import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth";
import { useProfile } from "../../lib/profile";
import { useBodyMetrics } from "../../lib/hooks/useBodyMetrics";
import {
  computeWeightStats,
  deltaTone,
  type DeltaTone,
} from "../../lib/calculations/weight";
import { WeightChart } from "../../components/WeightChart";
import { BodyMetric } from "../../types/database";

const TONE_TEXT: Record<DeltaTone, string> = {
  good: "text-emerald-600",
  bad: "text-red-600",
  neutral: "text-gray-900",
};

function formatSignedKg(delta: number | null): string {
  if (delta === null) return "—";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(1)} kg`;
}

function capitalize(s: string): string {
  return s.replace(/^./, (c) => c.toUpperCase());
}

export default function History() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { metrics, loading, error, refetch, deleteWeight } = useBodyMetrics(userId);
  const { profile } = useProfile();

  // Refetch whenever the tab regains focus (e.g. after saving in log-weight),
  // same pattern as Today.
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const stats = useMemo(() => computeWeightStats(metrics), [metrics]);
  const target = profile?.target_kg_per_week ?? null;

  function handleEdit(m: BodyMetric) {
    router.push({
      pathname: "/log-weight",
      params: {
        date: m.measured_on,
        weight: String(m.weight_kg),
        note: m.note ?? "",
      },
    });
  }

  function handleDelete(m: BodyMetric) {
    const dateLabel = format(parseISO(m.measured_on), "d 'de' MMMM", { locale: es });
    Alert.alert("Eliminar", `¿Quitar el pesaje del ${dateLabel}?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const result = await deleteWeight(m.id);
          if (result === "error") Alert.alert("Error", "No se pudo eliminar el pesaje.");
          // "ok": the hook already removed the row from local state.
          // "duplicate": another mutation is in flight — tap deduped, not failed.
        },
      },
    ]);
  }

  const initialLoad = loading && metrics.length === 0;

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <FlatList
        data={metrics}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListHeaderComponent={
          <View className="mb-2">
            {error && (
              <View className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <Text className="text-red-700 text-sm mb-2">
                  No se pudo cargar tu historial: {error}
                </Text>
                <TouchableOpacity
                  onPress={refetch}
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar carga"
                >
                  <Text className="text-red-700 font-semibold">Reintentar</Text>
                </TouchableOpacity>
              </View>
            )}

            {initialLoad && <ActivityIndicator className="my-6" />}

            {!initialLoad && !error && metrics.length === 0 && (
              <View className="mt-4">
                <Text className="text-gray-500">Aún no registras tu peso.</Text>
                <Text className="text-gray-400 text-sm mt-1">
                  Toca ＋ para agregar tu primer pesaje.
                </Text>
              </View>
            )}

            {stats.latest && (
              <>
                <View className="flex-row gap-3 mb-5">
                  <StatTile
                    label="Actual"
                    value={`${stats.latest.weightKg.toFixed(1)} kg`}
                    tone="neutral"
                    sub={format(parseISO(stats.latest.measuredOn), "d MMM", { locale: es })}
                  />
                  <StatTile
                    label="7 días"
                    value={formatSignedKg(stats.delta7d)}
                    tone={deltaTone(stats.delta7d, target)}
                    sub={stats.delta7d === null ? "Sin datos" : undefined}
                  />
                  <StatTile
                    label="30 días"
                    value={formatSignedKg(stats.delta30d)}
                    tone={deltaTone(stats.delta30d, target)}
                    sub={stats.delta30d === null ? "Sin datos" : undefined}
                  />
                </View>

                <WeightChart points={stats.points} trend={stats.trend} domain={stats.domain} />

                <Text className="text-base font-semibold pt-6 pb-2 border-b border-gray-200">
                  Pesajes
                </Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row justify-between items-center py-3 border-b border-gray-100"
            onPress={() => handleEdit(item)}
            onLongPress={() => handleDelete(item)}
            accessibilityRole="button"
            accessibilityLabel={
              `${format(parseISO(item.measured_on), "d 'de' MMMM", { locale: es })}, ` +
              `${Number(item.weight_kg).toFixed(1)} kilogramos`
            }
            accessibilityHint="Toca para editar, mantén presionado para eliminar"
            accessibilityActions={[
              { name: "activate", label: "Editar" },
              { name: "longpress", label: "Eliminar" },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "activate") {
                handleEdit(item);
              } else if (e.nativeEvent.actionName === "longpress") {
                handleDelete(item);
              }
            }}
          >
            <View className="flex-1 pr-3">
              <Text className="font-medium">
                {capitalize(format(parseISO(item.measured_on), "EEEE d MMM", { locale: es }))}
              </Text>
              {item.note ? (
                <Text className="text-gray-500 text-xs mt-0.5" numberOfLines={1}>
                  {item.note}
                </Text>
              ) : null}
            </View>
            <Text className="font-semibold">{Number(item.weight_kg).toFixed(1)} kg</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        className="absolute right-6 bottom-6 w-14 h-14 rounded-full bg-black items-center justify-center shadow-lg"
        onPress={() => router.push("/log-weight")}
        accessibilityRole="button"
        accessibilityLabel="Registrar peso"
      >
        <Text className="text-white text-3xl leading-none">＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function StatTile({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone: DeltaTone;
  sub?: string;
}) {
  return (
    <View className="flex-1 bg-gray-50 rounded-lg p-3">
      <Text className="text-gray-500 text-xs mb-1">{label}</Text>
      <Text className={`text-lg font-semibold ${TONE_TEXT[tone]}`}>{value}</Text>
      {sub ? <Text className="text-gray-400 text-xs mt-0.5">{sub}</Text> : null}
    </View>
  );
}
