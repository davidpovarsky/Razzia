import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests",
  testMatch: "live-production-tzila.spec.ts",
  workers: 1,
  timeout: 900000,
  expect: { timeout: 20000 },
  reporter: "list",
  outputDir: "../../work/live-candidate-results-20261106",
  use: {
    baseURL: "http://127.0.0.1:4259",
    locale: "en-US",
    video: "on",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
})
