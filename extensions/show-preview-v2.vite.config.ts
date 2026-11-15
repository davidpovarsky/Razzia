import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { pathToFileURL } from "node:url"
import base from "./show-preview.vite.config.ts"
const require = createRequire(
  new URL("../packages/web/package.json", import.meta.url),
)
const tailwindcss = (
  await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href)
).default

// The host-only prebuild calculates these canonical definition digests from the
// same parsed source manifests included in this build. No hashing enters payload.
const definitions = JSON.parse(
  readFileSync("/out/native-v2-built-definitions.json", "utf8"),
)
if (
  !Array.isArray(definitions) ||
  definitions.length !== 2 ||
  definitions.some((entry) => !/^[a-f0-9]{64}$/u.test(entry.definitionSha256))
)
  throw new Error("show-preview:missing-built-native-definitions")

export default {
  ...base,
  resolve: {
    ...base.resolve,
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    {
      name: "exact-built-native-definitions-v2",
      resolveId(id: string) {
        return id === "virtual:tadazz-native-v2-definitions" ? `\0${id}` : null
      },
      load(id: string) {
        return id === "\0virtual:tadazz-native-v2-definitions"
          ? `export const builtDefinitions = ${JSON.stringify(definitions)}`
          : null
      },
    },
  ],
  build: {
    ...base.build,
    outDir: "dist/show-preview-v2-candidate",
    lib: {
      ...base.build?.lib,
      entry: fileURLToPath(
        new URL(
          "./src/presentation/show-library-preview/renderer-entry-v2.tsx",
          import.meta.url,
        ),
      ),
      formats: ["es"],
      fileName: "renderer-v2",
      cssFileName: "renderer-v2",
    },
  },
}
