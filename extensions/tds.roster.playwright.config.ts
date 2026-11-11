import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux")
  throw new Error("Isolated remote QA only")

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch: "tds-roster.spec.ts",
  workers: 1,
  timeout: 180000,
  outputDir: "/evidence/phase-09-roster-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-09-roster.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
