import { Alert, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";

export default function Settings() {
  const router = useRouter();
  const { session } = useAuth();

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Error", error.message);
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-4">
        <Text className="text-2xl font-bold mb-2">Ajustes</Text>
        <Text className="text-gray-500 mb-6">{session?.user.email}</Text>

        <TouchableOpacity
          className="border border-gray-300 rounded-lg py-3 items-center mb-3"
          onPress={() => router.push("/edit-goals")}
          accessibilityRole="button"
          accessibilityLabel="Editar metas de calorías y macros"
        >
          <Text className="font-semibold">Editar metas</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="border border-red-500 rounded-lg py-3 items-center"
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
        >
          <Text className="text-red-500 font-semibold">Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
