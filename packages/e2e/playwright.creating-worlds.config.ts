import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  metadata: { tzilaRepairCandidate: true },
  testDir: "tests",
  workers: 1,
  timeout: 600_000,
  expect: { timeout: 20_000 },
  reporter: "list",
  outputDir: "../../work/creating-worlds-results",
  use: {
    baseURL: process.env.TADAZZ_TEST_URL ?? "http://127.0.0.1:4263",
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
