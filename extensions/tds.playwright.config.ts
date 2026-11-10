import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("TDS browser QA requires the isolated Linux container")
}

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch: "tds-baseline.spec.ts",
  outputDir: "/evidence/traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/browser-results.json" }],
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
})
