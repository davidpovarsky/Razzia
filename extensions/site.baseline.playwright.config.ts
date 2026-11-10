import { defineConfig, devices } from "@playwright/test"
import { fileURLToPath } from "node:url"
import { mkdirSync, cpSync } from "node:fs"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const fixtures = join(root, "packages/e2e/.config")
// Isolated worktree fixtures only, no recursive deletion or live configuration.
mkdirSync(join(fixtures, "quizz"), { recursive: true })
cpSync(join(root, "packages/e2e/fixtures/quizz"), join(fixtures, "quizz"), {
  recursive: true,
})
const node24 = process.env.TADAZZ_TEST_NODE ?? process.execPath

export default defineConfig({
  testDir: join(root, "packages/e2e/tests"),
  testMatch: ["editor.spec.ts", "game.spec.ts", "host-presentation.spec.ts"],
  outputDir:
    "../docs/extensions/qa-evidence/unified-site-20261110/traces/baseline",
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "../docs/extensions/qa-evidence/unified-site-20261110/baseline-browser-results.json",
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4320",
    locale: "en-US",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "edge-chromium-feature-off",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
    {
      name: "feature-off-boundary",
      testDir: join(root, "extensions/qa"),
      testMatch: ["site-flag-off.spec.ts", "site-runtime.spec.ts"],
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
  webServer: [
    {
      command: `"${node24}" --import tsx qa/site-fixture-server.ts`,
      cwd: join(root, "extensions"),
      url: "http://127.0.0.1:4321/api/health",
      reuseExistingServer: false,
      env: {
        CONFIG_PATH: fixtures,
        SOCKET_PORT: "4321",
        TADAZZ_ACCOUNTS_ENABLED: "false",
        MANAGER_PASSWORD: "e2e-password",
        JWT_SECRET: "isolated-feature-off-test-secret-32-characters",
        GAME_SPEED: "10",
      },
    },
    {
      command: `"${node24}" ../../extensions/qa/site-preview-server.mjs`,
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:4320",
      reuseExistingServer: false,
      env: {
        TADAZZ_SITE_ENABLED: "false",
        SOCKET_PORT: "4321",
        WEB_PORT: "4320",
      },
    },
  ],
})
