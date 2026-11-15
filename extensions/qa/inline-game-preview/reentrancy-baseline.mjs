import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"

const input = execFileSync("git", [
  "show",
  "b7a8fd4eb16a5d1da1cee71ed148fd431dab7966:extensions/src/site/components/game-preview/coordinator.ts",
])
const hash = (value) => createHash("sha256").update(value).digest("hex")
const directory = fileURLToPath(new URL("./.cache", import.meta.url))
const fixture = fileURLToPath(
  new URL("./.cache/coordinator-b7.ts", import.meta.url),
)
mkdirSync(directory, { recursive: true })

if (!existsSync(fixture)) {
  writeFileSync(fixture, input, { flag: "wx" })
}

if (hash(readFileSync(fixture)) !== hash(input)) {
  throw Error("Baseline input mismatch")
}

const { createPreviewCoordinator } = await import(pathToFileURL(fixture).href)
const owner = createPreviewCoordinator()
const drain = Promise.withResolvers()
let newest = null
owner.claim(() => {
  newest = owner.claim(() => undefined)

  return drain.promise
})
const outer = owner.claim(() => undefined)
const observed = {
  source: "b7a8fd4eb16a5d1da1cee71ed148fd431dab7966",
  sourceSha256: hash(input),
  newestClaimCurrent: newest.isCurrent(),
  newestClaimAborted: newest.signal.aborted,
  supersededOuterCurrent: outer.isCurrent(),
  expected: "The reentrant/newer claim wins; outer claim is aborted",
  scope:
    "Pure coordinator regression; no stage/DOM/network/auth or product acceptance",
}
drain.resolve()
owner.dispose()
console.log(JSON.stringify(observed, null, 2))
process.exitCode =
  observed.newestClaimCurrent && !observed.supersededOuterCurrent ? 0 : 1
