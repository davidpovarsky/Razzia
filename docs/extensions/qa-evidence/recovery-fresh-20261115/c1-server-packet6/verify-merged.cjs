const fs = require("node:fs"), crypto = require("node:crypto"), path = require("node:path")
const { createRequire } = require("node:module")
const assert = require("node:assert/strict")
const plan = JSON.parse(fs.readFileSync("/inputs/plan.json", "utf8"))
const identity = { uid: process.getuid(), euid: process.geteuid(), gid: process.getgid(), egid: process.getegid(), groups: process.getgroups() }
assert.equal(identity.uid, plan.identity.uid)
assert.equal(identity.euid, plan.identity.uid)
assert.equal(identity.gid, plan.identity.gid)
assert.equal(identity.egid, plan.identity.gid)
const status = fs.readFileSync("/proc/self/status", "utf8")
const security = Object.fromEntries(["CapEff", "CapPrm", "CapBnd", "NoNewPrivs"].map(name => [name, status.match(new RegExp(`^${name}:\\s*(\\S+)`, "mu"))?.[1]]))
for (const name of ["CapEff", "CapPrm", "CapBnd"]) assert.match(security[name], /^0+$/u)
assert.equal(security.NoNewPrivs, "1")
const manifest = JSON.parse(fs.readFileSync("/inputs/manifest.json", "utf8"))
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const mismatches = []
const prior37 = []
for (const prior of plan.prior37Evidence) {
  const bytes = fs.readFileSync('/prior-results/' + prior.group + '.results.json')
  assert.equal(hash(bytes), prior.rawResultSha256)
  const result = JSON.parse(bytes)
  assert.equal(result.numPassedTests, prior.passed)
  assert.equal(result.numFailedTests, 0)
  const names = result.testResults.flatMap(suite => suite.assertionResults.map(value => value.fullName))
  assert.deepEqual(names, prior.caseNames)
  prior37.push({ group: prior.group, passed: prior.passed, profile: 'OLD packet2 only', rawSha256: prior.rawResultSha256 })
}
for (const file of [...manifest.effectiveFiles, ...manifest.aux]) {
  try {
    const bytes = fs.readFileSync("/work/" + file.path)
    if (bytes.length !== file.size || hash(bytes) !== file.sha256) mismatches.push(file.path)
  } catch (error) { mismatches.push(file.path + ": " + error.code) }
}
const retainedBytes = fs.readFileSync("/retained-inputs/source-manifest.json")
assert.equal(hash(retainedBytes), "67fecbcd28cfdef2a768c4ae7203e41a08a33c0cab6134f38aca3155fe0b7fe1")
const retained = JSON.parse(retainedBytes)
for (const file of retained.files) {
  const bytes = fs.readFileSync("/retained-base/" + file.path)
  if (bytes.length !== file.size || hash(bytes) !== file.sha256) mismatches.push("retained:" + file.path)
}
const critical = []
for (const [scope, name] of [["", "vitest"], ["extensions", "vitest"], ["extensions", "tsx"], ["extensions", "zod"], ["extensions", "uuid"], ["extensions", "http-status-codes"], ["packages/socket", "hono"], ["packages/socket", "nanoid"]]) {
  const installed = createRequire(path.join("/work", scope, "package.json"))
  const entry = fs.realpathSync(installed.resolve(name))
  if (!entry.startsWith("/work/")) throw Error("Dependency escapes immutable fixture")
  let directory = path.dirname(entry), pkg, packageFile
  while (directory !== "/work" && directory !== "/") {
    const candidate = path.join(directory, "package.json")
    if (fs.existsSync(candidate)) {
      const value = JSON.parse(fs.readFileSync(candidate, "utf8"))
      if (value.name === name) { pkg = value; packageFile = candidate; break }
    }
    directory = path.dirname(directory)
  }
  if (!pkg) throw Error("Missing dependency identity " + name)
  critical.push({ scope, name, version: pkg.version, entry, entrySha256: hash(fs.readFileSync(entry)), packageFile, packageSha256: hash(fs.readFileSync(packageFile)) })
}
const scratch = ["/scratch/c1", "/scratch/tmp", "/scratch/home", "/qa/receipts", "/qa/results"].map(directory => {
  if (fs.realpathSync(directory) !== directory) throw Error("Linked writable fixture root")
  const stat = fs.statSync(directory, { bigint: true })
  return { directory, dev: String(stat.dev), ino: String(stat.ino), mode: Number(stat.mode & 0o777n) }
})
if (new Set(scratch.map(v => v.dev)).size !== 1) throw Error("Scratch and receipts are not on one filesystem")
const access = []
if (process.argv.includes("--access")) {
  assert.equal(fs.existsSync(plan.evidence), false, "Host observations must not be visible")
  assert.equal(fs.existsSync(plan.resourceAdmission.directory), false, "Host control files must not be visible")
  for (const directory of [...scratch.map(v => v.directory), "/work/extensions/node_modules/.vite", "/work/extensions/node_modules/.vite-temp", "/work/node_modules/.vite", "/work/node_modules/.vite-temp", ...plan.tests.flatMap(job => [job.env.C1_RECEIPT_ROOT, job.env.C1_PROCESS_OBSERVER_ROOT])]) {
    const stat = fs.statSync(directory)
    assert.equal(stat.uid, identity.uid)
    assert.equal(stat.gid, identity.gid)
    assert.equal(stat.mode & 0o077, 0)
    fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK)
    const probe = path.join(directory, ".c1-access-" + crypto.randomUUID())
    const bytes = Buffer.from("synthetic runner access proof")
    const fd = fs.openSync(probe, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL, 0o600)
    try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd) } finally { fs.closeSync(fd) }
    assert.deepEqual(fs.readFileSync(probe), bytes)
    fs.unlinkSync(probe)
    const parent = fs.openSync(directory, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY)
    try { fs.fsyncSync(parent) } finally { fs.closeSync(parent) }
    access.push({ directory, readWriteTraverse: true, probeRemoved: true })
  }
  for (const file of ["/inputs/plan.json", "/work/packages/socket/src/services/config.ts"]) {
    assert.throws(() => fs.accessSync(file, fs.constants.W_OK))
  }
}
if (process.version !== "v24.22.2") throw Error("Unexpected pinned Node version")
console.log(JSON.stringify({ sourceCommit: manifest.sourceCommit, observerCommit: manifest.observerCommit, files: manifest.effectiveFiles.length, aux: manifest.aux.length, retainedFiles: retained.files.length, prior37, mismatches, node: process.version, sqlite: process.versions.sqlite, identity, security, critical, scratch, access }))
if (mismatches.length) process.exitCode = 1
