import { fileURLToPath } from "node:url"
import { defineConfig, mergeConfig } from "vitest/config"
import original from "../../../../../extensions/vitest.config.ts"

const config = mergeConfig(original, defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
  },
}))
config.test!.include = [fileURLToPath(new URL("./tenant-startup.witness.ts", import.meta.url)).replaceAll("\\", "/")]
export default config
