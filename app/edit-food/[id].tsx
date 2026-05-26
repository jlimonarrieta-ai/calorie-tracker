import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useEntryById } from "../../lib/hooks/useEntryById";
import { useAddFoodEntry, EntryUpdates } from "../../lib/hooks/useAddFoodEntry";
import { scaleMacros } from "../../lib/calculations/scaling";
import { MEAL_ORDER } from "../../lib/calculations/meals";
import { MealType, FoodEntry } from "../../types/database";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  dinner: "Cena",
  snack: "Snack",
};

function parseNonNeg(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export default function EditFood() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const entryId = typeof params.id === "string" ? params.id : undefined;
  const userId = session?.user.id;

  const { entry, loading, error } = useEntryById(userId, entryId);
  const { updateEntry, deleteEntry, submitting } = useAddFoodEntry();

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (error || !entry) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-6">
        <Text className="text-gray-700 text-center">
          {error ? `No se pudo cargar la comida: ${error}` : "No se encontró la comida."}
        </Text>
        <TouchableOpacity
          className="mt-4"
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <Text className="text-gray-600 underline">Volver</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <EditFoodForm
      entry={entry}
      submitting={submitting}
      onSave={async (updates) => {
        if (!userId) return;
        const result = await updateEntry(entry.id, userId, entry, updates);
        if (result === "ok") router.back();
        else if (result === "error")
          Alert.alert("Error", "No se pudo guardar la comida.");
      }}
      onDelete={() => {
        if (!userId) return;
        Alert.alert("Eliminar", `¿Quitar "${entry.name}" del registro?`, [
          { text: "Cancelar", style: "cancel" },
          {
            text: "Eliminar",
            style: "destructive",
            onPress: async () => {
              const ok = await deleteEntry(entry.id, userId);
              if (ok) router.back();
              else Alert.alert("Error", "No se pudo eliminar la comida.");
            },
          },
        ]);
      }}
    />
  );
}

function EditFoodForm({
  entry,
  submitting,
  onSave,
  onDelete,
}: {
  entry: FoodEntry;
  submitting: boolean;
  onSave: (updates: EntryUpdates) => Promise<void>;
  onDelete: () => void;
}) {
  const isOff = entry.source === "openfoodfacts";
  // OFF rows from before serving_grams was tracked have null/0 here; the
  // hook rejects the save because there's no base to scale macros from.
  // Surface that up front instead of letting the user discover it at submit.
  const isLegacyOff = isOff && (!entry.serving_grams || entry.serving_grams <= 0);

  const [mealType, setMealType] = useState<MealType>(entry.meal_type);
  const [grams, setGrams] = useState<string>(
    entry.serving_grams !== null ? String(entry.serving_grams) : ""
  );
  const [calories, setCalories] = useState<string>(String(entry.calories ?? ""));
  const [proteinG, setProteinG] = useState<string>(
    entry.protein_g !== null ? String(entry.protein_g) : ""
  );
  const [carbsG, setCarbsG] = useState<string>(
    entry.carbs_g !== null ? String(entry.carbs_g) : ""
  );
  const [fatG, setFatG] = useState<string>(
    entry.fat_g !== null ? String(entry.fat_g) : ""
  );

  // Reset local form state when navigating between different entries while
  // the modal stays mounted (defensive — modal usually unmounts, but useEntryById
  // can swap underneath us).
  useEffect(() => {
    setMealType(entry.meal_type);
    setGrams(entry.serving_grams !== null ? String(entry.serving_grams) : "");
    setCalories(String(entry.calories ?? ""));
    setProteinG(entry.protein_g !== null ? String(entry.protein_g) : "");
    setCarbsG(entry.carbs_g !== null ? String(entry.carbs_g) : "");
    setFatG(entry.fat_g !== null ? String(entry.fat_g) : "");
  }, [entry.id]);

  const previewGrams = Number(grams);
  const scaled =
    isOff && Number.isFinite(previewGrams) && previewGrams > 0
      ? scaleMacros(entry, previewGrams)
      : null;

  async function handleSave() {
    if (submitting) return;

    if (isOff) {
      const g = Number(grams);
      if (!Number.isFinite(g) || g <= 0) {
        Alert.alert("Cantidad inválida", "Ingresa los gramos consumidos.");
        return;
      }
      await onSave({ mealType, servingGrams: g });
      return;
    }

    const kcal = parseNonNeg(calories);
    if (kcal === null || Number.isNaN(kcal)) {
      Alert.alert("Calorías inválidas", "Ingresa las calorías consumidas.");
      return;
    }
    const protein = parseNonNeg(proteinG);
    const carbs = parseNonNeg(carbsG);
    const fat = parseNonNeg(fatG);
    if (Number.isNaN(protein) || Number.isNaN(carbs) || Number.isNaN(fat)) {
      Alert.alert("Macro inválido", "Revisa que proteína, carbos y grasa sean números válidos.");
      return;
    }

    await onSave({
      mealType,
      calories: kcal,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
    });
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: entry.name }} />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-xl font-bold mb-1">{entry.name}</Text>
          <Text className="text-gray-500 mb-4">
            {isOff ? "Open Food Facts" : "Entrada manual"}
          </Text>

          {isLegacyOff && (
            <View
              className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4"
              accessibilityRole="alert"
            >
              <Text className="text-amber-900 font-medium mb-1">⚠ No se puede editar</Text>
              <Text className="text-amber-900 text-sm">
                Esta entrada no tiene base de porción para escalar. Bórrala y vuelve a registrarla.
              </Text>
            </View>
          )}

          <Text className="text-sm text-gray-600 mb-2">Comida</Text>
          <MealChips value={mealType} onChange={setMealType} disabled={isLegacyOff} />

          {isOff ? (
            <>
              <Text className="text-sm text-gray-600 mb-2 mt-4">
                Cantidad consumida (gramos)
              </Text>
              <TextInput
                className={`border border-gray-300 rounded-lg px-4 py-3 mb-4 text-lg ${
                  isLegacyOff ? "bg-gray-100 text-gray-500" : ""
                }`}
                keyboardType="decimal-pad"
                value={grams}
                onChangeText={setGrams}
                editable={!isLegacyOff}
                accessibilityLabel="Cantidad en gramos"
                accessibilityState={{ disabled: isLegacyOff }}
              />

              <View className="bg-gray-50 rounded-lg p-4 mb-6">
                <Row
                  label="Calorías"
                  value={scaled ? `${scaled.calories} kcal` : "—"}
                  bold
                />
                <Row
                  label="Proteína"
                  value={
                    scaled && scaled.proteinG !== null ? `${scaled.proteinG} g` : "—"
                  }
                />
                <Row
                  label="Carbos"
                  value={
                    scaled && scaled.carbsG !== null ? `${scaled.carbsG} g` : "—"
                  }
                />
                <Row
                  label="Grasa"
                  value={scaled && scaled.fatG !== null ? `${scaled.fatG} g` : "—"}
                />
              </View>
            </>
          ) : (
            <>
              <Text className="text-sm text-gray-600 mb-2 mt-4">Calorías</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
                keyboardType="decimal-pad"
                value={calories}
                onChangeText={setCalories}
                accessibilityLabel="Calorías"
              />

              <Text className="text-sm text-gray-600 mb-2">Proteína (g)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
                keyboardType="decimal-pad"
                value={proteinG}
                onChangeText={setProteinG}
                placeholder="Opcional"
                accessibilityLabel="Proteína en gramos"
              />

              <Text className="text-sm text-gray-600 mb-2">Carbohidratos (g)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
                keyboardType="decimal-pad"
                value={carbsG}
                onChangeText={setCarbsG}
                placeholder="Opcional"
                accessibilityLabel="Carbohidratos en gramos"
              />

              <Text className="text-sm text-gray-600 mb-2">Grasa (g)</Text>
              <TextInput
                className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-lg"
                keyboardType="decimal-pad"
                value={fatG}
                onChangeText={setFatG}
                placeholder="Opcional"
                accessibilityLabel="Grasa en gramos"
              />
            </>
          )}

          <TouchableOpacity
            className={`rounded-lg py-4 items-center ${
              submitting || isLegacyOff ? "bg-gray-300" : "bg-black"
            }`}
            onPress={handleSave}
            disabled={submitting || isLegacyOff}
            accessibilityRole="button"
            accessibilityLabel="Guardar cambios"
            accessibilityState={{
              disabled: submitting || isLegacyOff,
              busy: submitting,
            }}
          >
            <Text className="text-white font-semibold">
              {submitting ? "Guardando..." : "Guardar cambios"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-4 items-center"
            onPress={onDelete}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Eliminar comida"
          >
            <Text className="text-red-600 font-medium">Eliminar comida</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MealChips({
  value,
  onChange,
  disabled = false,
}: {
  value: MealType;
  onChange: (m: MealType) => void;
  disabled?: boolean;
}) {
  return (
    <View className="flex-row flex-wrap gap-2 mb-1">
      {MEAL_ORDER.map((meal) => {
        const active = meal === value;
        const bg = disabled
          ? active
            ? "bg-gray-400 border-gray-400"
            : "bg-gray-100 border-gray-200"
          : active
            ? "bg-black border-black"
            : "bg-white border-gray-300";
        return (
          <TouchableOpacity
            key={meal}
            onPress={() => onChange(meal)}
            disabled={disabled}
            className={`px-4 py-2 rounded-full border ${bg}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled }}
            accessibilityLabel={MEAL_LABELS[meal]}
          >
            <Text
              className={
                active
                  ? "text-white font-medium"
                  : disabled
                    ? "text-gray-400"
                    : "text-gray-700"
              }
            >
              {MEAL_LABELS[meal]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
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
