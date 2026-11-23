import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const root = process.cwd()
const relative = "extensions/src/server/media-library.test.ts"
const prior = execFileSync("git", ["show", `8b9593787e88ccad37e924a45b820e353074864a:${relative}`], { cwd: root }).toString()
const after = fs.readFileSync(path.join(root, relative), "utf8")
const prefix = '  it("Gate 3: concurrent cross-family recovery'
function section(source) {
  const start = source.indexOf(prefix)
  if (start < 0) throw new Error("Missing original Gate3")
  const next = source.indexOf("\n  it(", start + prefix.length)
  return source.slice(start, next < 0 ? source.length : next)
}
const added = "    writeSidecar(getPath, quizId, v2Extras)\n"
if (after.split(added).length !== 2 || after.replace(added, "") !== prior)
  throw new Error("Change outside the single approved pre-staging fixture write")
const hash = (source) => createHash("sha256").update(source).digest("hex")
const beforeHash = hash(section(prior))
if (beforeHash !== "dbebcb231693a785067438ef9fba4ae43f676fe29e4eee7ccce240e1f81191d3")
  throw new Error("Original Gate3 hash mismatch")
console.log(JSON.stringify({
  status: "PASS", comparedAgainst: "8b9593787e88ccad37e924a45b820e353074864a",
  onlySingleFixtureWriteAdded: true, assertionsAndRestOfOriginalFileByteIdentical: true,
  gate3BeforeSha256: beforeHash, gate3AfterSha256: hash(section(after)),
  originalLine: 1298, inserted: added.trim(),
}, null, 2))
