import { defineConfig, mergeConfig } from "vite"
import base from "../consolidation/site.vite.config"

export default defineConfig(
  mergeConfig(base, {
    envDir: false,
    cacheDir: "../../extensions/qa/phase2/.results/vite",
  }),
)
