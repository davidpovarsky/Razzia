import { fileURLToPath } from "node:url"
import { writeFileSync } from "node:fs"
import { defineConfig } from "vite"
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  envDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"], tsconfigPaths: true },
  cacheDir: "/tmp/native-save-ui-vite",
  plugins: [
    {
      name: "native-save-browser-closure",
      generateBundle() {
        const modules = [...this.getModuleIds()].sort()
        const allowed = [
          "/mcp-app/contracts/native-save.ts",
          "/mcp-app/contracts/schemas.ts",
        ]
        const forbidden = modules.filter(
          (id) =>
            (id.includes("/mcp-app/") &&
              !allowed.some((path) => id.endsWith(path))) ||
            /(?:node:crypto|node:sqlite|oauth-grants|oauth-protocol|creation-port)/u.test(
              id,
            ),
        )
        writeFileSync(
          "/out/native-save-browser-closure.json",
          JSON.stringify({ modules, forbidden }, null, 2),
        )
        if (forbidden.length)
          throw new Error(
            `Unexpected browser authority modules: ${forbidden.join(",")}`,
          )
      },
    },
  ],
  build: {
    outDir: "/out/native-save-ui",
    emptyOutDir: false,
    target: "esnext",
    rolldownOptions: {
      input: fileURLToPath(new URL("./native-save.html", import.meta.url)),
    },
  },
})
