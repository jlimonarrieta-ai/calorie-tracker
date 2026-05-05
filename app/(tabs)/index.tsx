import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Today() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 px-6 pt-4">
        <Text className="text-2xl font-bold mb-2">Hoy</Text>
        <Text className="text-gray-500">Aquí irá tu registro diario de calorías.</Text>
      </View>
    </SafeAreaView>
  );
}
