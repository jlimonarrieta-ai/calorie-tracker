import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "../lib/auth";
import { ProfileProvider, useProfile } from "../lib/profile";
import "../global.css";

// Centralized cancel control for modal screens (add-food, edit-goals, edit-food/[id]).
// Discoverable on both platforms — iOS users no longer rely solely on swipe-down
// and Android users no longer rely solely on the system back button.
// Screens that override options via <Stack.Screen options={{ title }} /> rely on
// the shallow-merge behavior of setOptions to preserve this headerLeft.
function CancelButton() {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => {
        // Fall back to (tabs) when there's no back history (deep link,
        // Fast Refresh, or app relaunch into a modal route). router.back()
        // can no-op in those cases. Same pattern as edit-goals submit.
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)");
      }}
      accessibilityRole="button"
      accessibilityLabel="Cancelar"
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ paddingHorizontal: 8 }}
    >
      <Text style={{ color: "#FF3B30", fontSize: 16 }}>Cancelar</Text>
    </TouchableOpacity>
  );
}

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
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Agregar comida",
          headerLeft: () => <CancelButton />,
        }}
      />
      <Stack.Screen
        name="edit-goals"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Editar metas",
          headerLeft: () => <CancelButton />,
        }}
      />
      <Stack.Screen
        name="edit-food/[id]"
        options={{
          presentation: "modal",
          headerShown: true,
          title: "Editar comida",
          headerLeft: () => <CancelButton />,
        }}
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
