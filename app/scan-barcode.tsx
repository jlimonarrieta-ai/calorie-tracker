import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getByBarcode } from "../lib/openFoodFacts";
import { usePendingScan } from "../lib/scan";

// Barcode scanner modal. A read resolves against Open Food Facts and hands
// the product back to add-food through the PendingScan context (params can't
// flow backwards through router.back()).
//
// The camera keeps emitting onBarcodeScanned for every frame that contains a
// readable code, so the handler is double-gated: it detaches (undefined)
// outside the "scanning" phase and scannedRef locks re-entry within a frame
// batch until the user explicitly rescans.

type ScanState =
  | { phase: "scanning" }
  | { phase: "looking-up"; code: string }
  | { phase: "not-found"; code: string }
  | { phase: "no-nutrition"; code: string; name: string | null }
  | { phase: "error"; code: string };

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e"] as const;

export default function ScanBarcode() {
  const router = useRouter();
  const { setPending } = usePendingScan();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ phase: "scanning" });
  const scannedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  function closeTo(fallback: () => void) {
    if (router.canGoBack()) router.back();
    else fallback();
  }

  function goManual(name?: string) {
    setPending(name ? { kind: "manual", name } : { kind: "manual" });
    closeTo(() => router.replace("/add-food"));
  }

  async function handleScanned(code: string) {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setState({ phase: "looking-up", code });

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const result = await getByBarcode(code, ctrl.signal);
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if (result.status === "found") {
        setPending({ kind: "item", item: result.item });
        closeTo(() => router.replace("/add-food"));
      } else if (result.status === "no-nutrition") {
        setState({ phase: "no-nutrition", code, name: result.name });
      } else {
        setState({ phase: "not-found", code });
      }
    } catch (e: unknown) {
      if (ctrl.signal.aborted || !mountedRef.current) return;
      if ((e as Error).name === "AbortError") return;
      setState({ phase: "error", code });
    }
  }

  function resetScan() {
    scannedRef.current = false;
    setState({ phase: "scanning" });
  }

  // Permission still resolving.
  if (!permission) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center">
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView className="flex-1 bg-white items-center justify-center px-8">
        <Text className="text-xl font-bold mb-2 text-center">Cámara sin permiso</Text>
        <Text className="text-gray-500 text-center mb-6">
          CalTrack usa la cámara para escanear códigos de barras de alimentos.
        </Text>

        {permission.canAskAgain ? (
          <TouchableOpacity
            className="bg-black rounded-lg px-6 py-4 items-center self-stretch"
            onPress={requestPermission}
            accessibilityRole="button"
            accessibilityLabel="Permitir acceso a la cámara"
          >
            <Text className="text-white font-semibold">Permitir cámara</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            className="bg-black rounded-lg px-6 py-4 items-center self-stretch"
            onPress={() => Linking.openSettings()}
            accessibilityRole="button"
            accessibilityLabel="Abrir Ajustes del sistema"
          >
            <Text className="text-white font-semibold">Abrir Ajustes</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          className="mt-4 items-center"
          onPress={() => goManual()}
          accessibilityRole="button"
          accessibilityLabel="Agregar comida manualmente"
        >
          <Text className="text-gray-600 underline">Agregar manual</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-black">
      {/* CameraView is a native component NativeWind doesn't wrap; the style
          prop is its supported API. */}
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
        onBarcodeScanned={
          state.phase === "scanning" ? (result) => handleScanned(result.data) : undefined
        }
      />

      <View
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
        className="items-center justify-center"
      >
        <View className="w-64 h-40 rounded-2xl border-2 border-white/70" />
      </View>

      <View className="absolute left-0 right-0 bottom-0 bg-white rounded-t-2xl px-6 pt-5 pb-10">
        {state.phase === "scanning" && (
          <Text className="text-gray-700 text-center">
            Apunta al código de barras del producto
          </Text>
        )}

        {state.phase === "looking-up" && (
          <View className="flex-row items-center justify-center">
            <ActivityIndicator />
            <Text className="text-gray-700 ml-3">Buscando {state.code}…</Text>
          </View>
        )}

        {(state.phase === "not-found" ||
          state.phase === "no-nutrition" ||
          state.phase === "error") && (
          <>
            <Text className="font-semibold text-center mb-1">
              {state.phase === "not-found"
                ? "No encontré ese producto."
                : state.phase === "no-nutrition"
                  ? `Encontré ${state.name ?? "el producto"}, pero sin información nutricional.`
                  : "No se pudo buscar el producto. Revisa tu conexión."}
            </Text>
            <Text className="text-gray-400 text-xs text-center mb-4">
              Código {state.code}
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                className="flex-1 border border-gray-300 rounded-lg py-3 items-center"
                onPress={resetScan}
                accessibilityRole="button"
                accessibilityLabel="Escanear otro código"
              >
                <Text className="font-semibold">Escanear otro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                className="flex-1 bg-black rounded-lg py-3 items-center"
                onPress={() =>
                  goManual(state.phase === "no-nutrition" ? state.name ?? undefined : undefined)
                }
                accessibilityRole="button"
                accessibilityLabel="Agregar comida manualmente"
              >
                <Text className="text-white font-semibold">Agregarlo manual</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </View>
  );
}
