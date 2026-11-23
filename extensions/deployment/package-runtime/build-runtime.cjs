// Run inside the pinned worker image, with only /input/source-manifest.json
// mounted read-only and an empty task-owned /output directory writable.
// This compiles trusted platform code; no customer source or credential is input.
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { createRequire } = require("node:module")

const req = createRequire("/cleanup/packages/web/package.json")
const tool = createRequire(req.resolve("vite"))
const esbuild = tool("esbuild")
const manifest = JSON.parse(
  fs.readFileSync("/input/source-manifest.json", "utf8"),
)

if (esbuild.version !== "0.28.2") {
  throw new Error("COMPILER_PIN")
}

;(async () => {
  const result = await esbuild.build({
    entryPoints: ["/cleanup/extensions/qa/package-runtime-server.ts"],
    absWorkingDir: "/cleanup",
    outfile: "/output/runtime.mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    write: false,
    metafile: true,
    minify: false,
    banner: {
      js: 'import { createRequire as __tadazzCreateRequire } from "node:module"; const require = __tadazzCreateRequire(import.meta.url);',
    },
  })

  if (result.warnings.length) {
    throw new Error("COMPILER_WARNINGS")
  }

  const bytes = result.outputFiles.find(
    (file) => file.path === "/output/runtime.mjs",
  ).contents
  fs.writeFileSync("/output/runtime.mjs", bytes)

  const sourceInputs = {}
  const dependencyInputs = {}
  for (const input of Object.keys(result.metafile.inputs)) {
    const absolute = path.resolve("/cleanup", input)
    const relative = path
      .relative("/cleanup", absolute)
      .split(path.sep)
      .join("/")
    const digest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(absolute))
      .digest("hex")

    if (relative.includes("node_modules/")) {
      dependencyInputs[relative] = digest
    } else {
      if (manifest.files[relative] !== digest) {
        throw new Error("UNPINNED_SOURCE:" + relative)
      }

      sourceInputs[relative] = digest
    }
  }
  const proof = {
    sourceRevision: manifest.appRevision,
    workerSourceRevision: manifest.revision,
    compiler: "esbuild@" + esbuild.version,
    sourceInputs,
    dependencyInputs,
    runtimeSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  }
  fs.writeFileSync(
    "/output/runtime-source-manifest.json",
    JSON.stringify(proof),
  )
  console.log(
    JSON.stringify({
      runtimeBytes: bytes.length,
      sourceInputs: Object.keys(sourceInputs).length,
      dependencyInputs: Object.keys(dependencyInputs).length,
      runtimeSha256: proof.runtimeSha256,
    }),
  )
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
