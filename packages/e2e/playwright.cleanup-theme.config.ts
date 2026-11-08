import { defineConfig } from "@playwright/test"
import fs from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const root = join(import.meta.dirname, "../..")
// Never reuse .config, operational data, another worktree or a running server.
const configPath =
  process.env.TADAZZ_CLEANUP_TEST_CONFIG ??
  fs.mkdtempSync(join(tmpdir(), "tadazz-cleanup-theme-"))
process.env.TADAZZ_CLEANUP_TEST_CONFIG = configPath
for (const directory of ["quizz", "media", "extensions/quizzes"])
  fs.mkdirSync(join(configPath, directory), { recursive: true })

export default defineConfig({
  testDir: "tests",
  testMatch: "cleanup-theme.spec.ts",
  outputDir: "test-results/cleanup-theme",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/cleanup-theme-report.json" }],
  ],
  use: {
    actionTimeout: 10_000,
    baseURL: "http://127.0.0.1:3170",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1366, height: 768 } },
    },
    {
      name: "webkit-ipad",
      use: {
        browserName: "webkit",
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx src/index.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3171/api/health",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: configPath,
        MANAGER_PASSWORD: "e2e-password",
        JWT_SECRET: "cleanup-test-only-at-least-32-characters",
        SOCKET_PORT: "3171",
        TADAZZ_ACCOUNTS_ENABLED: "false",
        GAME_SPEED: "20",
      },
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --port 3170 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3170",
      reuseExistingServer: false,
      env: { CONFIG_PATH: configPath, WEB_PORT: "3170", SOCKET_PORT: "3171" },
    },
  ],
})
