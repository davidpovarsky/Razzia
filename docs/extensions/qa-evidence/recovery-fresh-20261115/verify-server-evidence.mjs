import fs from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"
const root = process.argv[2]
const lines = fs
  .readFileSync(path.join(root, "server-evidence-sha256.txt"), "utf8")
  .replace(/^\uFEFF/, "")
  .trim()
  .split(/\r?\n/)
const mismatches = []
for (const line of lines) {
  const match = /^([a-f0-9]{64})\s+\.\/(.+)$/.exec(line)
  if (!match) throw new Error(`Invalid server manifest line: ${line}`)
  const bytes = fs.readFileSync(path.join(root, match[2]))
  if (createHash("sha256").update(bytes).digest("hex") !== match[1])
    mismatches.push(match[2])
}
console.log(JSON.stringify({ files: lines.length, mismatches }))
if (mismatches.length) process.exitCode = 1
