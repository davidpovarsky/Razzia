import { build } from "esbuild"
import { build as buildStyles } from "vite"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import { readFile, mkdir, writeFile, stat, readdir } from "node:fs/promises"
import { fileURLToPath, pathToFileURL } from "node:url"
import path from "node:path"
const args = process.argv.slice(2)

if (args.length > 1 || (args.length === 1 && args[0] !== "--verify-manifest")) {
  throw new Error(
    "Use no arguments to generate pins or --verify-manifest to reproduce committed pins",
  )
}

const verifyManifest = args[0] === "--verify-manifest"
const root = fileURLToPath(new URL("../../", import.meta.url))
const directory = path.join(root, "extensions/dist/application-preview")
const manifestPath = path.join(
  root,
  "extensions/src/core/show-library/application-preview-build.json",
)
const previousManifest = await readFile(manifestPath)

if (
  verifyManifest &&
  JSON.parse(previousManifest.toString("utf8")).available !== true
) {
  throw new Error(
    "Committed native preview manifest must already be built before verification",
  )
}

await mkdir(directory, { recursive: true })
const result = await build({
  absWorkingDir: root,
  entryPoints: [
    "extensions/src/presentation/show-library-preview/application-runtime-entry.tsx",
  ],
  outfile: path.join(directory, "renderer.mjs"),
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  metafile: true,
  legalComments: "eof",
  tsconfig: path.join(root, "extensions/tsconfig.json"),
  define: { "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff2": "dataurl",
    ".woff": "dataurl",
    ".png": "dataurl",
    ".webp": "dataurl",
  },
  plugins: [
    {
      name: "existing-native-public-resources",
      setup(bundler) {
        bundler.onResolve(
          { filter: /^\/(tadazz-show|sounds)\// },
          (resolveArgs) => ({
            path: resolveArgs.path,
            external: true,
          }),
        )
        bundler.onResolve(
          { filter: /^@razzia\/extensions\/presentation$/ },
          () => ({
            path: path.join(
              root,
              "extensions/src/presentation/show-library-preview/native-presentation-bridge.ts",
            ),
          }),
        )
        bundler.onResolve(
          { filter: /^@razzia\/web\/features\/game\/utils\/constants$/ },
          () => ({
            path: path.join(
              root,
              "packages/web/src/features/game/utils/answer-style.ts",
            ),
          }),
        )
        bundler.onLoad(
          {
            filter:
              /[\\/]features[\\/]game[\\/]contexts[\\/](socket-context|extension-state-context)\.tsx?$/,
          },
          () => ({
            errors: [
              {
                text: "A private application preview cannot import live room contexts",
              },
            ],
          }),
        )
      },
    },
  ],
})
const authorityInputs = Object.keys(result.metafile.inputs).filter((name) =>
  /packages\/web\/src\/features\/game\/(?:stores|contexts)\//u.test(
    name.replaceAll("\\", "/"),
  ),
)

if (authorityInputs.length) {
  throw new Error(
    `A private preview cannot import game authority: ${authorityInputs.join(", ")}`,
  )
}

// ScenePresenter and original Razzia components share the existing application's
// Tailwind utilities. Compile those exact styles into the isolated ShadowRoot.
const web = path.join(root, "packages/web")
const requireWeb = createRequire(path.join(web, "package.json"))
const { default: tailwind } = await import(
  pathToFileURL(requireWeb.resolve("@tailwindcss/vite")).href
)
const styleInputs = new Set([path.join(web, "src/index.css")])
const styleBundle = await buildStyles({
  configFile: false,
  envDir: false,
  root: web,
  publicDir: false,
  logLevel: "warn",
  plugins: [
    tailwind(),
    {
      name: "native-preview-style-evidence",
      buildEnd() {
        for (const id of this.getModuleIds()) {
          const [name] = id.split("?")

          if (path.isAbsolute(name) && !name.includes("\0")) {
            styleInputs.add(name)
          }
        }
      },
    },
  ],
  build: {
    outDir: path.join(directory, "styles"),
    write: false,
    emptyOutDir: false,
    cssCodeSplit: true,
    assetsInlineLimit: 0,
    rolldownOptions: { input: path.join(web, "src/index.css") },
  },
})
const styleOutputs = (Array.isArray(styleBundle) ? styleBundle : [styleBundle])
  .flatMap((bundle) => bundle.output)
  .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))

if (styleOutputs.length !== 1) {
  throw new Error("Expected one original native stylesheet")
}

await writeFile(
  path.join(directory, "renderer.css"),
  Buffer.concat([
    Buffer.from(styleOutputs[0].source),
    await readFile(path.join(directory, "renderer.css")),
  ]),
)
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
async function collectStyleSources(sourceDirectory) {
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const filename = path.join(sourceDirectory, entry.name)

    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      await collectStyleSources(filename)
    } else if (
      entry.isFile() &&
      /\.(?:css|[cm]?[jt]sx?|html|svg)$/u.test(entry.name)
    ) {
      styleInputs.add(filename)
    }
  }
}
await collectStyleSources(path.join(web, "src"))
await collectStyleSources(path.join(root, "extensions/src"))
const files = await Promise.all(
  ["renderer.mjs", "renderer.css"].map(async (name) => {
    const bytes = await readFile(path.join(directory, name))

    return { name, bytes: bytes.length, sha256: hash(bytes) }
  }),
)
const styleFiles = (
  await Promise.all(
    [...styleInputs].map(async (name) => {
      const relative = path.relative(root, name)

      if (
        relative.startsWith("..") ||
        !/\.(?:css|[cm]?[jt]sx?|html|svg)$/u.test(name)
      ) {
        return null
      }

      try {
        return (await stat(name)).isFile() ? relative : null
      } catch {
        return null
      }
    }),
  )
).filter(Boolean)
const inputPaths = new Set([
  ...Object.keys(result.metafile.inputs),
  ...styleFiles,
])
const source = await Promise.all(
  [...inputPaths]
    .sort((a, b) => a.localeCompare(b))
    .map(async (name) => ({
      path: name.replaceAll("\\", "/"),
      sha256: hash(await readFile(path.resolve(root, name))),
    })),
)

if (
  source.some(
    (entry) =>
      entry.path ===
      "extensions/src/core/show-library/application-preview-build.json",
  )
) {
  throw new Error(
    "Native renderer imported its generated admission manifest; resolve the actual source cycle",
  )
}

const sourceThemes = await Promise.all(
  ["classic", "razzia"].map(async (name) =>
    JSON.parse(
      await readFile(
        path.join(
          root,
          `extensions/src/core/show-themes/${name}.manifest.json`,
        ),
        "utf8",
      ),
    ),
  ),
)
const registry = {
  id: "tadazz-native-application",
  version: "1.0.0",
  librarySourceSha256: hash(
    await readFile(
      path.join(
        root,
        "extensions/src/core/show-library/application-library.ts",
      ),
    ),
  ),
  sourceThemes,
}
const resources = await Promise.all(
  sourceThemes
    .flatMap((theme) => theme.assets)
    .map(async (asset) => {
      if (
        !asset.url.startsWith("/tadazz-show/") &&
        !asset.url.startsWith("/sounds/")
      ) {
        throw new Error("Unexpected intrinsic resource")
      }

      const bytes = await readFile(
        path.join(root, "packages/web/public", asset.url.slice(1)),
      )

      if (bytes.length !== asset.bytes || hash(bytes) !== asset.sha256) {
        throw new Error(`Native resource changed: ${asset.id}`)
      }

      return {
        url: asset.url,
        bytes: bytes.length,
        sha256: asset.sha256,
        rights: asset.rights,
        provenance: asset.provenance,
      }
    }),
)
const artifact = {
  format: "tadazz-first-party-application-renderer",
  files,
  source,
  resources,
  toolchain: {
    node: process.version,
    lockfileSha256: hash(await readFile(path.join(root, "pnpm-lock.yaml"))),
    buildScriptSha256: hash(await readFile(fileURLToPath(import.meta.url))),
  },
}
const output = {
  format: "tadazz-application-preview-build",
  available: true,
  files,
  pins: sourceThemes.map((theme) => ({
    portVersion: 3,
    identityRuleVersion: 2,
    registry: { id: registry.id, version: registry.version },
    registrySha256: hash(JSON.stringify(registry)),
    renderer: { id: theme.rendererId, version: "1.0.0" },
    rendererBuildSha256: hash(JSON.stringify(artifact)),
  })),
}
await writeFile(
  path.join(directory, "artifact.json"),
  JSON.stringify(artifact, null, 2),
)
await writeFile(
  path.join(directory, "registry.json"),
  JSON.stringify(registry, null, 2),
)
const manifestBytes = Buffer.from(`${JSON.stringify(output, null, 2)}\n`)

if (verifyManifest) {
  if (!previousManifest.equals(manifestBytes)) {
    throw new Error(
      "Native preview build does not reproduce the committed manifest",
    )
  }

  if (!(await readFile(manifestPath)).equals(previousManifest)) {
    throw new Error("Native preview manifest changed during verification")
  }
} else {
  await writeFile(manifestPath, manifestBytes)
}

const verification = {
  format: "tadazz-application-preview-verification",
  mode: verifyManifest ? "verify-manifest" : "generate-manifest",
  verifiedManifest: verifyManifest,
  manifestSha256: hash(manifestBytes),
  artifactSha256: hash(await readFile(path.join(directory, "artifact.json"))),
  registrySha256: hash(await readFile(path.join(directory, "registry.json"))),
  files,
  inputFiles: source.length,
  generatedSourceChanged: !previousManifest.equals(manifestBytes),
  liveAuthorityInputs: authorityInputs,
  productionChanged: false,
}
await writeFile(
  path.join(directory, "verification.json"),
  `${JSON.stringify(verification, null, 2)}\n`,
)
console.log(JSON.stringify({ ...output, verification }, null, 2))
