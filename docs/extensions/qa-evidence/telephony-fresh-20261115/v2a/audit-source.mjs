import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
const root = fileURLToPath(new URL("../../../../../", import.meta.url))
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" })
const baseline = "672d100c13a28b270e8e64e2d3d79209e7e83e3a"
const source = git(
  "diff",
  "--cached",
  "--name-only",
  baseline,
  "--",
  "packages",
  "extensions/src",
)
  .trim()
  .split("\n")
  .filter(Boolean)
if (
  source.length !== 4 ||
  source.some(
    (path) => !path.startsWith("extensions/src/server/phone-lifecycle-v2/"),
  )
)
  throw Error("source ownership violated")
const oldFiles = git(
  "ls-tree",
  "-r",
  "--name-only",
  baseline,
  "--",
  "packages",
  "extensions/src",
)
  .trim()
  .split("\n")
const oldPaths = [
  "packages",
  "extensions/src",
  ":(exclude)extensions/src/server/phone-lifecycle-v2/**",
]
const diff = git("diff", "--cached", baseline, "--", ...oldPaths)
if (diff) throw Error("existing source changed")
const oldHarness = git(
  "show",
  baseline +
    ":extensions/src/telephony/pilot-runtime/phone-real-backend.node.ts",
)
const indexedHarness = git(
  "show",
  ":extensions/src/telephony/pilot-runtime/phone-real-backend.node.ts",
)
if (oldHarness !== indexedHarness) throw Error("legacy harness changed")
const mounted = spawnSync(
  "git",
  ["grep", "--cached", "-l", "phone-lifecycle-v2", "--", ...oldPaths],
  { cwd: root, encoding: "utf8" },
)
if (mounted.status !== 1)
  throw Error(
    "existing production import/mount or grep failure: " +
      mounted.stdout +
      mounted.stderr,
  )
const result = {
  status: "SCOPED_SOURCE_OWNERSHIP_AND_UNMOUNTED_VERIFIED",
  baseline,
  newSourceFiles: source,
  existingSourceFilesUnchanged: oldFiles.length,
  originalHarnessSHA256: createHash("sha256").update(oldHarness).digest("hex"),
  legacyApi09Api10Api11Unchanged: true,
  noExistingProductionImportOrMount: true,
  realAuthProvisioning: false,
  gatewayJournal: false,
}
writeFileSync(
  new URL("../V2A_SOURCE_AUDIT.json", import.meta.url),
  JSON.stringify(result, null, 2) + "\n",
)
console.log(JSON.stringify(result))
