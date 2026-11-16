import { build } from "esbuild"
import { createRequire } from "node:module"
import { readFile, writeFile, mkdtemp, copyFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import assert from "node:assert/strict"

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Tadazz server isolated QA only")
}

const root = fileURLToPath(new URL("../../../", import.meta.url))
const manifest = JSON.parse(
  await readFile(
    path.join(
      root,
      "extensions/src/core/show-library/application-preview-build.json",
    ),
    "utf8",
  ),
)
assert.equal(manifest.available, true)
const directory = await mkdtemp(path.join(tmpdir(), "tadazz-phase2-cjs-"))
const output = path.join(directory, "runtime.cjs")
await build({
  absWorkingDir: root,
  entryPoints: ["extensions/src/server/api/application-preview-runtime.ts"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  logLevel: "silent",
})
const require = createRequire(import.meta.url)
const { readApplicationPreviewRuntime } = require(output)
process.env.TADAZZ_APPLICATION_PREVIEW_DIR = directory
for (const item of manifest.files) {
  const packaged = path.join(
    root,
    "packages/web/dist/tadazz-application-runtime",
    item.name,
  )
  const original = await readFile(
    path.join(root, "extensions/dist/application-preview", item.name),
  )
  assert.deepEqual(
    await readFile(packaged),
    original,
    "Packaged bytes must match the admitted artifact",
  )
  await copyFile(packaged, path.join(directory, item.name))
  const actual = readApplicationPreviewRuntime(item.sha256, item.name)
  assert.deepEqual(actual?.bytes, original)
  assert.match(
    actual.type,
    item.name.endsWith("css") ? /^text\/css/u : /^text\/javascript/u,
  )
  assert.equal(readApplicationPreviewRuntime("0".repeat(64), item.name), null)
  await writeFile(path.join(directory, item.name), "corrupted QA artifact")
  assert.equal(readApplicationPreviewRuntime(item.sha256, item.name), null)
}
assert.equal(
  readApplicationPreviewRuntime(manifest.files[0].sha256, "../renderer.mjs"),
  null,
)
console.log(
  JSON.stringify({
    format: "tadazz-phase2-cjs-package-probe",
    admittedFiles: manifest.files.map(({ name, bytes, sha256 }) => ({
      name,
      bytes,
      sha256,
    })),
    packagedBytesEqual: true,
    cjsLoader: true,
    invalidHashAndCorruptionDenied: true,
    traversalDenied: true,
  }),
)
