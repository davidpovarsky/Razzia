import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, "../../../../..")
const relative = "extensions/src/server/media-library.test.ts"
const before = execFileSync("git", ["show", `9593f24f287f2e404f387f6359e89453cd8a971e:${relative}`], { cwd: root }).toString()
const after = fs.readFileSync(path.join(root, relative), "utf8")
function section(source, prefix) {
  const start = source.indexOf(prefix)
  if (start < 0) throw new Error(`Missing test section: ${prefix}`)
  const next = source.indexOf("\n  it(", start + prefix.length)
  return { start, end: next < 0 ? source.length : next, text: source.slice(start, next < 0 ? source.length : next) }
}
function outsideApproved(source) {
  const ranges = ['  it("restart recovery:', '  it("Gate A4 (7):'].map((prefix) => section(source, prefix)).sort((a, b) => b.start - a.start)
  for (const range of ranges) source = source.slice(0, range.start) + "APPROVED_TEST_CASE" + source.slice(range.end)
  return source
}
const prefix = '  it("Gate 3: concurrent cross-family recovery'
if (outsideApproved(before) !== outsideApproved(after)) throw new Error("Changes outside the exact two approved original Media tests")
if (section(before, prefix).text !== section(after, prefix).text) throw new Error("Unbacked logical Gate3 fixture changed")
const result = { status: "PASS", comparedAgainst: "9593f24f287f2e404f387f6359e89453cd8a971e", onlyTwoApprovedOriginalMediaCasesChanged: true, originalGate3Unchanged: true, gate3Sha256: createHash("sha256").update(section(after, prefix).text).digest("hex") }
fs.writeFileSync(path.join(directory, "original-test-scope-audit.json"), JSON.stringify(result, null, 2) + "\n")
process.stdout.write(JSON.stringify(result) + "\n")
