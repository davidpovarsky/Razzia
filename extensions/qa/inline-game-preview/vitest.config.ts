import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"
import extensions from "../../vitest.config"

export default defineConfig({
  ...extensions,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  cacheDir: fileURLToPath(new URL("./.cache", import.meta.url)),
  test: {
    ...extensions.test,
    include: ["src/site/tests/inline-game-preview-*.test.ts"],
    maxWorkers: 1,
  },
})
