import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/firebase-rules.integration.ts", "tests/firebase-connection.integration.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 20_000,
  },
});
