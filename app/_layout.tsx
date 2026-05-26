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

    // Only act on a definitively-fetched profile. If the fetch errored and we
    // never got the row, profile is null — treat that as "unknown" and stay
    // put rather than bouncing to /(onboarding), which both wrongly forces
    // re-onboarding and can fire before the navigator has registered the
    // route after Fast Refresh.
    if (profile == null) return;

    const needsOnboarding = !profile.onboarded_at;

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
      <Stack.Screen
        name="edit-food/[id]"
        options={{ presentation: "modal", headerShown: true, title: "Editar comida" }}
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
