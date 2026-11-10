import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"
const root = fileURLToPath(new URL("..", import.meta.url))
const node24 = process.env.TADAZZ_TEST_NODE ?? process.execPath

export default defineConfig({
  testDir: "src/site/tests/browser",
  outputDir: "../docs/extensions/qa-evidence/unified-site-20261110/traces",
  timeout: 150000,
  expect: { timeout: 15000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "../docs/extensions/qa-evidence/unified-site-20261110/browser-results.json",
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4310",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "edge-chromium",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: [
    {
      command: `"${node24}" --import tsx qa/site-fixture-server.ts`,
      cwd: join(root, "extensions"),
      url: "http://127.0.0.1:4311/api/health",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: join(root, "extensions/.site-test-config"),
        SOCKET_PORT: "4311",
        TADAZZ_ACCOUNTS_ENABLED: "true",
        TADAZZ_PACKAGE_RUNTIME_ENABLED: "true",
        JWT_SECRET: "isolated-site-test-secret-at-least-32-characters",
        RESEND_API_KEY: "local-test-mail-only",
        TADAZZ_AUTH_EMAIL_FROM: "test@example.invalid",
        GAME_SPEED: "10",
      },
    },
    {
      command: `"${node24}" ../../extensions/qa/site-preview-server.mjs`,
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:4310",
      reuseExistingServer: false,
      env: {
        TADAZZ_SITE_ENABLED: "true",
        SOCKET_PORT: "4311",
        WEB_PORT: "4310",
      },
    },
  ],
})
