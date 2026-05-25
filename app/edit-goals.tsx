import { Stack, useRouter } from "expo-router";
import { Alert, ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { GoalsForm, GoalsFormValues } from "../components/GoalsForm";
import { useAuth } from "../lib/auth";
import { useProfile } from "../lib/hooks/useProfile";

export default function EditGoals() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { profile, loading, updateProfile, updating } = useProfile(userId);

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
    });

    if (ok) router.back();
    else Alert.alert("Error", "No se pudo actualizar tu plan. Intenta de nuevo.");
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-white">
        <Stack.Screen options={{ title: "Editar metas" }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <Stack.Screen options={{ title: "Editar metas" }} />
      <GoalsForm
        initial={{
          sex: profile?.sex,
          ageYears: profile?.age_years,
          heightCm: profile?.height_cm,
          weightKg: profile?.current_weight_kg,
          activity: profile?.activity_level,
          targetKgPerWeek: profile?.target_kg_per_week,
        }}
        submitLabel="Guardar cambios"
        submitting={updating}
        onSubmit={handleSubmit}
      />
    </SafeAreaView>
  );
}
