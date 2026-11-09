import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests",
  testMatch: "live-production-smoke.spec.ts",
  workers: 1,
  timeout: 300000,
  expect: { timeout: 20000 },
  reporter: "list",
  outputDir: "../../work/live-production-smoke-results-20261107",
  use: {
    baseURL: "https://tadazz.com",
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
