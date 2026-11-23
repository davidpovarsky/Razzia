import { cpSync, chmodSync, readFileSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
const root = "/tmp/font-tamper-fixture"
cpSync("/tmp/native-font-fixture", root, { recursive: true })
const path = `${root}/fonts/files/rubik-latin-wght-normal.woff2`
const original = readFileSync(path)
chmodSync(path, 0o644)
writeFileSync(path, Buffer.alloc(original.length))
const result = spawnSync(
  process.execPath,
  [
    "/out/harness-server-build/qa-fixture-server.js",
    root,
    readFileSync("/out/font-browser-sha.txt", "utf8"),
    "/out/font-artifact-index.json",
    "v2",
    "rubik",
  ],
  { encoding: "utf8", timeout: 10000 },
)
writeFileSync(
  "/out/tampered-font-startup.json",
  JSON.stringify(
    {
      status: result.status,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      originalSizeRetained: original.length,
      changedOnlyRamFixture: true,
    },
    null,
    2,
  ),
)
if (
  result.status !== 1 ||
  result.stdout.includes("QA_PORT=") ||
  !result.stderr.includes(
    "qa:hash-mismatch:fonts/files/rubik-latin-wght-normal.woff2",
  )
)
  throw new Error("font:tamper-not-rejected-before-listen")
