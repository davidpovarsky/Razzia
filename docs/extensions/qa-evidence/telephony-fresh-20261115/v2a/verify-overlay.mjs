import { createHash } from "node:crypto"
import { readFileSync, lstatSync, realpathSync } from "node:fs"
import { resolve, sep } from "node:path"
const manifest = JSON.parse(
    readFileSync("/input-v2a/source-manifest.json", "utf8"),
  ),
  root = "/delta"
if (manifest.review_sha !== process.env.PHONE_REVIEW_SHA)
  throw Error("overlay SHA mismatch")
for (const item of manifest.files) {
  const path = resolve(root, item.path),
    content = readFileSync(path)
  if (
    !path.startsWith(root + sep) ||
    !lstatSync(path).isFile() ||
    realpathSync(path) !== path ||
    content.length !== item.bytes ||
    createHash("sha256").update(content).digest("hex") !== item.sha256
  )
    throw Error("changed overlay " + item.path)
}
if (realpathSync("/delta/node_modules") !== "/work/extensions/node_modules")
  throw Error("dependency link must resolve to immutable S02 dependencies")
console.log(
  JSON.stringify({
    status: "VERIFIED_OVERLAY_AND_EXISTING_DEPS",
    review_sha: manifest.review_sha,
    base_sha: manifest.base_sha,
    files: manifest.files.length,
  }),
)
