import { createHash } from "node:crypto"
import { readFileSync, lstatSync, realpathSync } from "node:fs"
import { resolve, sep } from "node:path"

const base = JSON.parse(readFileSync("/input/source-manifest.json", "utf8"))
const overlay = JSON.parse(readFileSync("/input-auth/source-manifest.json", "utf8"))
if (base.review_sha !== overlay.base_sha || overlay.review_sha !== process.env.PHONE_REVIEW_SHA) throw Error("Composed SHA mismatch")
const replacements = new Map(overlay.files.map(file => [file.path, file]))
const validate = file => {
  const path = resolve("/work", file.path)
  if (!path.startsWith("/work" + sep) || realpathSync(path) !== path || !lstatSync(path).isFile()) throw Error("Unsafe composed source: " + file.path)
  const bytes = readFileSync(path)
  if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw Error("Changed composed source: " + file.path)
}
for (const file of base.files) validate(replacements.get(file.path) ?? file)
for (const file of overlay.files) validate(file)
for (const [from, to] of [
  ["packages/socket/node_modules/@razzia/extensions", "extensions"],
  ["packages/socket/node_modules/@razzia/common", "packages/common"],
  ["extensions/node_modules/@razzia/common", "packages/common"],
]) if (realpathSync(resolve("/work", from)) !== resolve("/work", to)) throw Error("Stale composed workspace link")
console.log(JSON.stringify({ status: "COMPOSED_INPUTS_VERIFIED", base_sha: base.review_sha,
  overlay_sha: overlay.review_sha, base_files: base.files.length, overlay_files: overlay.files.length,
  source_graph: "/work only; immutable file mounts; no duplicate Registry/account graph" }))
