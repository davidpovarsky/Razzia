import { defineConfig, devices } from "@playwright/test"
if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux")
  throw new Error("Isolated remote QA only")
export default defineConfig({
  testDir: "qa",
  testMatch: "tds-catalog.spec.ts",
  workers: 1,
  timeout: 45000,
  outputDir: "/evidence/catalog-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-05-browser.json" }],
  ],
  use: { baseURL: "http://127.0.0.1:4340", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
  webServer: {
    command: "pnpm ui:catalog:preview",
    url: "http://127.0.0.1:4340",
    reuseExistingServer: false,
  },
})
