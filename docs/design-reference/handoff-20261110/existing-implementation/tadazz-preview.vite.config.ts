import baseConfig from "./vite.config.ts"
import { mergeConfig } from "vite"
import path from "node:path"
import { fileURLToPath } from "node:url"

const dir = path.dirname(fileURLToPath(import.meta.url))

export default mergeConfig(baseConfig, {
  build: {
    outDir: "dist-site-preview",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(dir, "tadazz-preview.html"),
    },
  },
})
