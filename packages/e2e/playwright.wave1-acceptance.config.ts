import { defineConfig, devices } from "@playwright/test"
import { CONFIG_PATH, MANAGER_PASSWORD } from "./utils/constants"
import fs from "fs"
import { join } from "path"

const root = join(import.meta.dirname, "../..")

if (!process.env.TEST_WORKER_INDEX) {
  fs.rmSync(CONFIG_PATH, { recursive: true, force: true })
  fs.mkdirSync(join(CONFIG_PATH, "quizz"), { recursive: true })
  fs.cpSync(
    join(import.meta.dirname, "fixtures/quizz"),
    join(CONFIG_PATH, "quizz"),
    { recursive: true },
  )
}

export default defineConfig({
  testDir: "tests",
  testMatch: /wave1-.*\.spec\.ts$/,
  outputDir: "test-results/wave1-completion",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3010",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node --import tsx src/index.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3011/api/health",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH,
        MANAGER_PASSWORD,
        SOCKET_PORT: "3011",
        JWT_SECRET: "e2e-wave1-secret-at-least-32-characters-long",
        GAME_SPEED: "10",
      },
    },
    {
      command: "node node_modules/vite/bin/vite.js preview --port 3010 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3010",
      reuseExistingServer: false,
      env: {
        NODE_OPTIONS: "--experimental-strip-types",
        WEB_PORT: "3010",
        SOCKET_PORT: "3011",
      },
    },
  ],
})
