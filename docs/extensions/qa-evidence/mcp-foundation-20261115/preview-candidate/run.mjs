import fs from "node:fs"
import cp from "node:child_process"
const args = process.argv.slice(2),
  dir =
    "docs/extensions/qa-evidence/mcp-foundation-20261115/preview-candidate/" +
    args[0]
const output = dir + "/tool-results.json"
const command = [
  "--test",
  "--test-concurrency=1",
  "--test-reporter=tap",
  ...["producer", "protocol", "http"].map((n) => dir + "/" + n + ".mjs"),
]
const started = new Date().toISOString()
const r = cp.spawnSync(process.execPath, command, {
  encoding: "utf8",
  timeout: 60000,
  env: { ...process.env, TADAZZ_PREVIEW_QA_OUTPUT: output },
})
fs.writeFileSync(dir + "/run.log", r.stdout + r.stderr, { flag: "wx" })
fs.writeFileSync(
  dir + "/run.json",
  JSON.stringify(
    {
      runtime: process.version,
      platform: process.platform,
      command,
      started,
      ended: new Date().toISOString(),
      exit: r.status,
      signal: r.signal,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
console.log(r.stdout + r.stderr)
process.exitCode = r.status ?? 1
