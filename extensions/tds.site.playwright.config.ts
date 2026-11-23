import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

const slice = process.env.TDS_SITE_SLICE
let testMatch: string | RegExp = /tds-site(?:-layout)?\.spec\.ts/u
let outputFile = "/evidence/phase-06-browser.json"

if (slice === "followup") {
  testMatch = /tds-site-(?:layout|account)\.spec\.ts/u
  outputFile = "/evidence/phase-06-followup-browser.json"
} else if (slice === "account") {
  testMatch = "tds-site-account.spec.ts"
  outputFile = "/evidence/phase-06-account-browser.json"
}

export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch,
  grep:
    process.env.TDS_SITE_SLICE === "followup"
      ? /account config|marketing demo/u
      : undefined,
  outputDir: "/evidence/site-platform-traces",
  workers: 1,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile,
      },
    ],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
