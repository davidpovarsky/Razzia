const { spawnSync } = require("node:child_process")
const { pathToFileURL } = require("node:url")
const loader = require.resolve("tsx", { paths: ["/work/extensions"] })
const result = spawnSync(process.execPath, ["--import", pathToFileURL(loader).href, "/qa/native-roundtrip-before.ts"], { stdio: "inherit", env: { ...process.env, TSX_DISABLE_CACHE: "1", TSX_TSCONFIG_PATH: "/work/tsconfig.json", TADAZZ_ACCOUNTS_ENABLED: "false" } })
if (result.error) throw result.error
process.exit(result.status ?? 1)
