// Evidence comparison only. A private lock change is allowed ONLY if exact pnpm output.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
const [manifestFile, root, output, generatedLock] = process.argv.slice(2)
if (!manifestFile || root !== "/ram/work" || !output)
  throw new Error("Allocated source/manifest/output required")
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"))
const changed = []
let authorizedLock = null
for (const row of manifest.files) {
  const bytes = fs.readFileSync(path.join(root, row.path))
  if (row.path === "extensions/src/mcp-app/pnpm-lock.yaml" && generatedLock) {
    const expected = sha(fs.readFileSync(generatedLock))
    if (sha(bytes) !== expected) changed.push(row.path)
    else
      authorizedLock = {
        path: row.path,
        oldSha256: row.sha256,
        pnpmGeneratedSha256: expected,
      }
  } else if (bytes.length !== row.bytes || sha(bytes) !== row.sha256)
    changed.push(row.path)
}
const result = {
  kind: "EXACT_SOURCE_RECHECK",
  files: manifest.files.length,
  sourceCommit: manifest.sourceCommit,
  unexpectedChanges: changed,
  authorizedPrivateLockOutput: authorizedLock,
}
fs.writeFileSync(output, JSON.stringify(result, null, 2) + "\n")
if (changed.length || manifest.files.length !== 150) process.exit(1)
