import { defineConfig } from "vitest/config";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const rnTestingPath = require.resolve("@factoredui/react-native/testing");

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
      "react-native": rnTestingPath,
    },
  },
});
