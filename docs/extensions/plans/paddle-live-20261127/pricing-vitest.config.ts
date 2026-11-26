import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const root = fileURLToPath(new URL("../../../../", import.meta.url))

export default defineConfig({
  root: `${root}extensions`,
  cacheDir: `${root}docs/extensions/plans/paddle-live-20261127/evidence/vite-cache`,
  resolve: {
    alias: {
      "@razzia/common": `${root}packages/common/src`,
      "@razzia/extensions": `${root}extensions/src`,
      "@razzia/web": `${root}packages/web/src`,
      "@razzia/socket": `${root}packages/socket/src`,
    },
  },
  test: {
    include: [
      "src/server/billing/**/*.test.ts",
      "src/core/billing/**/*.test.ts",
    ],
    testTimeout: 30000,
    env: { MANAGER_PASSWORD: "synthetic-test-only", GAME_SPEED: "5" },
  },
})
