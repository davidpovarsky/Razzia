import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
const here = path.dirname(fileURLToPath(import.meta.url))
const plan = JSON.parse(fs.readFileSync(path.join(here, "plan.json")))
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json")))
if (plan.sourceCommit !== manifest.sourceCommit || manifest.files.length !== 19 || plan.tests.reduce((n, t) => n + t.expectedCases, 0) !== 48) throw Error("Packet identity mismatch")
if (new Set(plan.mounts.map(m => m.destination)).size !== plan.mounts.length) throw Error("Overlapping mount destination")
const files = ["manifest.json", "plan.json", "overlay.tar.gz", "server-run.py", "verify-merged.cjs", "analyze-results.cjs"].map(name => {
  const bytes = fs.readFileSync(path.join(here, name))
  return { path: name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
})
const result = { sourceCommit: plan.sourceCommit, executionAuthorized: false, files, totalTransferBytesExcludingThisHashFileAndActualAdmission: files.reduce((n, f) => n + f.size, 0) }
fs.writeFileSync(path.join(here, "packet-hashes.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result, null, 2))
