import { defineConfig, devices } from "@playwright/test"
import { join } from "node:path"

const evidence = join(
  import.meta.dirname,
  "../../docs/extensions/plans/editor-hebrew-20261118/followups/host-presentation",
)

export default defineConfig({
  testDir: "tests",
  testMatch: ["host-presentation.spec.ts"],
  outputDir: join(evidence, "playwright"),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: join(evidence, "playwright.json") }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3190",
    locale: "en-US",
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
})
