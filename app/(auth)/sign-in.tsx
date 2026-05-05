import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert("Falta información", "Email y contraseña son requeridos");
      return;
    }
    setBusy(true);
    const { error } =
      mode === "signIn"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) Alert.alert("Error", error.message);
    else if (mode === "signUp") {
      Alert.alert("Revisa tu correo", "Te enviamos un email para confirmar tu cuenta.");
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-1 justify-center px-6">
          <Text className="text-3xl font-bold mb-2">CalTrack</Text>
          <Text className="text-base text-gray-500 mb-8">
            {mode === "signIn" ? "Inicia sesión" : "Crea tu cuenta"}
          </Text>

          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-3"
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            className="border border-gray-300 rounded-lg px-4 py-3 mb-6"
            placeholder="Contraseña"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          <TouchableOpacity
            className="bg-black rounded-lg py-4 items-center"
            onPress={handleSubmit}
            disabled={busy}
          >
            <Text className="text-white font-semibold">
              {busy ? "..." : mode === "signIn" ? "Entrar" : "Crear cuenta"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            className="mt-4 items-center"
            onPress={() => setMode(mode === "signIn" ? "signUp" : "signIn")}
          >
            <Text className="text-gray-600">
              {mode === "signIn" ? "¿No tienes cuenta? Crear una" : "¿Ya tienes cuenta? Entrar"}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
