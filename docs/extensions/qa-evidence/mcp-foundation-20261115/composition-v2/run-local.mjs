import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const overlay = path.join(here, "local-overlay-03")
const root = cp.execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const manifest = JSON.parse(fs.readFileSync(path.join(here, "input-manifest.json")))
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
function check() {
  for (const row of manifest.files) {
    const bytes = fs.readFileSync(path.join(overlay, row.path))
    if (sha(bytes) !== row.sha256) throw new Error("Overlay changed: " + row.path)
    const original = row.source.startsWith("git:")
      ? cp.execFileSync("git", ["show", manifest.DPin + ":" + row.path], { cwd: root })
      : fs.readFileSync(path.join(root, row.path))
    if (sha(original) !== row.sha256) throw new Error("Input changed: " + row.path)
  }
  return { sourceFiles: manifest.files.length, everyOverlayAndOriginalMatches: true }
}
const before = check()
const loader = fs.readFileSync(path.join(overlay, "loader.mjs"), "utf8").replace(
  'return {url:pathToFileURL(path.join(root,"packages/common/src",spec.slice(15)+".ts")).href,shortCircuit:true}',
  '{const base=path.join(root,"packages/common/src",spec.slice(15)); const name=[base+".ts",path.join(base,"index.ts")].find(p=>fs.existsSync(p)); if(!name) throw new Error("Missing real source "+base); return {url:pathToFileURL(name).href,shortCircuit:true}}',
)
const loaderPath = path.join(overlay, "loader-resolved.mjs")
if (!fs.existsSync(loaderPath)) fs.writeFileSync(loaderPath, loader)
else if (fs.readFileSync(loaderPath, "utf8") !== loader) throw new Error("Loader changed")
const command = ["--experimental-strip-types", "--loader", "./loader-resolved.mjs", "--test", "--test-concurrency=1",
  "extensions/src/mcp-app/tests/server/canonical-v2.nodecheck.ts",
  "extensions/src/mcp-app/tests/server/composition-preview-v2.nodecheck.ts"]
const started = new Date().toISOString()
const result = cp.spawnSync(process.execPath, command, { cwd: overlay, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 })
const log = (result.stdout ?? "") + (result.stderr ?? "")
const name = process.argv[2] ?? "functional-02"
if (!/^functional-\d{2}$/.test(name)) throw new Error("Invalid receipt name")
if (fs.existsSync(path.join(here, name + ".json"))) throw new Error("Preserve previous receipt")
fs.writeFileSync(path.join(here, name + ".log"), log)
const packages = Object.fromEntries(["zod", "uuid"].map(name => {
  const bytes = fs.readFileSync(path.join(overlay, "node_modules", name, "package.json"))
  return [name, { version: JSON.parse(bytes).version, packageJsonSha256: sha(bytes) }]
}))
const receipt = { command: [process.execPath, ...command], cwd: overlay, started, ended: new Date().toISOString(),
  exit: result.status, signal: result.signal, error: result.error?.message, before, after: check(), packages,
  inputManifestSha256: sha(fs.readFileSync(path.join(here, "input-manifest.json"))),
  lockSha256: sha(fs.readFileSync(path.join(overlay, "package-lock.json"))),
  loaderSha256: sha(fs.readFileSync(loaderPath)), logSha256: sha(Buffer.from(log)),
  normalFrozenNpmCiScriptsOff: true, parentOrFullPrivateTypecheck: "NOT_RUN", oracleJob: false }
fs.writeFileSync(path.join(here, name + ".json"), JSON.stringify(receipt, null, 2) + "\n")
console.log(log)
process.exitCode = result.status ?? 1
