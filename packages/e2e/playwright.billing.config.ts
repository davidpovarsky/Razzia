import { defineConfig } from "@playwright/test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
const root = join(import.meta.dirname, "../..")
const configPath = mkdtempSync(join(tmpdir(), "tadazz-billing-browser-"))
const env = {
  CONFIG_PATH: configPath,
  TADAZZ_BILLING_BROWSER_FIXTURE: "isolated-test-only",
  TADAZZ_ACCOUNTS_ENABLED: "true",
  TADAZZ_BILLING_ENABLED: "true",
  PADDLE_ENVIRONMENT: "sandbox",
  PADDLE_API_KEY: "synthetic-test-key",
  PADDLE_CLIENT_TOKEN: "test_synthetic-public-token",
  PADDLE_WEBHOOK_SECRET: "browser-fixture-signing-secret",
  JWT_SECRET: "billing-browser-only-at-least-32-characters",
  RESEND_API_KEY: "synthetic-unused",
  TADAZZ_AUTH_EMAIL_FROM: "test@example.invalid",
  SOCKET_PORT: "3191",
  WEB_PORT: "3190",
}

export default defineConfig({
  testDir: "tests",
  testMatch: "billing.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: "test-results/billing",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/billing-report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3190",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: [
    {
      command: "node --import tsx qa/billing-server.ts",
      cwd: join(root, "extensions"),
      url: "http://127.0.0.1:3191/api/health",
      reuseExistingServer: false,
      env,
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 3190 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3190",
      reuseExistingServer: false,
      env,
    },
  ],
})
