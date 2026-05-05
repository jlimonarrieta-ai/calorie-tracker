import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function History() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-4">
        <Text className="text-2xl font-bold mb-2">Historial</Text>
        <Text className="text-gray-500">Gráficas y resumen por semana/mes.</Text>
      </View>
    </SafeAreaView>
  );
}
