// SERVER ONLY: copy the exact selected source graph into owned tmpfs, not a tree.
import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
const [baseline, overlay, manifestFile, target, receiptFile] =
  process.argv.slice(2)
if (
  process.platform !== "linux" ||
  target !== "/ram/work" ||
  fs.existsSync(target)
)
  throw new Error("Fresh allocated Linux /ram/work required")
const expected =
  "e538db2b931fa6c223facffa9a7e0b0ac31b6270d8f629d8bf8e8d72245bc1f6"
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const manifestBytes = fs.readFileSync(manifestFile)
if (sha(manifestBytes) !== expected)
  throw new Error("Unexpected frozen150-input manifest")
const manifest = JSON.parse(manifestBytes)
const content = new Map()
for (const row of manifest.files) {
  if (path.isAbsolute(row.path) || row.path.split("/").includes(".."))
    throw new Error("Unsafe input path")
  const owner = fs.existsSync(path.join(overlay, row.path)) ? overlay : baseline
  const source = path.join(owner, row.path)
  if (
    fs.lstatSync(source).isSymbolicLink() ||
    !fs.realpathSync(source).startsWith(fs.realpathSync(owner) + path.sep)
  )
    throw new Error("Application source escapes read-only input root")
  const bytes = fs.readFileSync(source)
  if (bytes.length !== row.bytes || sha(bytes) !== row.sha256)
    throw new Error("Frozen source mismatch: " + row.path)
  content.set(row.path, bytes)
}
if (content.size !== 150) throw new Error("Unexpected graph size")
fs.mkdirSync(target, { mode: 0o700 })
let total = 0
for (const [relative, bytes] of content) {
  const file = path.join(target, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  fs.writeFileSync(file, bytes, {
    mode: relative === "extensions/src/mcp-app/pnpm-lock.yaml" ? 0o600 : 0o444,
  })
  total += bytes.length
}
const receipt = {
  kind: "EXACT_SOURCE_RAM_MATERIALIZATION",
  sourceCommit: manifest.sourceCommit,
  manifestSha256: expected,
  files: content.size,
  bytes: total,
  unexpectedChanges: [],
  applicationAliasesOutsideDeliveredSource: false,
}
fs.writeFileSync(receiptFile, JSON.stringify(receipt, null, 2) + "\n")
process.stdout.write(JSON.stringify(receipt) + "\n")
