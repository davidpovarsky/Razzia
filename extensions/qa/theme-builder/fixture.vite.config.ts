import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  envDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"], tsconfigPaths: true },
  cacheDir: "/tmp/theme-builder-vite",
  build: { outDir: "/out/ui", emptyOutDir: false, target: "esnext" },
})
