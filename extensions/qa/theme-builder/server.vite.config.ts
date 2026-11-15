import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
export default defineConfig({
  root: "/work/extensions",
  publicDir: false,
  envDir: false,
  resolve: { tsconfigPaths: true },
  ssr: { noExternal: true },
  cacheDir: "/tmp/theme-builder-server-vite",
  build: {
    ssr: fileURLToPath(new URL("./server.ts", import.meta.url)),
    outDir: "/out/server",
    emptyOutDir: false,
    target: "node24",
  },
})
