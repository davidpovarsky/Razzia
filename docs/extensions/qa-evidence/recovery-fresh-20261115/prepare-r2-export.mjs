import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawn, execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

// Packaging only. Does not install dependencies, run tests/builds or alter source.
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
const [sha, output] = process.argv.slice(2)
if (!/^[a-f0-9]{40}$/.test(sha ?? "") || !output || !path.basename(output).startsWith(`tadazz-recovery-full-${sha}`)) throw new Error("Require exact SHA and new dedicated export directory")
const git = (...args) => execFileSync("git", args, { cwd: repository, maxBuffer: 4 * 1024 * 1024 })
if (git("rev-parse", "HEAD").toString().trim() !== sha || git("status", "--porcelain").toString().trim()) throw new Error("Exact clean HEAD required")
fs.mkdirSync(output)
const rootFiles = git("ls-tree", "-z", sha).toString().split("\0").filter(Boolean).map((line) => line.match(/^\d+ blob [a-f0-9]+\t(.+)$/)?.[1]).filter((name) => name && !name.startsWith(".env"))
const selections = [...rootFiles, "packages", "extensions", "assets", "docker", "scripts", "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html", "docs/extensions/qa-evidence/recovery-fresh-20261115"]
const files = git("ls-tree", "-r", "-z", sha, "--", ...selections).toString().split("\0").filter(Boolean).map((line) => {
  const match = line.match(/^(\d+) blob ([a-f0-9]{40})\t(.+)$/)
  if (!match || !["100644", "100755"].includes(match[1])) throw new Error(`Non-regular Git export entry: ${line}`)
  const name = match[3]
  if (name.split("/").some((part) => !part || [".", "..", ".git", "node_modules", ".config"].includes(part) || /^\.env(?:\.|$)/i.test(part)) || name.startsWith("config/") || /[\\:\x00-\x1f]/u.test(name) || /\.(pem|key|pfx|p12|sqlite|db)$/i.test(name)) throw new Error(`Forbidden input path: ${name}`)
  return { path: name, gitMode: match[1], blob: match[2] }
})

// Stream Git blob bytes through SHA256; avoid holding the full asset tree in RAM.
const batch = spawn("git", ["cat-file", "--batch"], { cwd: repository, stdio: ["pipe", "pipe", "pipe"] })
let stderr = ""
batch.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-16000) })
const completion = new Promise((resolve, reject) => {
  batch.once("error", reject)
  batch.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Git batch failed: ${stderr}`)))
})
batch.stdin.end(files.map((file) => file.blob).join("\n") + "\n")
let phase = "header"
let header = ""
let index = 0
let remaining = 0
let hash
for await (const chunk of batch.stdout) {
  let offset = 0
  while (offset < chunk.length) {
    if (phase === "header") {
      const end = chunk.indexOf(10, offset)
      if (end < 0) { header += chunk.subarray(offset).toString(); break }
      header += chunk.subarray(offset, end).toString()
      const [id, kind, size] = header.split(" ")
      if (files[index]?.blob !== id || kind !== "blob" || !/^\d+$/.test(size)) throw new Error("Unexpected Git batch entry")
      remaining = Number(size)
      files[index].size = remaining
      hash = createHash("sha256")
      header = ""
      offset = end + 1
      phase = "body"
      if (remaining === 0) { files[index].sha256 = hash.digest("hex"); phase = "separator" }
    } else if (phase === "body") {
      const count = Math.min(remaining, chunk.length - offset)
      hash.update(chunk.subarray(offset, offset + count))
      remaining -= count
      offset += count
      if (remaining === 0) { files[index].sha256 = hash.digest("hex"); phase = "separator" }
    } else {
      if (chunk[offset] !== 10) throw new Error("Unexpected Git batch separator")
      offset += 1
      index += 1
      phase = "header"
    }
  }
}
await completion
if (index !== files.length || phase !== "header" || header) throw new Error("Incomplete Git blob stream")

const archive = "full-source.tar.gz"
execFileSync("git", ["archive", "--format=tar.gz", `--output=${path.join(output, archive)}`, sha, "--", ...selections], { cwd: repository, stdio: ["ignore", "ignore", "pipe"] })
async function digest(file) {
  const hash = createHash("sha256")
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest("hex")
}
const previous = JSON.parse(fs.readFileSync(path.join(repository, "docs/extensions/qa-evidence/recovery-fresh-20261115/review-scope-audit.json"), "utf8"))
const permittedDeltas = new Set(["extensions/src/server/media-library.ts", "extensions/src/server/media-library.test.ts", "extensions/src/server/storage/journal.ts", "extensions/src/server/storage/service.ts", "extensions/src/server/storage/recovery-state.ts", "extensions/src/server/storage/journal-recovery.test.ts", "extensions/src/server/storage/create-recovery.test.ts", "extensions/src/server/media-library-recovery.test.ts"])
if (git("diff", "--name-only", "be73927216fb89d743d208ccfad7a632953ec10b", sha, "--", "packages").toString().trim()) throw new Error("Protected packages changed")
const reviewedBlobs = Object.entries(previous.hashes).map(([name, sha256]) => {
  const current = files.find((file) => file.path === name)
  if (!current || (current.sha256 !== sha256 && !permittedDeltas.has(name))) throw new Error(`Unapproved reviewed source changed: ${name}`)
  return { path: name, priorSha256: sha256, sha256: current.sha256, unchanged: current.sha256 === sha256 }
})
const unchangedReviewedBlobs = reviewedBlobs.filter((file) => file.unchanged)
const manifest = {
  schemaVersion: 1, commit: sha, tree: git("rev-parse", `${sha}^{tree}`).toString().trim(),
  purpose: "R2 scoped native binding/security/process/original focused acceptance; broader checks only on final review candidate, NOT RUN during packaging",
  archive, archiveSha256: await digest(path.join(output, archive)), archiveBytes: fs.statSync(path.join(output, archive)).size,
  totalFiles: files.length, totalBytes: files.reduce((total, file) => total + file.size, 0), files, selections,
  unchangedReviewedCommit: "66b4535632ee6cd4bbc4515e7d3ab9004fe1915e", unchangedReviewedBlobs, reviewedBlobDeltas: reviewedBlobs.filter((file) => !file.unchanged),
  excluded: ["ignored files/dependencies", ".env*", "runtime/customer configuration", "credentials/private keys", "unrelated historical documentation/QA outputs", ".github/.agents/.vscode (not required build/test inputs)"],
  requiredDocumentationInput: "docs/extensions/references/TADAZZ_Motion_Showcase_One_Click_20261105.html",
  declaredGeneratedOutputs: ["packages/socket/dist/**", "docs/extensions/qa-evidence/tadazz-next-source-parity-20261106/native_scenes_harness.html", "node_modules/**", "QA-owned caches/receipts"],
  lockfileSha256: files.find((file) => file.path === "pnpm-lock.yaml").sha256,
}
const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n")
fs.writeFileSync(path.join(output, "source-manifest.json"), bytes, { flag: "wx" })
const receipt = { commit: sha, files: files.length, bytes: manifest.totalBytes, archiveBytes: manifest.archiveBytes, archiveSha256: manifest.archiveSha256, manifestSha256: createHash("sha256").update(bytes).digest("hex"), unchangedReviewedBlobs: unchangedReviewedBlobs.length, testsRun: false, buildsRun: false, installsRun: false }
fs.writeFileSync(path.join(output, "package-receipt.json"), JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" })
console.log(JSON.stringify(receipt, null, 2))
