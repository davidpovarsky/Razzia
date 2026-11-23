import { defineConfig, devices } from "@playwright/test"
import baseline from "./site.baseline.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  ...baseline,
  testMatch: ["game.spec.ts", "host-presentation.spec.ts"],
  workers: 1,
  timeout: 150000,
  outputDir: "/evidence/phase-12-legacy-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-12-legacy.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
