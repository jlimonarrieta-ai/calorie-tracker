import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
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
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../../lib/auth";
import { useTodayEntries } from "../../lib/hooks/useTodayEntries";
import { useAddFoodEntry } from "../../lib/hooks/useAddFoodEntry";

const DAILY_GOAL_DEFAULT = 2000;

export default function Today() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { entries, loading, error, refetch, totalCalories } = useTodayEntries(userId);
  const { deleteEntry } = useAddFoodEntry();

  // Refetch whenever the tab comes into focus (e.g. after adding a food)
  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch])
  );

  const goal = DAILY_GOAL_DEFAULT;
  const remaining = Math.max(0, goal - totalCalories);
  const progress = goal > 0 ? Math.min(1, totalCalories / goal) : 0;

  function handleDelete(id: string, name: string) {
    if (!userId) return;
    Alert.alert("Eliminar", `¿Quitar "${name}" del registro?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Eliminar",
        style: "destructive",
        onPress: async () => {
          const ok = await deleteEntry(id, userId);
          if (ok) refetch();
        },
      },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-white" edges={["bottom"]}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} />}
        ListHeaderComponent={
          <View className="mb-6">
            <Text className="text-gray-500 mb-1">
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: es }).replace(/^./, (s) =>
                s.toUpperCase()
              )}
            </Text>
            <View className="flex-row items-baseline">
              <Text className="text-4xl font-bold">{Math.round(totalCalories)}</Text>
              <Text className="text-gray-500 ml-2">/ {goal} kcal</Text>
            </View>
            <Text className="text-gray-500 mt-1">{Math.round(remaining)} kcal restantes</Text>
            <View className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <View
                className="h-full bg-black"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </View>
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
          </View>
        }
        ListEmptyComponent={
          !loading && !error ? (
            <View className="items-center mt-10">
              <Text className="text-gray-500">Aún no has registrado nada hoy.</Text>
              <Text className="text-gray-400 text-sm mt-1">Toca el botón + para empezar.</Text>
            </View>
          ) : !error ? (
            <ActivityIndicator className="mt-10" />
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row justify-between items-center py-3 border-b border-gray-100"
            onLongPress={() => handleDelete(item.id, item.name)}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${Math.round(Number(item.calories))} kilocalorías`}
            accessibilityHint="Mantén presionado para eliminar"
            accessibilityActions={[{ name: "activate", label: "Eliminar" }]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === "activate") {
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
