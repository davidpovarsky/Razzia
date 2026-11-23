import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createHash } from "node:crypto"
const here = path.dirname(fileURLToPath(import.meta.url))
const plan = JSON.parse(fs.readFileSync(path.join(here, "plan.json")))
const manifest = JSON.parse(fs.readFileSync(path.join(here, "manifest.json")))
if (plan.sourceCommit !== manifest.sourceCommit || manifest.files.length !== 19 || plan.tests.reduce((n, t) => n + t.expectedCases, 0) !== 48) throw Error("Packet identity mismatch")
if (new Set(plan.mounts.map(m => m.destination)).size !== plan.mounts.length) throw Error("Overlapping mount destination")
if (plan.identity.uid !== 1001 || plan.identity.gid !== 1001 || !plan.resourceAdmission.rootLedgerRequired) throw Error("Missing fixed identity/fresh ROOT authority")
if (plan.mounts.some(m => plan.evidence === m.source || plan.evidence.startsWith(m.source + "/"))) throw Error("Host evidence exposed")
const writableQa = plan.mounts.filter(m => m.destination.startsWith("/qa") && !m.readonly).map(m => m.destination).sort()
if (JSON.stringify(writableQa) !== JSON.stringify(["/qa/receipts", "/qa/results"])) throw Error("Unexpected child writable evidence surface")
const files = ["manifest.json", "plan.json", "overlay.tar.gz", "server-run.py", "runner_host.py", "verify-merged.cjs", "analyze-results.cjs"].map(name => {
  const bytes = fs.readFileSync(path.join(here, name))
  return { path: name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }
})
const result = { sourceCommit: plan.sourceCommit, executionAuthorized: false, files, totalTransferBytesExcludingThisHashFileAndActualAdmission: files.reduce((n, f) => n + f.size, 0) }
fs.writeFileSync(path.join(here, "packet-hashes.json"), JSON.stringify(result, null, 2) + "\n")
console.log(JSON.stringify(result, null, 2))
