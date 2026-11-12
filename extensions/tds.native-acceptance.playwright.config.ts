import { defineConfig, devices } from "@playwright/test"
import baseline from "./site.baseline.playwright.config"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

if (!Array.isArray(baseline.webServer)) {
  throw new Error("Expected the isolated API and native preview servers")
}

const nativeServers = baseline.webServer.map((server) => ({
  ...server,
  env: { ...server.env, GAME_SPEED: "1" },
}))

export default defineConfig({
  ...baseline,
  // Keep the real 30-second vote window for multiple WebKit player contexts.
  webServer: nativeServers,
  testDir: "qa",
  testMatch: "tds-native-game.spec.ts",
  workers: 1,
  timeout: 150000,
  // Results are authoritative only after the preserved 30-second vote expires.
  expect: { ...baseline.expect, timeout: 45000 },
  outputDir: "/evidence/phase-12-native-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-12-native.json" }],
  ],
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
})
