import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.TADAZZ_QA_PORT ?? "4193")
const origin = `https://127.0.0.1:${port}`
const runDir =
  process.env.TADAZZ_QA_RUN_DIR ??
  join(tmpdir(), `tadazz-pw-native-consent-${process.pid}`)

if (!process.env.TADAZZ_QA_RUN_DIR) {
  process.env.TADAZZ_QA_RUN_DIR = runDir
  process.env.TADAZZ_QA_OWNED_RUN_DIR = "1"
}

mkdirSync(runDir, { recursive: true })

const repoRoot = resolve(import.meta.dirname, "../../..")
const serverScript = resolve(import.meta.dirname, "playwright-server.ts")

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: ["**/native-consent.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
  },
  use: {
    baseURL: origin,
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
  webServer: {
    command: `"${process.execPath}" "${resolve(repoRoot, "extensions/node_modules/tsx/dist/cli.mjs")}" --tsconfig "${resolve(repoRoot, "tsconfig.json")}" "${serverScript}"`,
    cwd: repoRoot,
    url: origin,
    ignoreHTTPSErrors: true,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      TADAZZ_QA_PORT: String(port),
      TADAZZ_QA_RUN_DIR: runDir,
      TADAZZ_QA_OWNED_RUN_DIR: process.env.TADAZZ_QA_OWNED_RUN_DIR ?? "0",
    },
  },
})
