import { defineConfig } from "@playwright/test"
if (process.env.TADAZZ_REMOTE_QA !== "1" || !process.env.TADAZZ_LAB_URL)
  throw new Error("Explicit remote lab only")
export default defineConfig({
  testDir: "tests",
  testMatch: "theme-lab.spec.ts",
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: "test-results/theme-lab",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/theme-lab-report.json" }],
  ],
  use: {
    baseURL: process.env.TADAZZ_LAB_URL,
    locale: "en-US",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
})
