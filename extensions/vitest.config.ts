import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@razzia/common": fileURLToPath(
        new URL("../packages/common/src", import.meta.url),
      ),
      "@razzia/extensions": fileURLToPath(new URL("./src", import.meta.url)),
      "@razzia/socket": fileURLToPath(
        new URL("../packages/socket/src", import.meta.url),
      ),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    env: {
      MANAGER_PASSWORD: "test-manager-password",
      GAME_SPEED: "5",
    },
  },
})
