import { defineConfig, devices } from "@playwright/test"
import { CONFIG_PATH, MANAGER_PASSWORD } from "./utils/constants"
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

  // Copy Tzila quiz & sidecar & media
  const repoConfig = join(root, "config")
  if (fs.existsSync(join(repoConfig, "quizz/build-our-FcsLmJBP.json"))) {
    fs.cpSync(
      join(repoConfig, "quizz/build-our-FcsLmJBP.json"),
      join(CONFIG_PATH, "quizz/build-our-FcsLmJBP.json"),
    )
  }
  if (fs.existsSync(join(repoConfig, "extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ.json"))) {
    fs.cpSync(
      join(repoConfig, "extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ.json"),
      join(CONFIG_PATH, "extensions/quizzes/0KTcUgc0uvF_vGWYHrpTJ.json"),
    )
  }
  if (fs.existsSync(join(repoConfig, "media"))) {
    fs.cpSync(
      join(repoConfig, "media"),
      join(CONFIG_PATH, "media"),
      { recursive: true },
    )
  }
}

export default defineConfig({
  testDir: "tests",
  testMatch: /(p0-tzila-acceptance|tzila-public-stage-and-toolbar|tzila-exact-player-screen|media-appearance-stage-acceptance)\.spec\.ts$/,
  outputDir: "test-results/p0-acceptance",
  timeout: 150_000,
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
        MANAGER_PASSWORD,
        SOCKET_PORT: "3011",
        JWT_SECRET: "e2e-p0-tzila-secret-at-least-32-chars",
        GAME_SPEED: "1",
      },
    },
    {
      command: "node node_modules/vite/bin/vite.js preview --port 3010 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3010",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        CONFIG_PATH,
        NODE_OPTIONS: "--experimental-strip-types",
        WEB_PORT: "3010",
        SOCKET_PORT: "3011",
      },
    },
  ],
})
