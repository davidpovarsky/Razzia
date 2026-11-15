import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

// Candidate payload only. It neither builds the host nor creates a renderer pin.
// A fresh, explicitly granted output directory and closure audit are required.
export default defineConfig({
  publicDir: false,
  envDir: false,
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"] },
  build: {
    outDir: "dist/show-preview-candidate",
    emptyOutDir: false,
    manifest: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/presentation/show-library-preview/renderer-entry.tsx", import.meta.url)),
      formats: ["es"],
      fileName: "renderer",
    },
  },
})
