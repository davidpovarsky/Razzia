import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"
if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux")
  throw new Error("Isolated remote QA only")
export default defineConfig({
  ...site,
  testDir: "qa",
  testMatch:
    process.env.TDS_SITE_SLICE === "followup"
      ? /tds-site-(?:layout|account)\.spec\.ts/u
      : process.env.TDS_SITE_SLICE === "account"
        ? "tds-site-account.spec.ts"
        : /tds-site(?:-layout)?\.spec\.ts/u,
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
        outputFile:
          process.env.TDS_SITE_SLICE === "followup"
            ? "/evidence/phase-06-followup-browser.json"
            : process.env.TDS_SITE_SLICE === "account"
              ? "/evidence/phase-06-account-browser.json"
              : "/evidence/phase-06-browser.json",
      },
    ],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
