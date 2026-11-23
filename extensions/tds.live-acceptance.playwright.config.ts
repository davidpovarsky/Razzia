import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch: [
    "tds-stage-integration.spec.ts",
    "tds-host.spec.ts",
    "tds-roster.spec.ts",
    "tds-package-admin.spec.ts",
  ],
  workers: 1,
  timeout: 180000,
  outputDir: "/evidence/phase-12-live-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-12-live.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    // WebKit does not expose Chromium's clipboard permission grants. The real
    // clipboard scenario remains Chromium; the other live flows run in both.
    {
      name: "webkit",
      grepInvert: /display modes stay distinct/u,
      use: devices["Desktop Safari"],
    },
  ],
})
