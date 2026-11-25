import { createHash } from "node:crypto"
import { readFileSync, lstatSync, realpathSync } from "node:fs"
import { resolve, sep } from "node:path"

const root = realpathSync("/work")
const manifest = JSON.parse(readFileSync("/input/source-manifest.json", "utf8"))
if (manifest.review_sha !== process.env.PHONE_REVIEW_SHA)
  throw new Error("Review SHA mismatch")
for (const item of manifest.files) {
  const path = resolve(root, item.path)
  if (
    !path.startsWith(root + sep) ||
    !lstatSync(path).isFile() ||
    realpathSync(path) !== path
  ) {
    throw new Error("Unsafe or missing delivered source: " + item.path)
  }
  const data = readFileSync(path)
  if (
    data.length !== item.bytes ||
    createHash("sha256").update(data).digest("hex") !== item.sha256
  ) {
    throw new Error("Changed delivered source: " + item.path)
  }
}
if (process.argv.includes("--links")) {
  for (const [from, expected] of [
    ["packages/socket/node_modules/@razzia/extensions", "extensions"],
    ["packages/socket/node_modules/@razzia/common", "packages/common"],
    ["extensions/node_modules/@razzia/common", "packages/common"],
  ])
    if (realpathSync(resolve(root, from)) !== resolve(root, expected))
      throw new Error("Stale workspace dependency: " + from)
}
console.log(
  JSON.stringify({
    status: "SOURCE_HASHES_VERIFIED",
    review_sha: manifest.review_sha,
    files: manifest.files.length,
    workspace_links_checked: process.argv.includes("--links"),
  }),
)
