import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { useAuth } from "../lib/auth";
import { useProfile } from "../lib/profile";
import { useBodyMetrics } from "../lib/hooks/useBodyMetrics";

// Modal to log (or re-log) a weigh-in. One weigh-in per calendar day: saving
// upserts on (user_id, measured_on), so re-saving a date replaces that row.
// Entry points: Historial FAB (new, dated today), Historial row tap (edit —
// params carry date/weight/note), and Ajustes → "Registrar peso".

export default function LogWeight() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile } = useProfile();
  const params = useLocalSearchParams<{ date?: string; weight?: string; note?: string }>();

  const isEdit = typeof params.date === "string" && params.date.length > 0;
  // Today in *local* time — toISOString() would shift the date west of UTC.
  const measuredOn = useMemo(
    () => (isEdit && typeof params.date === "string" ? params.date : format(new Date(), "yyyy-MM-dd")),
    [isEdit, params.date]
  );

  const [weight, setWeight] = useState(() => {
    if (typeof params.weight === "string" && params.weight !== "") return params.weight;
    // Pre-fill with the profile snapshot so the user only adjusts decimals.
    return profile?.current_weight_kg != null ? String(profile.current_weight_kg) : "";
  });
  const [note, setNote] = useState(typeof params.note === "string" ? params.note : "");

  const { addOrUpdateWeight, submitting } = useBodyMetrics(session?.user.id);

  const dateLabel = format(parseISO(measuredOn), "EEEE d 'de' MMMM", { locale: es }).replace(
    /^./,
    (s) => s.toUpperCase()
  );

  async function handleSave() {
    if (submitting) return;
    const w = Number(weight);
    if (!Number.isFinite(w) || w <= 0 || w >= 500) {
      Alert.alert("Peso inválido", "Ingresa tu peso en kilogramos (por ejemplo 72.5).");
      return;
    }
    const result = await addOrUpdateWeight(w, measuredOn, note);
    if (result === "ok") {
      if (router.canGoBack()) router.back();
      else router.replace("/(tabs)/history");
    } else if (result === "error") {
      Alert.alert("Error", "No se pudo guardar el pesaje.");
    }
    // "duplicate": ignore — the first save is still in flight or just succeeded.
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: isEdit ? "Editar peso" : "Registrar peso" }} />
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
          <Text className="text-gray-500 mb-4">{dateLabel}</Text>

          <Text className="text-sm text-gray-600 mb-2">Peso (kg)</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-lg"
            keyboardType="decimal-pad"
            value={weight}
            onChangeText={setWeight}
            autoFocus
            placeholder="72.5"
            accessibilityLabel="Peso en kilogramos"
          />

          <Text className="text-sm text-gray-600 mb-2">Nota (opcional)</Text>
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-3 text-base"
            value={note}
            onChangeText={setNote}
            placeholder="ej. en ayunas"
            accessibilityLabel="Nota del pesaje"
          />

          {!isEdit && (
            <Text className="text-gray-400 text-xs mb-6">
              Se registra con la fecha de hoy. Si ya pesaste hoy, se reemplaza ese registro.
            </Text>
          )}

          <TouchableOpacity
            className="bg-black rounded-lg py-4 items-center"
            onPress={handleSave}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel="Guardar pesaje"
            accessibilityState={{ disabled: submitting, busy: submitting }}
          >
            <Text className="text-white font-semibold">
              {submitting ? "Guardando..." : "Guardar"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
