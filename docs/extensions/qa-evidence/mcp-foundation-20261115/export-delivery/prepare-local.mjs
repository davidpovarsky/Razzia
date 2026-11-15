import fs from "node:fs"
import path from "node:path"
import cp from "node:child_process"
import { createHash } from "node:crypto"
import { fileURLToPath } from "node:url"
const here = path.dirname(fileURLToPath(import.meta.url))
const root = cp.execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim()
const eRoot = "C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-ui-20261115"
const version = process.argv[2] ?? "01"
if (!/^\d{2}$/.test(version)) throw new Error("Invalid snapshot version")
const overlay = path.join(here, "local-overlay-" + version)
if (fs.existsSync(overlay)) throw new Error("Preserve previous snapshot")
fs.mkdirSync(overlay)
const base = JSON.parse(fs.readFileSync(path.join(here,
  "../m3a-source/owner-format-stage/oauth-01/server-receipts/legacy-formatted-input-manifest.json")))
const rows = []
function copy(name, owner) {
  const source = path.join(owner, name), target = path.join(overlay, name)
  const bytes = fs.readFileSync(source)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  rows.push({ path: name, original: source, bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex") })
}
for (const row of base.files) copy(row.path, root)
copy("extensions/src/mcp-app/tests/first-party/oauth-export.nodecheck.ts", root)
copy("extensions/src/mcp-app/first-party/oauth-export.ts", root)
// Normal npm ci is private to this immutable QA-only snapshot. Source dependencies
// and private pnpm lock are unchanged; this does not edit a product importer.
fs.writeFileSync(path.join(overlay, "consent-focused.tsconfig.json"), JSON.stringify({
  extends: "./extensions/src/mcp-app/tsconfig.json",
  include: ["extensions/src/mcp-app/tests/first-party/oauth-export.nodecheck.ts", "extensions/src/mcp-app/tests/first-party/oauth.nodecheck.ts"],
}, null, 2) + "\n")
fs.writeFileSync(path.join(here, version === "01" ? "input-manifest.json" : `input-manifest-${version}.json`), JSON.stringify({
  kind: "REAL_F_EXPORT_DELIVERY_UNCOMMITTED_IMMUTABLE_LOCAL_SNAPSHOT",
  sourceF: cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  candidate: "UNCOMMITTED_F_ONLY_BYTES_PINNED_BY_SHA256", node: process.version,
  noOracleJob: true, noAuthorityOrSchemaShim: true, files: rows,
}, null, 2) + "\n")
console.log(JSON.stringify({ files: rows.length, overlay }))
