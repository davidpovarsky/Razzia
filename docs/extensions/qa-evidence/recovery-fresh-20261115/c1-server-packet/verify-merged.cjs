const fs = require("node:fs"), crypto = require("node:crypto"), path = require("node:path")
const { createRequire } = require("node:module")
const manifest = JSON.parse(fs.readFileSync("/inputs/manifest.json", "utf8"))
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const mismatches = []
for (const file of [...manifest.effectiveFiles, ...manifest.aux]) {
  try {
    const bytes = fs.readFileSync("/work/" + file.path)
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) mismatches.push(file.path)
  } catch (error) { mismatches.push(file.path + ": " + error.code) }
}
const critical = []
for (const [scope, name] of [["", "vitest"], ["extensions", "vitest"], ["extensions", "tsx"], ["extensions", "zod"], ["extensions", "uuid"], ["extensions", "http-status-codes"], ["packages/socket", "hono"], ["packages/socket", "nanoid"]]) {
  const installed = createRequire(path.join("/work", scope, "package.json"))
  const entry = fs.realpathSync(installed.resolve(name))
  if (!entry.startsWith("/work/")) throw Error("Dependency escapes immutable fixture")
  let directory = path.dirname(entry), pkg, packageFile
  while (directory !== "/work" && directory !== "/") {
    const candidate = path.join(directory, "package.json")
    if (fs.existsSync(candidate)) {
      const value = JSON.parse(fs.readFileSync(candidate, "utf8"))
      if (value.name === name) { pkg = value; packageFile = candidate; break }
    }
    directory = path.dirname(directory)
  }
  if (!pkg) throw Error("Missing dependency identity " + name)
  critical.push({ scope, name, version: pkg.version, entry, entrySha256: hash(fs.readFileSync(entry)), packageFile, packageSha256: hash(fs.readFileSync(packageFile)) })
}
const scratch = ["/scratch/c1", "/scratch/tmp", "/qa/receipts"].map(directory => {
  if (fs.realpathSync(directory) !== directory) throw Error("Linked writable fixture root")
  const stat = fs.statSync(directory, { bigint: true })
  return { directory, dev: String(stat.dev), ino: String(stat.ino), mode: Number(stat.mode & 0o777n) }
})
if (new Set(scratch.map(v => v.dev)).size !== 1) throw Error("Scratch and receipts are not on one filesystem")
if (process.version !== "v24.22.2") throw Error("Unexpected pinned Node version")
console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, files: manifest.effectiveFiles.length, aux: manifest.aux.length, mismatches, node: process.version, sqlite: process.versions.sqlite, critical, scratch }))
if (mismatches.length) process.exitCode = 1
