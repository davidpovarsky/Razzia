import fs from "node:fs"
import crypto from "node:crypto"
import zlib from "node:zlib"
import { execFileSync } from "node:child_process"

const directory = "docs/extensions/qa-evidence/show-library-schema-20261115"
const root = "extensions/src/core/show-library"
const walk = (p) => fs.readdirSync(p, { withFileTypes: true }).flatMap((d) => d.isDirectory() ? walk(`${p}/${d.name}`) : [`${p}/${d.name}`])
const files = walk(root).sort()
const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex")
const entries = files.map((path) => { const bytes = fs.readFileSync(path); return { path, bytes: bytes.length, sha256: sha(bytes) } })
const parts = []
for (const entry of entries) {
  const bytes = fs.readFileSync(entry.path), header = Buffer.alloc(512)
  if (Buffer.byteLength(entry.path) > 99) throw new Error("archive path budget")
  header.write(entry.path, 0, 100, "utf8"); header.write("0000644\0", 100)
  header.write("0000000\0", 108); header.write("0000000\0", 116)
  header.write(`${bytes.length.toString(8).padStart(11, "0")}\0`, 124)
  header.write("00000000000\0", 136); header.fill(32, 148, 156)
  header.write("0", 156); header.write("ustar\0", 257); header.write("00", 263)
  header.write(`${header.reduce((a,b)=>a+b,0).toString(8).padStart(6,"0")}\0 `, 148)
  parts.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512))
}
parts.push(Buffer.alloc(1024))
const archive = zlib.gzipSync(Buffer.concat(parts)), overlaySha = sha(archive)
const archivePath = `${directory}/port2-overlay-${overlaySha}.tar.gz`
fs.writeFileSync(`${archivePath}.tmp`, archive); fs.renameSync(`${archivePath}.tmp`, archivePath)
const base = "8a43c99c65d8923bd23d8c57ac3607e9a09b5764"
const baseline = execFileSync("git", ["ls-tree", "-r", "-z", "--long", base], { maxBuffer: 8000000 }).toString("utf8").split("\0").filter(Boolean).map((row) => {
  const tab = row.indexOf("\t"), [mode, type, objectId, size] = row.slice(0, tab).trim().split(/\s+/u)
  if (type !== "blob" || mode === "120000") throw new Error(`unsupported baseline entry ${row}`)
  return { path: row.slice(tab + 1), mode, gitBlob: objectId, bytes: Number(size) }
})
const receipt = {
  schemaVersion: 1, portVersion: 2, identityRuleVersion: 1, base, overlaySha, files: entries, baseline,
  archive: { path: archivePath, bytes: archive.length, sha256: overlaySha },
  baseArchive: { name: "base-8a43c99.tar.gz", bytes: fs.statSync(`${directory}/base-8a43c99.tar.gz`).size, sha256: sha(fs.readFileSync(`${directory}/base-8a43c99.tar.gz`)) },
  gitReferences: { name: "git-reference-objects.pack", sha256: sha(fs.readFileSync(`${directory}/git-reference-objects.pack`)) },
  tests: "NOT_RUN", typecheck: "NOT_RUN", createdUtc: new Date().toISOString(),
}
const manifestPath = `${directory}/port2-manifest-${overlaySha}.json`
fs.writeFileSync(`${manifestPath}.tmp`, `${JSON.stringify(receipt, null, 2)}\n`, "utf8"); fs.renameSync(`${manifestPath}.tmp`, manifestPath)
console.log(JSON.stringify({ overlaySha, archivePath, manifestPath, sourceFiles: files.length, baselineFiles: baseline.length, baseArchive: receipt.baseArchive }))
