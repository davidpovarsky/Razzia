import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const version = process.argv[3] ?? "01"
if (!/^\d{2}$/.test(version)) throw new Error("Invalid snapshot version")
const overlay = path.join(here, "local-overlay-" + version)
const moduleRoot = path.join(overlay, "extensions/src/mcp-app")
const manifestPath = path.join(here, version === "01" ? "input-manifest.json" : `input-manifest-${version}.json`)
const manifest = JSON.parse(fs.readFileSync(manifestPath))
const hash = bytes => createHash("sha256").update(bytes).digest("hex")
function check() {
  const changed = []
  for (const row of manifest.files) {
    if (hash(fs.readFileSync(path.join(overlay, row.path))) !== row.sha256) changed.push("snapshot:" + row.path)
    if (hash(fs.readFileSync(row.original)) !== row.sha256) changed.push("original:" + row.path)
  }
  return { sourceFiles: manifest.files.length, changed, allMatch: changed.length === 0 }
}
const modules = path.join(moduleRoot, "node_modules")
const rootModules = path.join(overlay, "node_modules")
if (!fs.existsSync(rootModules)) fs.symlinkSync(modules, rootModules, "junction")
if (fs.realpathSync(rootModules) !== fs.realpathSync(modules)) throw new Error("Foreign module junction")
const env = { ...process.env, NODE_OPTIONS: "", NODE_PATH: "", TSX_TSCONFIG_PATH: path.join(moduleRoot, "tsconfig.json") }
for (const key of ["JWT_SECRET", "CONFIG_PATH", "TADAZZ_ACCOUNTS_ENABLED"]) delete env[key]
const name = process.argv[2] ?? "boundary-01"
if (!/^boundary-\d{2}$/.test(name) || fs.existsSync(path.join(here, name + ".json"))) throw new Error("Preserve receipt")
const before = check()
if (!before.allMatch) throw new Error(JSON.stringify(before))
const commands = [
  ["focused-types", [path.join(modules, "typescript/lib/tsc.js"), "--noEmit", "-p", path.join(overlay, "consent-focused.tsconfig.json")]],
  ["exports", ["--import", "tsx", "--test", "--test-concurrency=1", "tests/first-party/oauth-export.nodecheck.ts"]],
  ["oauth-regression", ["--import", "tsx", "--test", "--test-concurrency=1", "--test-name-pattern=discovery and JWKS|exact client/redirect|consent requires|wrong PKCE|refresh rotates|client revocation|real OAuth HTTP|hostile headers", "tests/first-party/oauth.nodecheck.ts"]],
]
const runs = []
for (const [phase, args] of commands) {
  const started = new Date().toISOString()
  const result = cp.spawnSync(process.execPath, args, { cwd: moduleRoot, env, encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 60000 })
  const log = (result.stdout ?? "") + (result.stderr ?? "")
  fs.writeFileSync(path.join(here, name + "-" + phase + ".log"), log)
  runs.push({ phase, command: [process.execPath, ...args], cwd: moduleRoot, started, ended: new Date().toISOString(),
    exit: result.status, signal: result.signal, error: result.error?.message, logSha256: hash(Buffer.from(log)) })
  console.log(JSON.stringify(runs.at(-1)), log)
}
const declared = JSON.parse(fs.readFileSync(path.join(moduleRoot, "package.json")))
const packages = Object.fromEntries(Object.keys({ ...declared.dependencies, ...declared.devDependencies }).map(name => {
  const bytes = fs.readFileSync(path.join(modules, name, "package.json"))
  return [name, { version: JSON.parse(bytes).version, packageJsonSha256: hash(bytes) }]
}))
const after = check()
fs.writeFileSync(path.join(here, name + ".json"), JSON.stringify({
  before, after, runs, packages, node: process.version,
  inputManifestSha256: hash(fs.readFileSync(manifestPath)),
  npmLockSha256: hash(fs.readFileSync(path.join(moduleRoot, "package-lock.json"))),
  privatePnpmLockSha256: hash(fs.readFileSync(path.join(moduleRoot, "pnpm-lock.yaml"))),
  normalFrozenQaNpmCiScriptsOff: true, sameRootPnpmGraphClaimed: false, oracleJob: false,
  actualBrowserClick: false, actualTlsOrPrivateHostInstallation: false,
}, null, 2) + "\n")
process.exitCode = after.allMatch && runs.every(run => run.exit === 0) ? 0 : 1
