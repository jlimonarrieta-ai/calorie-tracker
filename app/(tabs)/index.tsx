import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  SectionList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth";
import { useTodayEntries } from "../../lib/hooks/useTodayEntries";
import { useAddFoodEntry } from "../../lib/hooks/useAddFoodEntry";
import { useProfile } from "../../lib/profile";
import { FoodEntry, MealType } from "../../types/database";
import { DailySummary } from "../../components/DailySummary";

// Fallback only — onboarding guarantees `daily_calorie_goal` is set before the
// user lands here, but we keep a sane default in case the profile read fails.
const DAILY_GOAL_FALLBACK = 2000;

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  dinner: "Cena",
  snack: "Snack",
};

export default function Today() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { entriesByMeal, totals, loading, error, refetch } = useTodayEntries(userId);
  const { deleteEntry } = useAddFoodEntry();
  const { profile } = useProfile();

  // Refetch whenever the tab comes into focus (e.g. after adding a food)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const hasAnyEntry = entriesByMeal.some((s) => s.entries.length > 0);

  // Profile may be null on the very first paint after sign-in before the
  // ProfileProvider hydrates; fall back to a sane kcal goal so the donut still
  // renders rather than blanking out. Macro targets stay null so DailySummary
  // can show "Sin meta" for them until the profile arrives.
  const targets = {
    kcal: profile?.daily_calorie_goal ?? DAILY_GOAL_FALLBACK,
    proteinG: profile?.protein_g_target ?? null,
    carbsG: profile?.carbs_g_target ?? null,
    fatG: profile?.fat_g_target ?? null,
  };

  function handleDelete(id: string, name: string) {
    if (!userId) return;
    Alert.alert("Eliminar", `¿Quitar "${name}" del registro?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const result = await deleteEntry(id, userId);
          if (result === "ok") refetch();
          // "duplicate": another mutation is in flight, skip silently — the
          // user's tap was deduped, not failed.
          // "error": hook already set the error state; no Today-side toast today.
        },
      },
    ]);
  }

  function handleAddToMeal(meal: MealType) {
    router.push({ pathname: "/add-food", params: { meal } });
  }

  function handleEdit(id: string) {
    router.push({ pathname: "/edit-food/[id]", params: { id } });
  }

  // Suppress the inline "Sin registros" placeholder on the very first load so
  // the global spinner in the header is the only loading affordance. Once the
  // fetch finishes — even if it returns zero rows — the placeholders take
  // over. Subsequent pull-to-refresh keeps existing rows visible because
  // `hasAnyEntry` stays true while data is in state.
  const initialLoad = loading && !hasAnyEntry;
  const sections = entriesByMeal.map((s) => ({
    meal: s.meal,
    totalCalories: s.totalCalories,
    data: s.entries,
  }));

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <SectionList<FoodEntry, (typeof sections)[number]>
        sections={sections}
        stickySectionHeadersEnabled
        keyExtractor={(item, index) => item.id + index}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListHeaderComponent={
          <View className="mb-6">
            <Text className="text-gray-500 mb-3">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: es }).replace(/^./, (s) =>
                s.toUpperCase()
              )}
            </Text>
            <DailySummary totals={totals} targets={targets} />
            {error && (
              <View className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
                <Text className="text-red-700 text-sm mb-2">No se pudo cargar el día: {error}</Text>
                <TouchableOpacity
                  onPress={refetch}
                  accessibilityRole="button"
                  accessibilityLabel="Reintentar carga"
                >
                  <Text className="text-red-700 font-semibold">Reintentar</Text>
                </TouchableOpacity>
              </View>
            )}
            {!loading && !error && !hasAnyEntry && (
              <Text className="text-gray-400 text-sm mt-4">
                Aún no has registrado nada hoy. Toca + en cualquier sección.
              </Text>
            )}
            {loading && !hasAnyEntry && <ActivityIndicator className="mt-6" />}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <TouchableOpacity
            className="flex-row justify-between items-center bg-white pt-4 pb-2 border-b border-gray-200"
            onPress={() => handleAddToMeal(section.meal)}
            accessibilityRole="button"
            accessibilityLabel={`Agregar a ${MEAL_LABELS[section.meal]}`}
            accessibilityHint="Abre la pantalla para agregar comida en esta sección"
          >
            <View className="flex-row items-baseline">
              <Text className="text-base font-semibold">{MEAL_LABELS[section.meal]}</Text>
              <Text className="text-gray-400 text-xs ml-2">
                {Math.round(section.totalCalories)} kcal
              </Text>
            </View>
            <Text className="text-gray-400 text-lg leading-none">＋</Text>
          </TouchableOpacity>
        )}
        renderSectionFooter={({ section }) =>
          section.data.length === 0 && !initialLoad ? (
            <Text className="text-gray-400 text-xs py-3 border-b border-gray-100">
              Sin registros
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row justify-between items-center py-3 border-b border-gray-100"
            onPress={() => handleEdit(item.id)}
            onLongPress={() => handleDelete(item.id, item.name)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${Math.round(Number(item.calories))} kilocalorías`}
            accessibilityHint="Toca para editar, mantén presionado para eliminar"
            accessibilityActions={[
              { name: "activate", label: "Editar" },
              { name: "longpress", label: "Eliminar" },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "activate") {
                handleEdit(item.id);
              } else if (e.nativeEvent.actionName === "longpress") {
                handleDelete(item.id, item.name);
              }
            }}
          >
            <View className="flex-1 pr-3">
              <Text className="font-medium" numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="text-gray-500 text-xs mt-0.5">
                {format(new Date(item.consumed_at), "HH:mm")}
                {item.serving_grams ? ` · ${item.serving_grams}g` : ""}
              </Text>
            </View>
            <Text className="font-semibold">{Math.round(Number(item.calories))} kcal</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        className="absolute right-6 bottom-6 w-14 h-14 rounded-full bg-black items-center justify-center shadow-lg"
        onPress={() => router.push("/add-food")}
        accessibilityRole="button"
        accessibilityLabel="Agregar comida"
      >
        <Text className="text-white text-3xl leading-none">＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}
