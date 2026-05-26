import { useRouter } from "expo-router";
import { Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalsForm, GoalsFormValues } from "../../components/GoalsForm";
import { useProfile } from "../../lib/profile";

export default function Onboarding() {
  const router = useRouter();
  const { updateProfile, updating } = useProfile();

  async function handleSubmit(values: GoalsFormValues) {
    const signedKpw =
      values.goal === "maintain"
        ? 0
        : values.goal === "lose"
        ? -values.kgPerWeek
        : values.kgPerWeek;

    const ok = await updateProfile({
      sex: values.sex,
      age_years: values.ageYears,
      height_cm: values.heightCm,
      current_weight_kg: values.weightKg,
      activity_level: values.activity,
      target_kg_per_week: signedKpw,
      daily_calorie_goal: values.preview.dailyKcal,
      protein_g_target: values.preview.proteinG,
      carbs_g_target: values.preview.carbsG,
      fat_g_target: values.preview.fatG,
      onboarded_at: new Date().toISOString(),
    });

    if (ok) router.replace("/(tabs)");
    else Alert.alert("Error", "No se pudo guardar tu plan. Intenta de nuevo.");
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <GoalsForm
        intro={{
          title: "Configuremos tu plan",
          subtitle: "Esto define tu meta diaria de calorías y macros.",
        }}
        submitLabel="Empezar"
        submitting={updating}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}
