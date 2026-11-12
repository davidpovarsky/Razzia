import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch: "tds-host.spec.ts",
  workers: 1,
  timeout: 150000,
  outputDir: "/evidence/phase-08-host-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-08-host.json" }],
  ],
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
})
