import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"

const root = process.cwd()
const require = createRequire(import.meta.url)
const packagePath = require.resolve("typescript/package.json")
const version = JSON.parse(readFileSync(packagePath, "utf8")).version
// TypeScript 7's root export is version metadata, not the TS6 compiler API.
// Use the installed CLI against a single-route project and its imports.
const result = spawnSync(
  process.execPath,
  [
    resolve(dirname(packagePath), "bin/tsc"),
    "--noEmit",
    "--pretty",
    "false",
    "-p",
    resolve(
      root,
      "extensions/src/telephony/pilot-runtime/phone-route-typecheck.tsconfig.json",
    ),
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, GOMEMLIMIT: "768MiB" },
  },
)
if (result.error) throw result.error
console.log(
  JSON.stringify({
    scope: "single route project and transitive imports",
    typescript: version,
    exit_code: result.status,
    signal: result.signal,
    full_project_check: false,
  }),
)
process.exitCode = result.status ?? 1
