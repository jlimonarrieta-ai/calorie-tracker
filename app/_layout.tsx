import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth";
import { ProfileProvider, useProfile } from "../lib/profile";
import "../global.css";

function RootNavigator() {
  const { session, loading } = useAuth();
  const { profile, loading: profileLoading } = useProfile();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === "(auth)";
    const inOnboardingGroup = segments[0] === "(onboarding)";

    if (!session) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }

    // Wait until we know the onboarding state before routing the signed-in user.
    if (profileLoading) return;

    const needsOnboarding = !profile?.onboarded_at;

    if (needsOnboarding && !inOnboardingGroup) {
      router.replace("/(onboarding)");
    } else if (!needsOnboarding && (inAuthGroup || inOnboardingGroup)) {
      router.replace("/(tabs)");
    }
  }, [session, loading, profile, profileLoading, segments]);

  if (loading || (session && profileLoading)) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(onboarding)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="add-food"
        options={{ presentation: "modal", headerShown: true, title: "Agregar comida" }}
      />
      <Stack.Screen
        name="edit-goals"
        options={{ presentation: "modal", headerShown: true, title: "Editar metas" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ProfileProvider>
          <RootNavigator />
          <StatusBar style="auto" />
        </ProfileProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
