import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { spawnSync } from "node:child_process"
const require = createRequire("/work/extensions/package.json")
const path = require.resolve("typescript/package.json"),
  version = JSON.parse(readFileSync(path, "utf8")).version
const result = spawnSync(
  process.execPath,
  [
    resolve(dirname(path), "bin/tsc"),
    "--noEmit",
    "--pretty",
    "false",
    "-p",
    new URL("tsconfig.json", import.meta.url).pathname,
  ],
  {
    cwd: "/work",
    stdio: "inherit",
    env: { ...process.env, GOMEMLIMIT: "640MiB" },
  },
)
console.log(
  JSON.stringify({
    scope:
      "V2A prototype and Node-only harness with transitive real Game imports",
    typescript: version,
    exit_code: result.status,
    signal: result.signal,
    full_project_check: false,
  }),
)
if (result.error) throw result.error
process.exitCode = result.status ?? 1
