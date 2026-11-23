import { defineConfig, devices } from "@playwright/test"
import {
  CONFIG_PATH,
  MANAGER_PASSWORD,
  TZILA_PILOT_SECRET,
} from "./utils/constants"
import fs from "fs"
import { join } from "path"

const root = join(import.meta.dirname, "../..")

if (!process.env.TEST_WORKER_INDEX) {
  fs.rmSync(CONFIG_PATH, { recursive: true, force: true })
  fs.mkdirSync(join(CONFIG_PATH, "quizz"), { recursive: true })
  fs.mkdirSync(join(CONFIG_PATH, "extensions", "quizzes"), { recursive: true })
  fs.mkdirSync(join(CONFIG_PATH, "media"), { recursive: true })

  // Copy fixtures
  fs.cpSync(
    join(import.meta.dirname, "fixtures/quizz"),
    join(CONFIG_PATH, "quizz"),
    { recursive: true },
  )
}

export default defineConfig({
  globalSetup: "./utils/seed-tzila-show.ts",
  testDir: "tests",
  testMatch:
    /(p0-tzila-acceptance|tzila-public-stage-and-toolbar|tzila-exact-player-screen|media-appearance-stage-acceptance|cinematic-video-overlays)\.spec\.ts$/,
  outputDir: "test-results/p0-acceptance",
  timeout: 240_000,
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
      timeout: 120_000,
      env: {
        CONFIG_PATH,
        TADAZZ_ACCOUNTS_ENABLED: "false",
        MANAGER_PASSWORD,
        TADA_PILOT_SECRET: TZILA_PILOT_SECRET,
        SOCKET_PORT: "3011",
        JWT_SECRET: "e2e-p0-tzila-secret-at-least-32-chars",
        GAME_SPEED: "1",
      },
    },
    {
      command:
        "node node_modules/vite/bin/vite.js preview --port 3010 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3010",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        CONFIG_PATH,
        TADAZZ_ACCOUNTS_ENABLED: "false",
        NODE_OPTIONS: "--experimental-strip-types",
        WEB_PORT: "3010",
        SOCKET_PORT: "3011",
      },
    },
  ],
})
