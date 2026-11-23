import { defineConfig } from "@playwright/test"
import { mkdtempSync, mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Theme game/browser checks run only in isolated remote QA")
}

const root = join(import.meta.dirname, "../..")
const configPath = mkdtempSync(join(tmpdir(), "tadazz-theme-installation-"))
for (const path of ["quizz", "media", "extensions/quizzes"]) {
  mkdirSync(join(configPath, path), { recursive: true })
}

export default defineConfig({
  testDir: "tests",
  testMatch: "theme-installation-flow.spec.ts",
  outputDir: "test-results/theme-installation",
  timeout: 600_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/theme-installation-report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3180",
    actionTimeout: 30_000,
    locale: "en-US",
    trace: "off",
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
      command:
        "node --import tsx ../../scripts/qa/start-theme-installation-server.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3181/api/health",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: configPath,
        SOCKET_PORT: "3181",
        JWT_SECRET: "remote-theme-installation-QA-not-production-20261108",
        TADAZZ_ACCOUNTS_ENABLED: "true",
        TADAZZ_THEME_INSTALLER_ENABLED: "true",
        RESEND_API_KEY: "qa-no-network",
        TADAZZ_AUTH_EMAIL_FROM: "qa@example.invalid",
        GAME_SPEED: "5",
      },
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --port 3180 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3180",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: configPath,
        WEB_PORT: "3180",
        SOCKET_PORT: "3181",
        TADAZZ_ACCOUNTS_ENABLED: "true",
      },
    },
  ],
})
