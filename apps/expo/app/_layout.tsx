import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider } from "@factoredui/react";
import type { CaptureAdapter } from "@factoredui/core";
import { createSupabaseStore } from "@factoredui/adapter-supabase";
import { createRnAdapter } from "@factoredui/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../src/lib/supabase";

const store = createSupabaseStore(supabase);
const platform = Platform.OS === "ios" ? "ios" as const : "android" as const;

export default function RootLayout() {
  const [adapter, setAdapter] = useState<CaptureAdapter | null>(null);

  useEffect(() => {
    createRnAdapter(AsyncStorage).then(setAdapter);
  }, []);

  if (!adapter) return null;

  return (
    <Provider store={store} adapter={adapter} platform={platform}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </Provider>
  );
}
