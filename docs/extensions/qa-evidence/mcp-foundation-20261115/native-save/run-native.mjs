import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
const here = path.dirname(fileURLToPath(import.meta.url))
const label = process.argv[2]
if (!/^native-candidate-\d{2}$/.test(label ?? ""))
  throw Error("Select immutable bundle")
const run = label.replace("candidate", "run")
if (fs.existsSync(path.join(here, run + ".json")))
  throw Error("Preserve existing evidence")
const bundle = path.join(here, label + ".mjs")
const linux = bundle.replaceAll("\\", "/").replace(/^C:/, "/mnt/c")
const args = [
  "-d",
  "Ubuntu",
  "--exec",
  "env",
  "TMPDIR=/home/david/tadazz-f-native-save-evidence-20261115",
  "/home/david/.local/bin/node",
  "--test",
  "--test-reporter=tap",
  linux,
]
const started = new Date().toISOString()
const result = spawnSync("wsl.exe", args, { encoding: "utf8", timeout: 60000 })
const log = result.stdout + result.stderr
fs.writeFileSync(path.join(here, run + ".log"), log, { flag: "wx" })
const sha = (value) => createHash("sha256").update(value).digest("hex")
fs.writeFileSync(
  path.join(here, run + ".json"),
  JSON.stringify(
    {
      command: ["wsl.exe", ...args],
      started,
      ended: new Date().toISOString(),
      exit: result.status,
      signal: result.signal,
      bundleSha256: sha(fs.readFileSync(bundle)),
      logSha256: sha(log),
      oracleJob: false,
      actualBrowser: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
)
console.log(JSON.stringify({ exit: result.status, signal: result.signal }))
console.log(log)
process.exitCode = result.status ?? 1
