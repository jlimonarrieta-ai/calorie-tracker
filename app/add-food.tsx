import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { useFoodSearch } from "../lib/hooks/useFoodSearch";
import { useAddFoodEntry } from "../lib/hooks/useAddFoodEntry";
import { FoodItem, computeMacros } from "../lib/openFoodFacts";

export default function AddFood() {
  const router = useRouter();
  const { session } = useAuth();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const { results, loading, error } = useFoodSearch(query);
  const { addFromOpenFoodFacts, submitting } = useAddFoodEntry();

  const userId = session?.user.id;

  async function handleSave() {
    if (!userId) return;
    if (!selected) return;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) {
      Alert.alert("Cantidad inválida", "Ingresa los gramos consumidos.");
      return;
    }
    const ok = await addFromOpenFoodFacts(userId, selected, g);
    if (ok) router.back();
    else Alert.alert("Error", "No se pudo guardar la comida.");
  }

  if (selected) {
    const preview = computeMacros(selected, Number(grams) || 0);
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Stack.Screen options={{ title: "Cantidad" }} />
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View className="flex-1 px-6 pt-6">
            <Text className="text-xl font-bold mb-1">{selected.name}</Text>
            {selected.brand && <Text className="text-gray-500 mb-4">{selected.brand}</Text>}

            <Text className="text-sm text-gray-600 mb-2">Cantidad consumida (gramos)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-lg"
              keyboardType="numeric"
              value={grams}
              onChangeText={setGrams}
              autoFocus
            />

            <View className="bg-gray-50 rounded-lg p-4 mb-6">
              <Row label="Calorías" value={`${preview.calories} kcal`} bold />
              <Row label="Proteína" value={preview.proteinG !== null ? `${preview.proteinG} g` : "—"} />
              <Row label="Carbos" value={preview.carbsG !== null ? `${preview.carbsG} g` : "—"} />
              <Row label="Grasa" value={preview.fatG !== null ? `${preview.fatG} g` : "—"} />
            </View>

            <TouchableOpacity
              className="bg-black rounded-lg py-4 items-center"
              onPress={handleSave}
              disabled={submitting}
            >
              <Text className="text-white font-semibold">
                {submitting ? "Guardando..." : "Guardar"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity className="mt-3 items-center" onPress={() => setSelected(null)}>
              <Text className="text-gray-600">Cambiar selección</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: "Agregar comida" }} />
      <View className="px-6 pt-4">
        <TextInput
          className="border border-gray-300 rounded-lg px-4 py-3 mb-2 text-base"
          placeholder="Buscar (ej. avena, plátano, yogurt)"
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
        />
        {loading && <ActivityIndicator className="my-2" />}
        {error && <Text className="text-red-500 text-sm">{error}</Text>}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => item.externalId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        ListEmptyComponent={
          !loading && query.length >= 2 ? (
            <Text className="text-gray-500 text-center mt-6">Sin resultados.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            className="flex-row py-3 border-b border-gray-100"
            onPress={() => setSelected(item)}
          >
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} className="w-12 h-12 rounded mr-3" />
            ) : (
              <View className="w-12 h-12 rounded bg-gray-100 mr-3" />
            )}
            <View className="flex-1">
              <Text className="font-medium" numberOfLines={1}>
                {item.name}
              </Text>
              {item.brand && (
                <Text className="text-gray-500 text-xs" numberOfLines={1}>
                  {item.brand}
                </Text>
              )}
              <Text className="text-gray-600 text-xs mt-0.5">
                {item.per100g.calories} kcal / 100g
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View className="flex-row justify-between py-1">
      <Text className={`text-gray-700 ${bold ? "font-semibold" : ""}`}>{label}</Text>
      <Text className={`${bold ? "font-semibold" : "text-gray-700"}`}>{value}</Text>
    </View>
  );
}
