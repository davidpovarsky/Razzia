import fs from "node:fs"
import path from "node:path"
import { isDeepStrictEqual as equal } from "node:util"
const directory = process.argv[2]
const read = (name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"))
const requireProof = (condition, message) => { if (!condition) throw new Error(message) }
const main = read("runner-identity.json")
const followup = read("followup/runner-identity.json")
const roMounts = (runner) => runner.Mounts.filter((m) => m.Type === "bind" && !m.RW).map((m) => ({ source: m.Source, destination: m.Destination })).sort((a,b) => a.destination.localeCompare(b.destination))
requireProof(equal(roMounts(main), roMounts(followup)), "Application/dependency source mounts changed")
requireProof(main.Image === followup.Image && followup.HostConfig.ReadonlyRootfs && followup.HostConfig.NanoCpus === 250000000 && followup.HostConfig.Memory === 2147483648 && followup.HostConfig.NetworkMode === "none", "Runner profile changed")
const fake = followup.Mounts.find((m) => m.Destination === "/fake")
requireProof(fake?.Type === "bind" && fake.RW && fake.Source.endsWith("recovery-r2-991f38f216ad265e06aec53313db8928437da248/followup/fake"), "Actual fixture must be identified honestly as owned HOST SCRATCH BIND")
requireProof(read("followup/fixture-state.json").quizzDirectoryExists === false, "Unexpected Map base disk mirror")
for (const name of ["base-before", "base-after", "merged-before", "merged-after"])
  requireProof(read(`followup/${name}.json`).mismatches.length === 0, name)
requireProof(read("followup/runner-after-stop.json").state.Running === false, "Followup runner still running")
const summary = (name) => {
  const log = fs.readFileSync(path.join(directory, "followup", `${name}.log`), "utf8").replace(/\u001b\[[0-9;]*m/g, "")
  return log.split(/\r?\n/).filter((line) => /^\s*Tests\s+/.test(line)).at(-1)?.trim()
}
const apiExit = fs.readFileSync(path.join(directory,"followup/api-routes.exit"),"utf8").trim()
const themeExit = fs.readFileSync(path.join(directory,"followup/theme-installation-original-budget.exit"),"utf8").trim()
requireProof(apiExit === "0" && themeExit === "1", "Unexpected diagnostic outcome")
const result = {
  executedCommit: "991f38f216ad265e06aec53313db8928437da248",
  sameApplicationAndDependencyMounts: true, samePinnedImage: true,
  actualFixtureKind: "HOST SCRATCH BIND", fakeFixture: fake,
  noMapBaseDiskMirror: true, rootStillReadOnly: true,
  api: { exit: apiExit, summary: summary("api-routes") },
  theme: { exit: themeExit, summary: summary("theme-installation-original-budget"), originalTimeoutMs: 30000, timeoutOverride: false },
  fullSuiteOutcomeUnchanged: "813 PASS / 6 FAIL (819); no duplicate full run",
  runnerStopped: true, resourceGrantReleasedByManager: true,
  tmpfsPlan: "NOT RUN; manager accepted actual owned host scratch fixture and explicitly forbade an unnecessary rerun",
  limit: "Repeatable theme timeout remains for its owner; no theme/source/timeout edits or proven capacity/regression claim",
}
console.log(JSON.stringify(result, null, 2))
