// Build only. No config, environment secret, listener, image or deployment is loaded.
import { createRequire, isBuiltin } from "node:module"
import { createHash } from "node:crypto"
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..")
const require = createRequire(join(root, "packages/socket/package.json"))
const { rolldown } = await import(
  pathToFileURL(require.resolve("rolldown")).href
)
const output =
  process.env.TADAZZ_NATIVE_HOST_DIST_DIR ??
  join(root, "extensions/src/mcp-app/native-host/dist")

if (!isAbsolute(output)) {
  throw Error("Native host build requires an absolute output directory")
}

await mkdir(output, { recursive: true })
const inputs = new Set([
  join(root, "tsconfig.json"),
  fileURLToPath(import.meta.url),
])
const externalModules = new Set()
// The native ws/debug packages already guard these optional performance/color
// helpers with try/catch. Every required module must be bundled or Node built-in.
const optionalNativeHelpers = new Set([
  "supports-color",
  "bufferutil",
  "utf-8-validate",
])
const bundle = await rolldown({
  cwd: root,
  input: join(root, "extensions/src/mcp-app/native-host/production-entry.ts"),
  platform: "node",
  tsconfig: join(root, "tsconfig.json"),
  transform: { define: { "process.env.NODE_ENV": '"production"' } },
  plugins: [
    {
      name: "native-host-physical-input-receipt",
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (isBuiltin(id) || optionalNativeHelpers.has(id)) {
            externalModules.add(id)

            continue
          }

          if (!id.startsWith("\0")) {
            inputs.add(id.split("?")[0])
          }
        }
      },
    },
  ],
})

try {
  await bundle.write({
    file: join(output, "index.cjs"),
    format: "cjs",
    minify: true,
    sourcemap: false,
    codeSplitting: false,
  })
} finally {
  await bundle.close()
}

const files = []
const physicalInputs = [...inputs]
const describe = async (input) => {
  const path = await realpath(input)

  if (!(await stat(path)).isFile()) {
    throw Error("Unexpected native host input")
  }

  const bytes = await readFile(path)

  return {
    path: relative(root, path).replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }
}
for (let index = 0; index < physicalInputs.length; index += 8) {
  const batch = physicalInputs.slice(index, index + 8)
  // oxlint-disable-next-line no-await-in-loop -- Batches of eight bound open descriptors and memory while hashing the actual inputs.
  const described = await Promise.all(batch.map(describe))
  files.push(...described)
}
const code = await readFile(join(output, "index.cjs"))
const receipt = {
  format: "tadazz-native-host-artifact",
  version: 1,
  entry: "extensions/src/mcp-app/native-host/production-entry.ts",
  bundler: "rolldown@1.2.13",
  node: process.version,
  sha256: createHash("sha256").update(code).digest("hex"),
  bytes: code.byteLength,
  files: files.sort((a, b) => a.path.localeCompare(b.path)),
  externalModules: [...externalModules].sort((a, b) => a.localeCompare(b)),
  deploymentPerformed: false,
  previewAcceptance: false,
}
await writeFile(
  join(output, "artifact.json"),
  `${JSON.stringify(receipt, null, 2)}\n`,
)
console.log(
  JSON.stringify({
    artifact: join(output, "index.cjs"),
    sha256: receipt.sha256,
    bytes: receipt.bytes,
    inputFiles: files.length,
    deploymentPerformed: false,
  }),
)
