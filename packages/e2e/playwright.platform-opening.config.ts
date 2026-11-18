import { defineConfig, devices } from "@playwright/test"
import fs from "node:fs"
import { join } from "node:path"

const root = join(import.meta.dirname, "../..")
const configPath =
  process.env.PLATFORM_OPENING_QA_CONFIG ??
  join(root, "work/platform-opening-qa-20261119")
fs.mkdirSync(join(configPath, "quizz"), { recursive: true })

export default defineConfig({
  testDir: "tests",
  testMatch: "platform-opening.spec.ts",
  outputDir: "test-results/platform-opening",
  timeout: 90000,
  expect: { timeout: 20000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3260",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLATFORM_OPENING_QA_BROWSER,
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx src/index.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3261/api/health",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: configPath,
        MANAGER_PASSWORD: "e2e-password",
        JWT_SECRET: "platform-opening-local-fixture-32-characters",
        SOCKET_PORT: "3261",
        GAME_SPEED: "3",
      },
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js --config ../e2e/vite.platform-opening.config.ts --host 127.0.0.1 --port 3260 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3260",
      timeout: 120000,
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: configPath,
        SOCKET_PORT: "3261",
        WEB_PORT: "3260",
      },
    },
  ],
})
