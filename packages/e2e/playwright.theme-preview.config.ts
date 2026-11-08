import { defineConfig } from "@playwright/test"
import { resolve } from "node:path"

if (
  process.env.TADAZZ_REMOTE_QA !== "1" ||
  !process.env.TADAZZ_THEME_SERVER ||
  !process.env.TADAZZ_THEME_TOKEN ||
  !process.env.TADAZZ_THEME_ARTIFACT ||
  !process.env.TADAZZ_THEME_WORKSPACE
) {
  throw new Error(
    "Requires an authenticated artifact and the authorized remote QA environment",
  )
}

const output = resolve(
  process.env.TADAZZ_THEME_QA_OUTPUT ?? "test-results/theme-preview",
)

export default defineConfig({
  testDir: "tests",
  testMatch: "theme-installation-preview.spec.ts",
  outputDir: resolve(output, "browser"),
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: resolve(output, "report.json") }],
  ],
  use: {
    baseURL: process.env.TADAZZ_THEME_SERVER,
    actionTimeout: 30_000,
    locale: "en-US",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1366, height: 768 } },
    },
    {
      name: "webkit-ipad",
      use: {
        browserName: "webkit",
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
