import { defineConfig, type Plugin } from "vite"
import { fileURLToPath } from "node:url"

// A separate local development artifact, never an application/public QA route.
const localOnly: Plugin = {
  name: "tadazz-catalog-local-only",
  configResolved(config) {
    for (const host of [config.server.host, config.preview.host]) {
      if (host !== "127.0.0.1") {
        throw new Error("Catalog must bind to loopback only")
      }
    }
  },
}

export default defineConfig({
  root: fileURLToPath(new URL("./src/platform-ui/catalog", import.meta.url)),
  envDir: false,
  publicDir: false,
  plugins: [localOnly],
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"] },
  server: { host: "127.0.0.1", port: 4340, strictPort: true },
  preview: { host: "127.0.0.1", port: 4340, strictPort: true },
  build: {
    outDir: fileURLToPath(new URL("./dist/platform-catalog", import.meta.url)),
    emptyOutDir: true,
    sourcemap: false,
  },
})
