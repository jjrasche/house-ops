import { useMemo } from "react";
import { Platform } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuxiProvider } from "@factoredui/react";
import { supabase } from "../src/lib/supabase";
import { createExpoCaptureAdapter } from "../src/auxi/capture-adapter";

export default function RootLayout() {
  const adapter = useMemo(createExpoCaptureAdapter, []);
  const platform = Platform.OS === "ios" ? "ios" as const : "android" as const;

  return (
    <AuxiProvider supabase={supabase} adapter={adapter} platform={platform}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false }} />
      </SafeAreaProvider>
    </AuxiProvider>
  );
}
