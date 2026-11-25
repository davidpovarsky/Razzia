import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "tests",
  testMatch: [
    "presenter-audio.spec.ts",
    "release-candidate-tzila.spec.ts",
    "tadazz-next-live.spec.ts",
    "host-presentation.spec.ts",
  ],
  workers: 1,
  timeout: 600000,
  expect: { timeout: 20000 },
  reporter: "list",
  outputDir: "../../work/release-candidate-results",
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
