import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityLevel,
  Sex,
} from "../types/database";
import { TargetOutput, computeTargets } from "../lib/calculations/targets";

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; sub: string }[] = [
  { value: "sedentary", label: "Sedentario", sub: "Poco o nada de ejercicio" },
  { value: "light", label: "Ligero", sub: "1-3 días/semana" },
  { value: "moderate", label: "Moderado", sub: "3-5 días/semana" },
  { value: "active", label: "Activo", sub: "6-7 días/semana" },
  { value: "very_active", label: "Muy activo", sub: "2x/día o trabajo físico" },
];

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "Hombre" },
  { value: "female", label: "Mujer" },
  { value: "other", label: "Otro" },
];

export type GoalDirection = "lose" | "maintain" | "gain";

export type GoalsFormValues = {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalDirection;
  // Positive magnitude; sign is derived from `goal`.
  kgPerWeek: number;
  preview: TargetOutput;
};

export type GoalsFormInitial = {
  sex?: Sex | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activity?: ActivityLevel | null;
  // Signed value as stored in DB. The form converts to direction + magnitude.
  targetKgPerWeek?: number | null;
};

type Props = {
  initial?: GoalsFormInitial;
  intro?: { title: string; subtitle: string };
  submitLabel: string;
  submitting: boolean;
  onSubmit: (values: GoalsFormValues) => void;
};

export function GoalsForm({
  initial,
  intro,
  submitLabel,
  submitting,
  onSubmit,
}: Props) {
  const initialGoal: GoalDirection =
    initial?.targetKgPerWeek == null || initial.targetKgPerWeek === 0
      ? "maintain"
      : initial.targetKgPerWeek < 0
      ? "lose"
      : "gain";

  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const [age, setAge] = useState(initial?.ageYears ? String(initial.ageYears) : "");
  const [heightCm, setHeightCm] = useState(
    initial?.heightCm ? String(initial.heightCm) : ""
  );
  const [weightKg, setWeightKg] = useState(
    initial?.weightKg ? String(initial.weightKg) : ""
  );
  const [activity, setActivity] = useState<ActivityLevel | null>(
    initial?.activity ?? null
  );
  const [goal, setGoal] = useState<GoalDirection>(initialGoal);
  const [kgPerWeek, setKgPerWeek] = useState(
    initial?.targetKgPerWeek
      ? String(Math.abs(initial.targetKgPerWeek))
      : "0.5"
  );

  const parsed = useMemo(() => {
    const a = Number(age);
    const h = Number(heightCm);
    const w = Number(weightKg);
    const kpw = Number(kgPerWeek);
    if (!sex || !activity) return null;
    if (!Number.isFinite(a) || a <= 0 || a >= 120) return null;
    if (!Number.isFinite(h) || h <= 0 || h >= 300) return null;
    if (!Number.isFinite(w) || w <= 0 || w >= 500) return null;
    if (goal !== "maintain" && (!Number.isFinite(kpw) || kpw <= 0 || kpw > 2)) {
      return null;
    }
    return { sex, a, h, w, activity, goal, kpw };
  }, [sex, age, heightCm, weightKg, activity, goal, kgPerWeek]);

  const preview = useMemo<TargetOutput | null>(() => {
    if (!parsed) return null;
    const signed =
      parsed.goal === "maintain"
        ? 0
        : parsed.goal === "lose"
        ? -parsed.kpw
        : parsed.kpw;
    return computeTargets({
      sex: parsed.sex,
      ageYears: parsed.a,
      heightCm: parsed.h,
      weightKg: parsed.w,
      activity: parsed.activity,
      targetKgPerWeek: signed,
    });
  }, [parsed]);

  function handleSubmit() {
    if (!parsed || !preview || submitting) return;
    onSubmit({
      sex: parsed.sex,
      ageYears: parsed.a,
      heightCm: parsed.h,
      weightKg: parsed.w,
      activity: parsed.activity,
      goal: parsed.goal,
      kgPerWeek: parsed.kpw,
      preview,
    });
  }

  const canSubmit = !!preview && !submitting;

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      // Compensates for the modal's stack header (`edit-goals.tsx` opens this
      // form inside a modal). On Android the system handles insets.
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
        // `handled` lets a tap on the submit button both dismiss the keyboard
        // and fire the press in a single tap (otherwise the first tap is
        // absorbed by the keyboard-dismiss gesture).
        keyboardShouldPersistTaps="handled"
        // Lets users swipe down on the form to drag the keyboard away, useful
        // when the `decimal-pad` keypad on iOS has no "Done" key of its own.
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {intro && (
          <View className="mb-6">
            <Text className="text-3xl font-bold mb-1">{intro.title}</Text>
            <Text className="text-gray-500">{intro.subtitle}</Text>
          </View>
        )}

        <Section title="Sexo">
          <View className="flex-row gap-2">
            {SEX_OPTIONS.map((opt) => (
              <SegmentButton
                key={opt.value}
                label={opt.label}
                selected={sex === opt.value}
                onPress={() => setSex(opt.value)}
              />
            ))}
          </View>
        </Section>

        <Section title="Edad">
          <NumberInput
            value={age}
            onChange={setAge}
            placeholder="ej. 32"
            accessibilityLabel="Edad en años"
          />
        </Section>

        <Section title="Estatura (cm)">
          <NumberInput
            value={heightCm}
            onChange={setHeightCm}
            placeholder="ej. 175"
            accessibilityLabel="Estatura en centímetros"
          />
        </Section>

        <Section title="Peso actual (kg)">
          <NumberInput
            value={weightKg}
            onChange={setWeightKg}
            placeholder="ej. 72.5"
            decimals
            accessibilityLabel="Peso actual en kilogramos"
          />
        </Section>

        <Section title="Nivel de actividad">
          <View>
            {ACTIVITY_OPTIONS.map((opt) => (
              <SelectCard
                key={opt.value}
                label={opt.label}
                sub={opt.sub}
                selected={activity === opt.value}
                onPress={() => setActivity(opt.value)}
              />
            ))}
          </View>
        </Section>

        <Section title="Objetivo">
          <View className="flex-row gap-2 mb-3">
            <SegmentButton
              label="Perder"
              selected={goal === "lose"}
              onPress={() => setGoal("lose")}
            />
            <SegmentButton
              label="Mantener"
              selected={goal === "maintain"}
              onPress={() => setGoal("maintain")}
            />
            <SegmentButton
              label="Ganar"
              selected={goal === "gain"}
              onPress={() => setGoal("gain")}
            />
          </View>
          {goal !== "maintain" && (
            <View>
              <Text className="text-sm text-gray-600 mb-2">
                {goal === "lose"
                  ? "kg a perder por semana"
                  : "kg a ganar por semana"}
              </Text>
              <NumberInput
                value={kgPerWeek}
                onChange={setKgPerWeek}
                placeholder="0.5"
                decimals
                accessibilityLabel="Kilogramos por semana"
              />
              <Text className="text-xs text-gray-400 mt-1">
                Recomendado: 0.25-0.75 kg/semana
              </Text>
            </View>
          )}
        </Section>

        {preview && (
          <View className="bg-gray-50 rounded-lg p-4 mb-6">
            <Text className="text-base font-semibold mb-3">Tu plan diario</Text>
            <Row label="Calorías" value={`${preview.dailyKcal} kcal`} bold />
            <Row label="Proteína" value={`${preview.proteinG} g`} />
            <Row label="Carbos" value={`${preview.carbsG} g`} />
            <Row label="Grasa" value={`${preview.fatG} g`} />
            {preview.flooredToMinimum && (
              <Text className="text-xs text-amber-600 mt-2">
                Tu déficit objetivo fue limitado al mínimo seguro para tu sexo.
              </Text>
            )}
            {preview.macrosCapped && (
              <Text className="text-xs text-amber-600 mt-2">
                Tus macros se ajustaron para no exceder la meta diaria de kcal.
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          className={`rounded-lg py-4 items-center ${
            canSubmit ? "bg-black" : "bg-gray-300"
          }`}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel={submitLabel}
          accessibilityState={{ disabled: !canSubmit, busy: submitting }}
        >
          <Text className="text-white font-semibold">
            {submitting ? "Guardando..." : submitLabel}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mb-6">
      <Text className="text-base font-semibold mb-3">{title}</Text>
      {children}
    </View>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  decimals,
  accessibilityLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  decimals?: boolean;
  accessibilityLabel: string;
}) {
  return (
    <TextInput
      className="border border-gray-300 rounded-lg px-4 py-3 text-base"
      keyboardType={decimals ? "decimal-pad" : "number-pad"}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function SegmentButton({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`flex-1 py-3 rounded-lg border ${
        selected ? "border-black bg-black" : "border-gray-300"
      }`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text
        className={`text-center font-medium ${
          selected ? "text-white" : "text-gray-700"
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function SelectCard({
  label,
  sub,
  selected,
  onPress,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      className={`border rounded-lg p-3 mb-2 ${
        selected ? "border-black bg-gray-50" : "border-gray-300"
      }`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <Text className="font-medium">{label}</Text>
      <Text className="text-gray-500 text-xs mt-0.5">{sub}</Text>
    </TouchableOpacity>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View className="flex-row justify-between py-0.5">
      <Text className={`text-gray-700 ${bold ? "font-semibold" : ""}`}>
        {label}
      </Text>
      <Text className={`${bold ? "font-semibold" : "text-gray-700"}`}>
        {value}
      </Text>
    </View>
  );
}
