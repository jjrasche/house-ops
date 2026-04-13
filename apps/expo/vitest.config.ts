import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/factoredui/__tests__/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: [/@factoredui\//],
      },
    },
  },
  resolve: {
    alias: {
      "react-native": "react-native-web",
    },
  },
});
