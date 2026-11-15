import { fileURLToPath } from "node:url"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { defineConfig } from "vite"
const baseline = process.env.TADAZZ_BOUNDARY_BASELINE === "1"
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: false,
  envDir: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { dedupe: ["react", "react-dom"], tsconfigPaths: true },
  cacheDir: "/tmp/account-boundary-vite",
  plugins: [
    {
      name: "account-boundary-exact-source",
      enforce: "pre",
      load(id) {
        if (
          baseline &&
          id.endsWith("/components/theme-builder/StudioThemeBuilder.tsx")
        )
          return readFileSync("/input-originalStudio.tsx", "utf8")
      },
      generateBundle() {
        const modules = [...this.getModuleIds()].sort()
        const forbidden = modules.filter((id) =>
          /(?:\/src\/server\/|\/mcp-app\/|node:crypto|node:sqlite|creation-port)/u.test(
            id,
          ),
        )
        const path = baseline
          ? "/input-originalStudio.tsx"
          : "/work/extensions/src/components/theme-builder/StudioThemeBuilder.tsx"
        const body = readFileSync(path)
        writeFileSync(
          `/out/boundary-${baseline ? "baseline" : "fixed"}-closure.json`,
          JSON.stringify(
            {
              modules,
              forbidden,
              studioSource: {
                path,
                bytes: body.length,
                sha256: createHash("sha256").update(body).digest("hex"),
              },
            },
            null,
            2,
          ),
        )
        if (forbidden.length) throw new Error("qa:unexpected-browser-authority")
      },
    },
  ],
  build: {
    outDir: baseline ? "/out/boundary-baseline" : "/out/boundary-fixed",
    emptyOutDir: false,
    target: "esnext",
    rolldownOptions: {
      input: fileURLToPath(new URL("./account-boundary.html", import.meta.url)),
    },
  },
})
