// SERVER ONLY, after explicit grant. Hash/read audit, not extra test collection.
const fs = require("node:fs"),
  crypto = require("node:crypto")
const plan = JSON.parse(fs.readFileSync("/plan/overlay-plan.json", "utf8"))
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex")
const errors = []
const core = "/workspace/extensions/src/core/show-library"
const expectedNames = plan.allCoreFileMounts
  .map((m) => m.containerPath.split("/").at(-1))
  .sort()
if (
  JSON.stringify(fs.readdirSync(core).sort()) !== JSON.stringify(expectedNames)
)
  errors.push("core-directory-file-set")
for (const f of plan.allCoreFileMounts) {
  const b = fs.readFileSync(f.containerPath)
  if (b.length !== f.bytes || sha(b) !== f.sha256) errors.push(f.containerPath)
}
for (const f of plan.scopedBaselineWitnesses) {
  const b = fs.readFileSync("/workspace/" + f.path)
  const blob = crypto
    .createHash("sha1")
    .update(Buffer.from("blob " + b.length + "\0"))
    .update(b)
    .digest("hex")
  if (b.length !== f.bytes || sha(b) !== f.sha256 || blob !== f.gitBlob)
    errors.push(f.path)
}
const mounts = new Map(
  fs
    .readFileSync("/proc/self/mountinfo", "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split(" - ")[0].split(" ")
      return [fields[4], fields[5].split(",")]
    }),
)
for (const f of plan.allCoreFileMounts)
  if (!mounts.get(f.containerPath)?.includes("ro"))
    errors.push("mount-not-readonly:" + f.containerPath)
const status = fs.readFileSync("/proc/self/status", "utf8")
if (!/^CapEff:\s+0+$/m.test(status) || !/^NoNewPrivs:\s+1$/m.test(status))
  errors.push("capability-boundary")
const version = (name) =>
  JSON.parse(
    fs.readFileSync(
      "/workspace/extensions/node_modules/" + name + "/package.json",
      "utf8",
    ),
  ).version
const tools = {
  node: process.version,
  vitest: version("vitest"),
  typescript: version("typescript"),
  zod: version("zod"),
}
if (
  Object.entries(plan.toolchainExpected).some(
    ([key, value]) => tools[key] !== value,
  )
)
  errors.push("toolchain-version")
for (const f of plan.vitestDependencyHashes)
  if (
    sha(
      fs.readFileSync("/workspace/extensions/node_modules/vitest/" + f.path),
    ) !== f.sha256
  )
    errors.push("vitest:" + f.path)
const toolFiles = [
  "vitest/package.json",
  "typescript/package.json",
  "typescript/bin/tsc",
  "zod/package.json",
]
const toolFileHashes = Object.fromEntries(
  toolFiles.map((file) => [
    file,
    sha(fs.readFileSync("/workspace/extensions/node_modules/" + file)),
  ]),
)
console.log(
  JSON.stringify({
    toolFileHashes,
    status: errors.length ? "FAIL" : "PASS",
    effectiveAcceptedFiles: 26,
    newSourceFiles: 4,
    scopedBaselineFiles: plan.scopedBaselineWitnesses.length,
    readOnlyCoreMounts: 30,
    tools,
    errors,
  }),
)
if (errors.length) process.exitCode = 1
