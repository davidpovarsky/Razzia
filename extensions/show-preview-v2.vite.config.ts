import { fileURLToPath, pathToFileURL } from "node:url"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

import base from "./show-preview.vite.config.ts"
function isDefaultFactory(value: unknown): value is { default: () => unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "default" in value &&
    typeof value.default === "function"
  )
}

function requireDefaultFactory(value: unknown): () => unknown {
  if (!isDefaultFactory(value)) {
    throw new Error("show-preview:missing-tailwind-factory")
  }

  return value.default
}

function hasDefinitionDigest(
  value: unknown,
): value is { definitionSha256: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "definitionSha256" in value &&
    typeof value.definitionSha256 === "string" &&
    /^[a-f0-9]{64}$/u.test(value.definitionSha256)
  )
}

const require = createRequire(
  new URL("../packages/web/package.json", import.meta.url),
)
const tailwindcss = requireDefaultFactory(
  await import(pathToFileURL(require.resolve("@tailwindcss/vite")).href),
)

// The host-only prebuild calculates these canonical definition digests from the
// same parsed source manifests included in this build. No hashing enters payload.
const definitions: unknown = JSON.parse(
  readFileSync("/out/native-v2-built-definitions.json", "utf8"),
)

if (
  !Array.isArray(definitions) ||
  definitions.length !== 2 ||
  definitions.some((entry: unknown) => !hasDefinitionDigest(entry))
) {
  throw new Error("show-preview:missing-built-native-definitions")
}

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
