import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
const prior = "9593f24f287f2e404f387f6359e89453cd8a971e"
const current = "991f38f216ad265e06aec53313db8928437da248"
const paths = [
  "extensions/src/server/show-themes/installation.test.ts",
  "extensions/src/server/show-themes/installation.ts",
  "extensions/src/server/show-themes/installation.fixture.ts",
  "extensions/src/server/show-themes/review.ts",
]
const records = paths.map((path) => {
  const read = (commit) => execFileSync("git", ["show", `${commit}:${path}`])
  const a = read(prior), b = read(current)
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex")
  if (!a.equals(b)) throw new Error(`Unexpected theme source change: ${path}`)
  return { path, bytes: b.length, priorSha256: hash(a), executedSha256: hash(b), byteIdentical: true }
})
console.log(JSON.stringify({
  priorSourceCommit: prior, executedCommit: current, records,
  cpuLimit: 0.25, memoryLimitBytes: 2147483648, timeoutMs: 30000,
  fullRun: "813 PASS / 6 FAIL; one installation case timed out",
  isolatedOriginalBudget: "4 PASS / 1 TIMEOUT in unchanged installation.test.ts",
  dependencies: "same immutable 9593 installed dependency tree and pinned Node image reused",
  interpretation: "Repeatable timeout at the leased CPU budget; source and test unchanged. No claim of a proven capacity cause, historical runtime baseline pass/fail, or permission to change theme code/timeout.",
}, null, 2))
