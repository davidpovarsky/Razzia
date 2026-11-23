import { defineConfig, devices } from "@playwright/test"
import site from "./site.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  ...site,
  grepInvert: /original editor save\/edit/u,
  workers: 1,
  outputDir: "/evidence/phase-12-site-regression-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-12-site-regression.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    {
      name: "webkit",
      // The original swipe helper uses Chromium's compositor CDP API.
      grepInvert: /original editor save\/edit|touch scrolling works/u,
      use: devices["Desktop Safari"],
    },
  ],
})
