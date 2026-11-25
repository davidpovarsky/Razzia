import { defineConfig, devices } from "@playwright/test"

// Read-only deployment smoke. Never register accounts, send mail or start games.
export default defineConfig({
  testDir: "qa",
  testMatch: "site-public-production.spec.ts",
  outputDir:
    "../docs/extensions/qa-evidence/unified-site-20261110/traces/production",
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  reporter: [["list"]],
  use: {
    baseURL: "https://tadazz.com",
    ...devices["Desktop Chrome"],
    channel: "msedge",
    trace: "off",
  },
})
