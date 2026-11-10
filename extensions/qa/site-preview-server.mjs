import { spawn, spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const web = fileURLToPath(new URL("../../packages/web", import.meta.url))
const cli = "node_modules/vite/bin/vite.js"
const config = "../../extensions/site.vite.config.ts"
const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", cli, "build", "--config", config],
  { cwd: web, stdio: "inherit", windowsHide: true },
)

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

const preview = spawn(
  process.execPath,
  [
    "--experimental-strip-types",
    cli,
    "preview",
    "--config",
    config,
    "--host",
    "127.0.0.1",
    "--port",
    process.env.WEB_PORT ?? "4310",
    "--strictPort",
  ],
  { cwd: web, stdio: "inherit", windowsHide: true },
)
process.on("SIGINT", () => preview.kill())
process.on("SIGTERM", () => preview.kill())
preview.on("exit", (code) => process.exit(code ?? 0))
