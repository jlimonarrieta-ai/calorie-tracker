import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { useFoodSearch } from "../lib/hooks/useFoodSearch";
import { useAddFoodEntry } from "../lib/hooks/useAddFoodEntry";
import { useRecentFoods } from "../lib/hooks/useRecentFoods";
import { favoriteFromEntry, useFavorites } from "../lib/hooks/useFavorites";
import { FoodItem, computeMacros } from "../lib/openFoodFacts";
import { Favorite, FoodEntry, MealType } from "../types/database";
import { MEAL_ORDER, mealFromDate } from "../lib/calculations/meals";
import { quickPickToFoodItem } from "../lib/calculations/recents";

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Desayuno",
  lunch: "Comida",
  dinner: "Cena",
  snack: "Snack",
};

type Mode = "search" | "manual";

function isMealType(v: unknown): v is MealType {
  return typeof v === "string" && (MEAL_ORDER as readonly string[]).includes(v);
}

function parseNonNeg(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export default function AddFood() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ meal?: string }>();

  // Deep-link meal wins; otherwise infer from local hour at mount time.
  // useMemo keeps the default stable across re-renders so the picker doesn't
  // flicker if the clock crosses a boundary while the modal is open.
  const initialMeal = useMemo<MealType>(
    () => (isMealType(params.meal) ? params.meal : mealFromDate()),
    [params.meal]
  );

  const [mode, setMode] = useState<Mode>("search");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [grams, setGrams] = useState("100");
  const [mealType, setMealType] = useState<MealType>(initialMeal);

  const [manualName, setManualName] = useState("");
  const [manualCalories, setManualCalories] = useState("");
  const [manualProteinG, setManualProteinG] = useState("");
  const [manualCarbsG, setManualCarbsG] = useState("");
  const [manualFatG, setManualFatG] = useState("");

  const { results, loading, error } = useFoodSearch(query);
  const { addFromOpenFoodFacts, addManual, submitting } = useAddFoodEntry();

  const userId = session?.user.id;
  const { recents, loading: recentsLoading } = useRecentFoods(userId);
  const {
    favorites,
    loading: favoritesLoading,
    addFavorite,
    removeFavorite,
  } = useFavorites(userId);
  // An explicit meal deep-link (＋ on a Today section) always wins over a
  // favorite's meal_default; without one the favorite decides, then the hour.
  const hasExplicitMeal = isMealType(params.meal);

  function handleSelect(item: FoodItem) {
    setSelected(item);
    // Default to the product's known serving size when available; otherwise 100g.
    setGrams(String(item.servingSizeGrams ?? 100));
  }

  function quickMealFor(mealDefault: MealType | null): MealType {
    return !hasExplicitMeal && mealDefault ? mealDefault : mealType;
  }

  // Quick log: OFF rows with a serving base jump to the quantity step;
  // everything else (manual rows, legacy OFF without base) inserts directly
  // with its stored absolute macros — via addManual, so the new entry is an
  // editable manual row instead of a re-created legacy OFF one.
  async function handleQuickPick(row: FoodEntry | Favorite, mealDefault: MealType | null) {
    const meal = quickMealFor(mealDefault);
    const item = quickPickToFoodItem(row);
    if (item) {
      setMealType(meal);
      handleSelect(item);
      return;
    }
    if (!userId || submitting) return;
    const result = await addManual(userId, {
      name: row.name,
      calories: Number(row.calories),
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatG: row.fat_g,
      mealType: meal,
    });
    if (result === "ok") router.back();
    else if (result === "error") Alert.alert("Error", "No se pudo guardar la comida.");
    // "duplicate": ignore — the first save is still in flight or just succeeded.
  }

  function handleRemoveFavorite(fav: Favorite) {
    Alert.alert("Quitar favorito", `¿Quitar "${fav.name}" de tus favoritos?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Quitar",
        style: "destructive",
        onPress: async () => {
          const result = await removeFavorite(fav.id);
          if (result === "error") Alert.alert("Error", "No se pudo quitar el favorito.");
          // "duplicate": another mutation is in flight — tap deduped, not failed.
        },
      },
    ]);
  }

  function handleFavoriteRecent(entry: FoodEntry) {
    const fav = favoriteFromEntry(entry);
    if (!fav) return;
    Alert.alert("Favoritos", `¿Guardar "${entry.name}" como favorito?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Guardar",
        onPress: async () => {
          const result = await addFavorite(fav);
          if (result === "error") Alert.alert("Error", "No se pudo guardar el favorito.");
        },
      },
    ]);
  }

  async function handleSaveOff() {
    if (!userId || !selected || submitting) return;
    const g = Number(grams);
    if (!Number.isFinite(g) || g <= 0) {
      Alert.alert("Cantidad inválida", "Ingresa los gramos consumidos.");
      return;
    }
    const result = await addFromOpenFoodFacts(userId, selected, g, mealType);
    if (result === "ok") router.back();
    else if (result === "error") Alert.alert("Error", "No se pudo guardar la comida.");
    // "duplicate": ignore — the first save is still in flight or just succeeded.
  }

  function switchToManualWithName(name: string) {
    setManualName(name);
    setMode("manual");
  }

  async function handleSaveManual() {
    if (!userId || submitting) return;
    const trimmedName = manualName.trim();
    if (trimmedName === "") {
      Alert.alert("Nombre requerido", "Ingresa un nombre para la comida.");
      return;
    }
    const kcal = parseNonNeg(manualCalories);
    if (kcal === null || Number.isNaN(kcal)) {
      Alert.alert("Calorías inválidas", "Ingresa las calorías consumidas.");
      return;
    }
    const protein = parseNonNeg(manualProteinG);
    const carbs = parseNonNeg(manualCarbsG);
    const fat = parseNonNeg(manualFatG);
    if (Number.isNaN(protein) || Number.isNaN(carbs) || Number.isNaN(fat)) {
      Alert.alert(
        "Macro inválido",
        "Revisa que proteína, carbos y grasa sean números válidos."
      );
      return;
    }
    const result = await addManual(userId, {
      name: trimmedName,
      calories: kcal,
      proteinG: protein,
      carbsG: carbs,
      fatG: fat,
      mealType,
    });
    if (result === "ok") router.back();
    else if (result === "error") Alert.alert("Error", "No se pudo guardar la comida.");
    // "duplicate": ignore — the first save is still in flight or just succeeded.
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
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-xl font-bold mb-1">{selected.name}</Text>
            {selected.brand && <Text className="text-gray-500 mb-4">{selected.brand}</Text>}

            <Text className="text-sm text-gray-600 mb-2">Comida</Text>
            <MealChips value={mealType} onChange={setMealType} />

            <Text className="text-sm text-gray-600 mb-2 mt-4">Cantidad consumida (gramos)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-4 text-lg"
              keyboardType="decimal-pad"
              value={grams}
              onChangeText={setGrams}
              autoFocus
              accessibilityLabel="Cantidad en gramos"
            />

            <View className="bg-gray-50 rounded-lg p-4 mb-6">
              <Row label="Calorías" value={`${preview.calories} kcal`} bold />
              <Row label="Proteína" value={preview.proteinG !== null ? `${preview.proteinG} g` : "—"} />
              <Row label="Carbos" value={preview.carbsG !== null ? `${preview.carbsG} g` : "—"} />
              <Row label="Grasa" value={preview.fatG !== null ? `${preview.fatG} g` : "—"} />
            </View>

            <TouchableOpacity
              className="bg-black rounded-lg py-4 items-center"
              onPress={handleSaveOff}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Guardar comida"
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              <Text className="text-white font-semibold">
                {submitting ? "Guardando..." : "Guardar"}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="mt-3 items-center"
              onPress={() => setSelected(null)}
              accessibilityRole="button"
              accessibilityLabel="Cambiar selección de comida"
            >
              <Text className="text-gray-600">Cambiar selección</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: "Agregar comida" }} />
      <View className="px-6 pt-4">
        <ModeToggle mode={mode} onChange={setMode} />
      </View>

      {mode === "search" ? (
        <>
          <View className="px-6 pt-3">
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-2 text-base"
              placeholder="Buscar (ej. avena, plátano, yogurt)"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              accessibilityLabel="Buscar alimento"
            />
            {loading && <ActivityIndicator className="my-2" />}
            {error && <Text className="text-red-500 text-sm">{error}</Text>}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.externalId}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
            ListHeaderComponent={
              query.trim().length < 2 ? (
                <QuickLogSection
                  favorites={favorites}
                  favoritesLoading={favoritesLoading}
                  recents={recents}
                  recentsLoading={recentsLoading}
                  onPickFavorite={(f) => handleQuickPick(f, f.meal_default)}
                  onPickRecent={(e) => handleQuickPick(e, null)}
                  onRemoveFavorite={handleRemoveFavorite}
                  onFavoriteRecent={handleFavoriteRecent}
                />
              ) : null
            }
            ListEmptyComponent={
              !loading && query.trim().length >= 2 ? (
                <View className="mt-6 items-center">
                  <Text className="text-gray-500 text-center mb-3">
                    No encontré “{query.trim()}”.
                  </Text>
                  <TouchableOpacity
                    className="bg-black rounded-lg px-5 py-3"
                    onPress={() => switchToManualWithName(query.trim())}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar como entrada manual"
                  >
                    <Text className="text-white font-semibold">Agregar como manual</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                className="flex-row py-3 border-b border-gray-100"
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={
                  `${item.name}${item.brand ? `, ${item.brand}` : ""}, ` +
                  `${Math.round(item.per100g.calories)} kcal por 100 gramos`
                }
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
                    {Math.round(item.per100g.calories)} kcal / 100g
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      ) : (
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: 48 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text className="text-sm text-gray-600 mb-2">Nombre</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
              value={manualName}
              onChangeText={setManualName}
              placeholder="ej. frijoles charros"
              accessibilityLabel="Nombre de la comida"
            />

            <Text className="text-sm text-gray-600 mb-2">Comida</Text>
            <MealChips value={mealType} onChange={setMealType} />

            <Text className="text-sm text-gray-600 mb-2 mt-4">Calorías</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
              keyboardType="decimal-pad"
              value={manualCalories}
              onChangeText={setManualCalories}
              accessibilityLabel="Calorías"
            />

            <Text className="text-sm text-gray-600 mb-2">Proteína (g)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
              keyboardType="decimal-pad"
              value={manualProteinG}
              onChangeText={setManualProteinG}
              placeholder="Opcional"
              accessibilityLabel="Proteína en gramos"
            />

            <Text className="text-sm text-gray-600 mb-2">Carbohidratos (g)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
              keyboardType="decimal-pad"
              value={manualCarbsG}
              onChangeText={setManualCarbsG}
              placeholder="Opcional"
              accessibilityLabel="Carbohidratos en gramos"
            />

            <Text className="text-sm text-gray-600 mb-2">Grasa (g)</Text>
            <TextInput
              className="border border-gray-300 rounded-lg px-4 py-3 mb-6 text-lg"
              keyboardType="decimal-pad"
              value={manualFatG}
              onChangeText={setManualFatG}
              placeholder="Opcional"
              accessibilityLabel="Grasa en gramos"
            />

            <TouchableOpacity
              className="bg-black rounded-lg py-4 items-center"
              onPress={handleSaveManual}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel="Guardar comida manual"
              accessibilityState={{ disabled: submitting, busy: submitting }}
            >
              <Text className="text-white font-semibold">
                {submitting ? "Guardando..." : "Guardar"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

function ModeToggle({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <View className="flex-row rounded-full border border-gray-300 p-1">
      <ModeTab label="Buscar" active={mode === "search"} onPress={() => onChange("search")} />
      <ModeTab label="Manual" active={mode === "manual"} onPress={() => onChange("manual")} />
    </View>
  );
}

function ModeTab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`flex-1 py-2 items-center rounded-full ${active ? "bg-black" : "bg-white"}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text className={active ? "text-white font-semibold" : "text-gray-700"}>{label}</Text>
    </TouchableOpacity>
  );
}

function MealChips({
  value,
  onChange,
}: {
  value: MealType;
  onChange: (m: MealType) => void;
}) {
  return (
    <View className="flex-row flex-wrap gap-2 mb-1">
      {MEAL_ORDER.map((meal) => {
        const active = meal === value;
        return (
          <TouchableOpacity
            key={meal}
            onPress={() => onChange(meal)}
            className={`px-4 py-2 rounded-full border ${
              active ? "bg-black border-black" : "bg-white border-gray-300"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={MEAL_LABELS[meal]}
          >
            <Text className={active ? "text-white font-medium" : "text-gray-700"}>
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

function quickSubtitle(calories: number, servingGrams: number | null): string {
  const kcal = `${Math.round(Number(calories))} kcal`;
  return servingGrams ? `${kcal} · ${servingGrams} g` : kcal;
}

// "Rápido": favorites + recents shown while the search box is idle
// (query < 2 chars), so frequent foods are one tap away without re-searching.
function QuickLogSection({
  favorites,
  favoritesLoading,
  recents,
  recentsLoading,
  onPickFavorite,
  onPickRecent,
  onRemoveFavorite,
  onFavoriteRecent,
}: {
  favorites: Favorite[];
  favoritesLoading: boolean;
  recents: FoodEntry[];
  recentsLoading: boolean;
  onPickFavorite: (f: Favorite) => void;
  onPickRecent: (e: FoodEntry) => void;
  onRemoveFavorite: (f: Favorite) => void;
  onFavoriteRecent: (e: FoodEntry) => void;
}) {
  return (
    <View className="pt-1 pb-3">
      <Text className="text-sm font-semibold text-gray-700 mb-1">Favoritos</Text>
      {favoritesLoading ? (
        <ActivityIndicator className="my-3" />
      ) : favorites.length === 0 ? (
        <Text className="text-gray-400 text-sm py-2">
          Aún no tienes favoritos. Guárdalos con ☆ al editar una comida o
          manteniendo presionada una reciente.
        </Text>
      ) : (
        favorites.map((f) => (
          <QuickRow
            key={f.id}
            title={f.name}
            subtitle={quickSubtitle(f.calories, f.serving_grams)}
            starred
            onPress={() => onPickFavorite(f)}
            onLongPress={() => onRemoveFavorite(f)}
            hint="Toca para agregar, mantén presionado para quitar de favoritos"
            longPressLabel="Quitar de favoritos"
          />
        ))
      )}

      <Text className="text-sm font-semibold text-gray-700 mb-1 mt-4">Recientes</Text>
      {recentsLoading ? (
        <ActivityIndicator className="my-3" />
      ) : recents.length === 0 ? (
        <Text className="text-gray-400 text-sm py-2">
          Tus comidas recientes aparecerán aquí.
        </Text>
      ) : (
        recents.map((e) => (
          <QuickRow
            key={e.id}
            title={e.name}
            subtitle={quickSubtitle(e.calories, e.serving_grams)}
            starred={false}
            onPress={() => onPickRecent(e)}
            onLongPress={() => onFavoriteRecent(e)}
            hint="Toca para agregar, mantén presionado para guardar como favorito"
            longPressLabel="Guardar como favorito"
          />
        ))
      )}
    </View>
  );
}

function QuickRow({
  title,
  subtitle,
  starred,
  onPress,
  onLongPress,
  hint,
  longPressLabel,
}: {
  title: string;
  subtitle: string;
  starred: boolean;
  onPress: () => void;
  onLongPress: () => void;
  hint: string;
  longPressLabel: string;
}) {
  return (
    <TouchableOpacity
      className="flex-row justify-between items-center py-3 border-b border-gray-100"
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${starred ? "Favorito: " : ""}${title}, ${subtitle}`}
      accessibilityHint={hint}
      accessibilityActions={[
        { name: "activate", label: "Agregar" },
        { name: "longpress", label: longPressLabel },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === "activate") {
          onPress();
        } else if (e.nativeEvent.actionName === "longpress") {
          onLongPress();
        }
      }}
    >
      <View className="flex-1 pr-3 flex-row items-center">
        {starred && <Text className="text-amber-500 mr-2">★</Text>}
        <View className="flex-1">
          <Text className="font-medium" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-gray-500 text-xs mt-0.5">{subtitle}</Text>
        </View>
      </View>
      <Text className="text-gray-400 text-lg leading-none">＋</Text>
    </TouchableOpacity>
  );
}
