import { createHash } from "node:crypto"
import { readFileSync, lstatSync, realpathSync } from "node:fs"
import { resolve, sep } from "node:path"

const base = JSON.parse(readFileSync("/input/source-manifest.json", "utf8"))
const overlay = JSON.parse(readFileSync("/input-auth/source-manifest.json", "utf8"))
if (base.review_sha !== overlay.base_sha || overlay.review_sha !== process.env.PHONE_REVIEW_SHA) throw Error("Composed SHA mismatch")
const replacements = new Map(overlay.files.map(file => [file.path, file]))
const validate = (root, file, symlink = false) => {
  const path = resolve(root, file.path)
  if (!path.startsWith(root + sep) || (!symlink && realpathSync(path) !== path)) throw Error("Unsafe composed source: " + file.path)
  const bytes = readFileSync(path)
  if (bytes.length !== file.bytes || createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw Error("Changed composed source: " + file.path)
}
for (const file of base.files) validate("/base", file)
for (const file of overlay.files) {
  validate("/delta", file)
  if (file.path.startsWith("packages/socket/") || file.path === "extensions/src/server/index.ts") validate("/work", file, true)
}
if (realpathSync("/work/extensions/src/server/phone-lifecycle-v2/native-adoption.ts") !==
  realpathSync("/delta/extensions/src/server/phone-lifecycle-v2/native-adoption.ts")) throw Error("Split native fence module")
if (realpathSync("/work/extensions/src/server/index.ts") !== "/delta/extensions/src/server/index.ts") throw Error("Stale server barrel")
for (const [from, to] of [
  ["packages/socket/node_modules/@razzia/extensions", "extensions"],
  ["packages/socket/node_modules/@razzia/common", "packages/common"],
  ["extensions/node_modules/@razzia/common", "packages/common"],
]) if (realpathSync(resolve("/work", from)) !== resolve("/work", to)) throw Error("Stale composed workspace link")
console.log(JSON.stringify({ status: "COMPOSED_INPUTS_VERIFIED", base_sha: base.review_sha,
  overlay_sha: overlay.review_sha, base_files: base.files.length, overlay_files: overlay.files.length,
  source_graph: "immutable /work native hooks; canonical /delta authority; /base unchanged downstream; shared /work account/Registry" }))
