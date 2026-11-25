import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

// Local source packaging ONLY. No imports of application modules or dependencies.
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, "../../../../..")
const sourceCommit = "e1fb1b28420a62acca17ddd69f1e72b3a9d27907"
const r2 = "991f38f216ad265e06aec53313db8928437da248"
const prior = "9593f24f287f2e404f387f6359e89453cd8a971e"
const root = "/home/ubuntu/tadazz-hq-qa-20261115"
const base = `${root}/fixtures/recovery-r2-${prior}/work`
const lower = `${root}/source/recovery-r2-${r2}`
const src = `${root}/source/recovery-c1-${sourceCommit}-packet2`
const fixture = `${root}/fixtures/recovery-c1-${sourceCommit}-packet2`
const evidence = `${root}/evidence/recovery-c1-${sourceCommit}-packet2`
const sha = bytes => createHash("sha256").update(bytes).digest("hex")
const git = (...args) => execFileSync("git", args, { cwd: repo, maxBuffer: 8 * 1024 * 1024 })
const json = (name, value) => fs.writeFileSync(path.join(here, name), JSON.stringify(value, null, 2) + "\n")
const beforeBytes = fs.readFileSync(path.join(here, "../r2-server-991f38f/staged-manifest.json"))
const before = JSON.parse(beforeBytes)
if (sha(beforeBytes) !== "d67a1041f7c43392ad83d4e6812e597fa05a391683766ab6a46112a2c67b2f54") throw Error("R2 manifest mismatch")
const changed = git("diff", "--name-only", r2, sourceCommit, "--", "extensions/src", "packages").toString().trim().split("\n")
const inventory = JSON.parse(fs.readFileSync(path.join(here, "../c1-review-revision/source-audit.json"))).files
if (changed.length !== 19 || changed.some(p => !inventory.some(f => f.file === p))) throw Error("Unexpected source delta")
const files = changed.map(p => {
  if (/\\|:|(?:^|\/)\.\.(?:\/|$)|(?:^|\/)(?:node_modules|\.git|config|\.env)(?:\/|$)/u.test(p)) throw Error("Unsafe path")
  const bytes = git("show", `${sourceCommit}:${p}`)
  const record = { path: p, size: bytes.length, sha256: sha(bytes), blob: git("rev-parse", `${sourceCommit}:${p}`).toString().trim() }
  if (record.sha256 !== inventory.find(f => f.file === p)?.sha256) throw Error("Audit hash mismatch " + p)
  return record
})
const archive = path.join(here, "overlay.tar.gz")
git("archive", "--format=tar.gz", `--output=${archive}`, sourceCommit, "--", ...changed)
const roots = ["extensions/src/server/storage", "packages/socket/src/services"]
const lowerPath = f => f.source === "overlay" ? `${lower}/overlay/${f.path}` : `${base}/${f.path}`
const pass = []
const skeleton = []
for (const directory of roots) {
  const first = new Set(before.files.filter(f => f.path.startsWith(directory + "/")).map(f => f.path.slice(directory.length + 1).split("/")[0]))
  for (const name of [...first].sort()) {
    const p = `${directory}/${name}`
    if (changed.includes(p)) continue
    const exact = before.files.find(f => f.path === p)
    const isDirectory = !exact
    const source = isDirectory ? `${base}/${p}` : lowerPath(exact)
    pass.push({ source, destination: `/work/${p}`, readonly: true })
    skeleton.push({ path: p, kind: isDirectory ? "directory" : "empty-file" })
  }
}
const mounts = [
  { source: base, destination: "/work", readonly: true },
  { source: base, destination: "/retained-base", readonly: true },
  { source: `${root}/source/recovery-r2-${prior}/source-manifest.json`, destination: "/retained-inputs/source-manifest.json", readonly: true },
  ...before.changed.filter(p => !roots.some(d => p.startsWith(d + "/"))).map(p => ({ source: `${lower}/overlay/${p}`, destination: `/work/${p}`, readonly: true })),
  ...roots.map(p => ({ source: `${src}/namespace/${p}`, destination: `/work/${p}`, readonly: true })),
  ...pass,
  ...changed.filter(p => !roots.some(d => p.startsWith(d + "/"))).map(p => ({ source: `${src}/namespace/${p}`, destination: `/work/${p}`, readonly: true })),
  ...["extensions/node_modules/.vite", "extensions/node_modules/.vite-temp", "node_modules/.vite", "node_modules/.vite-temp"].map((p, i) => ({ source: `${fixture}/cache-${i}`, destination: `/work/${p}`, readonly: false })),
  { source: `${fixture}/scratch`, destination: "/scratch", readonly: false },
  { source: `${fixture}/child-output-root`, destination: "/qa", readonly: true },
  { source: `${fixture}/child-results`, destination: "/qa/results", readonly: false },
  { source: `${fixture}/child-receipts`, destination: "/qa/receipts", readonly: false },
  { source: src, destination: "/inputs", readonly: true },
]
const effective = new Map(before.files.map(f => [f.path, { ...f, physicalSource: lowerPath(f) }]))
for (const f of files) effective.set(f.path, { ...f, source: "c1-overlay", physicalSource: `${src}/namespace/${f.path}` })
json("manifest.json", {
  sourceCommit, priorR2Commit: r2, priorDependencyFixtureCommit: prior,
  priorManifestSha256: sha(beforeBytes), archive: "overlay.tar.gz", archiveBytes: fs.statSync(archive).size, archiveSha256: sha(fs.readFileSync(archive)),
  files, sourceBytes: files.reduce((n, f) => n + f.size, 0), copiedUnchangedSourceBytes: 0,
  effectiveFiles: [...effective.values()], aux: before.aux.map(f => ({ ...f, physicalSource: `${base}/${f.path}` })), skeleton,
  runtimeTestsExecuted: false, scope: "19 exact frozen source files only; all unchanged inputs/dependencies remain read-only bind mounts",
})
const flags = ["--maxWorkers=1", "--no-file-parallelism", "--reporter=verbose", "--reporter=json"]
const ext = ["node", "node_modules/vitest/vitest.mjs", "run", "--config", "vitest.config.ts"]
const tests = [
  { name: "primitives-scope", cwd: "/work/extensions", expectedCases: 9, wallSeconds: 120, args: [...ext, "src/server/storage/durable-files.test.ts", "src/server/storage/creation-scope.test.ts", ...flags] },
  { name: "reservation", cwd: "/work/extensions", expectedCases: 16, wallSeconds: 600, args: [...ext, "src/server/storage/creation-reservation.test.ts", ...flags] },
  { name: "review-regressions", cwd: "/work/extensions", expectedCases: 12, wallSeconds: 900, args: [...ext, "src/server/storage/creation-review.test.ts", ...flags] },
  { name: "actual-native", cwd: "/work", expectedCases: 11, wallSeconds: 600, args: ["node", "node_modules/vitest/vitest.mjs", "run", "--project", "socket", "packages/socket/src/services/quiz-creation-reservation.test.ts", ...flags] },
].map(j => ({ ...j, args: [...j.args, `--outputFile=/qa/results/${j.name}.results.json`] }))
json("plan.json", {
  sourceCommit, root, base, lower, src, fixture, evidence,
  runner: "tadazz-hq-recovery-c1-e1fb1b2-packet2-20261115",
  identity: { uid: 1001, gid: 1001 },
  image: "sha256:612033cbc08ff303d04e2e7f9782a67bc03acfbcbe6141316296f0c056daf647",
  prospectiveOnly: true, cpu: 0.25, memoryBytes: 2147483648, newPhysicalBytesCap: 67108864, absoluteDiskFloorBytes: 2147483648,
  maximumWallSeconds: 1800, sampleSeconds: 2, perLogBytesCap: 16777216,
  resourceAdmission: { rootThreadId: "01a1dd10-2ef0-73c2-9c65-569a843f44da", ownLaneId: "Recovery-C1", directory: `${root}/admissions`, maximumAgeSeconds: 300, rootLedgerRequired: true },
  historicalPlanningOnly: { initialFreeGateMiB: 2568, retainedSharedMetadataMiBOnce: 435, prospectiveAggregateCpu: 1.25, prospectiveAggregateGiB: 9, suppliesNoRuntimeAuthority: true },
  mounts, tests,
  env: {
    PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/scratch/home", TMPDIR: "/scratch/tmp", CONFIG_PATH: "/scratch/unused-initial-config",
    C1_FIXTURE_ROOT: "/scratch/c1", C1_RECEIPT_ROOT: "/qa/receipts", TSX_DISABLE_CACHE: "1", NODE_ENV: "test",
    MANAGER_PASSWORD: "c1-synthetic-fixture-only", JWT_SECRET: "c1-synthetic-fixture-jwt-key-no-real-authority", GAME_SPEED: "5",
    TADAZZ_ACCOUNTS_ENABLED: "false", TADAZZ_C1_CREATION_PROTOTYPE: "false",
  },
})
console.log(JSON.stringify({ sourceCommit, files: files.length, sourceBytes: files.reduce((n, f) => n + f.size, 0), archiveBytes: fs.statSync(archive).size, archiveSha256: sha(fs.readFileSync(archive)), effectiveFiles: effective.size, passthroughMounts: pass.length, testsPrepared: 48, serverOperations: 0 }, null, 2))
