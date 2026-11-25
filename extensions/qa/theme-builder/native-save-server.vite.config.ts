import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

export default defineConfig({
  root: "/work/extensions",
  publicDir: false,
  envDir: false,
  resolve: { tsconfigPaths: true },
  ssr: { noExternal: true },
  cacheDir: "/tmp/native-save-server-vite",
  build: {
    ssr: fileURLToPath(new URL("./native-save-server.ts", import.meta.url)),
    outDir: "/out/native-save-server",
    emptyOutDir: false,
    target: "node24",
  },
})
