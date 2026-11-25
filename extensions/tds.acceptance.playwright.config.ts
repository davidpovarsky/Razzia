import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch: [
    "tds-acceptance.spec.ts",
    "tds-site.spec.ts",
    "tds-site-layout.spec.ts",
    "tds-site-account.spec.ts",
  ],
  workers: 1,
  timeout: 150000,
  outputDir: "/evidence/phase-12-route-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-12-routes.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
