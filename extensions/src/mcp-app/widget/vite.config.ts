import { defineConfig } from "vite"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { getNativeShowLibrary } from "../../core/show-library/native-library.ts"
import { readFileSync, realpathSync, statSync } from "node:fs"
import { basename, relative } from "node:path"
import { createHash } from "node:crypto"
let entryName = "entry"
const require = createRequire(
  new URL("../../../../packages/web/package.json", import.meta.url),
)
const tailwindModule: unknown = await import(
  pathToFileURL(require.resolve("@tailwindcss/vite")).href
)
const tailwind = (
  tailwindModule as typeof import("../../../../packages/web/node_modules/@tailwindcss/vite/dist/index.mjs")
).default
const root = fileURLToPath(new URL("../../../../", import.meta.url))
const definitions = getNativeShowLibrary().families.map((family) => ({
  ...family.ref,
  rendererId: family.definition.rendererId,
  definitionSha256: family.definitionSha256,
}))

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  root,
  publicDir: false,
  resolve: {
    dedupe: ["react", "react-dom", "zod"],
    alias: [
      { find: "@razzia/web", replacement: `${root}packages/web/src` },
      { find: "@razzia/common", replacement: `${root}packages/common/src` },
      { find: "@razzia/extensions", replacement: `${root}extensions/src` },
    ],
  },
  plugins: [
    {
      name: "widget-photo-card-native-import-boundary",
      enforce: "pre",
      resolveId(id, importer) {
        const normalized = (value: string) => value.replaceAll("\\", "/")
        const original = normalized(
          fileURLToPath(
            new URL(
              "../../../../packages/web/src/features/game/components/PhotoCardGrid.tsx",
              import.meta.url,
            ),
          ),
        )
        const barrel = normalized(
          fileURLToPath(new URL("../../presentation", import.meta.url)),
        )

        // Vite's existing alias can expand this exact source specifier before
        // the pre-resolver runs. Both forms refer to the same native barrel.
        if (
          importer &&
          normalized(importer.split("?")[0]) === original &&
          realpathSync(importer.split("?")[0]) === realpathSync(original) &&
          (id === "@razzia/extensions/presentation" ||
            normalized(id) === barrel)
        ) {
          return fileURLToPath(
            new URL("./native-photo-card-port.ts", import.meta.url),
          )
        }

        // Native constants.ts re-exports labels but also eagerly imports all game rooms.
        // Preserve the exact original labels through their side-effect-free leaf.
        const constants = normalized(
          fileURLToPath(
            new URL(
              "../../../../packages/web/src/features/game/utils/constants",
              import.meta.url,
            ),
          ),
        )

        if (
          importer &&
          normalized(importer.split("?")[0]) === original &&
          realpathSync(importer.split("?")[0]) === realpathSync(original) &&
          (id === "@razzia/web/features/game/utils/constants" ||
            normalized(id) === constants)
        ) {
          return fileURLToPath(
            new URL(
              "../../../../packages/web/src/features/game/utils/answer-style.ts",
              import.meta.url,
            ),
          )
        }

        return null
      },
    },
    {
      name: "widget-physical-input-receipt",
      configResolved(config) {
        if (config.build.lib && typeof config.build.lib.entry === "string") {
          entryName = basename(config.build.lib.entry, ".tsx")
        }
      },
      generateBundle() {
        const files = new Map<
          string,
          { path: string; sha256: string; bytes: number }
        >()
        for (const id of this.getModuleIds()) {
          if (id.startsWith("\0")) {
            continue
          }

          try {
            const path = realpathSync(id.split("?")[0])

            if (!statSync(path).isFile() || files.has(path)) {
              continue
            }

            const bytes = readFileSync(path)
            files.set(path, {
              path: relative(root, path).replaceAll("\\", "/"),
              sha256: createHash("sha256").update(bytes).digest("hex"),
              bytes: bytes.length,
            })
          } catch {
            /* Virtual module has no physical input */
          }
        }
        this.emitFile({
          type: "asset",
          fileName: `${entryName}-inputs.json`,
          source: JSON.stringify(
            {
              peerPin: "b49e847e79fa01ba45fb9b0b5551b77433a03205",
              peerConsumerSha256:
                "cab386194644a7185ff67b092af76b8a8bad4169398104f1daa4996a62b83318",
              files: [...files.values()].sort((a, b) =>
                a.path.localeCompare(b.path),
              ),
            },
            null,
            2,
          ),
        })
      },
    },
    tailwind(),
    {
      name: "bundled-native-definition-digests",
      resolveId(id) {
        return id === "virtual:tadazz-native-v2-definitions" ? `\0${id}` : null
      },
      load(id) {
        return id === "\0virtual:tadazz-native-v2-definitions"
          ? `export const builtDefinitions=${JSON.stringify(definitions)}`
          : null
      },
    },
  ],
  build: {
    outDir: "extensions/src/mcp-app/widget/dist",
    emptyOutDir: false,
    minify: true,
    lib: {
      entry: fileURLToPath(new URL("./entry.tsx", import.meta.url)),
      name: "TadazzWidget",
      formats: ["iife"],
      fileName: () => "widget.js",
      cssFileName: "widget",
    },
  },
})
