import { defineConfig, devices } from "@playwright/test"
import components from "./tds.components.playwright.config"
import site from "./site.playwright.config"
const integration = process.env.TDS_STAGE_INTEGRATION === "1"
export default defineConfig({
  ...(integration ? site : components),
  testDir: "qa",
  testMatch: integration
    ? "tds-stage-integration.spec.ts"
    : "tds-stage.spec.ts",
  workers: 1,
  outputDir: "/evidence/phase-07-traces",
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile: `/evidence/phase-07-${integration ? "stage-integration" : "stage"}.json`,
      },
    ],
  ],
  use: {
    ...site.use,
    baseURL: `http://127.0.0.1:${integration ? "4310" : "4330"}`,
    trace: "retain-on-failure",
  },
  projects: integration
    ? [{ name: "chromium", use: devices["Desktop Chrome"] }]
    : [
        { name: "chromium", use: devices["Desktop Chrome"] },
        { name: "webkit", use: devices["Desktop Safari"] },
      ],
  webServer: integration
    ? site.webServer
    : { ...(components.webServer as object), env: { TDS_FIXTURE: "stage" } },
})
