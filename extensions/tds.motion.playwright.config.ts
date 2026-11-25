import { defineConfig, devices } from "@playwright/test"

if (process.env.TADAZZ_REMOTE_QA !== "1" || process.platform !== "linux") {
  throw new Error("Isolated remote QA only")
}

export default defineConfig({
  testDir: "qa",
  testMatch: "tds-motion.spec.ts",
  workers: 1,
  timeout: 60000,
  outputDir: "/evidence/phase-10-motion-traces",
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/phase-10-motion.json" }],
  ],
  use: { baseURL: "http://127.0.0.1:4330", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
  webServer: {
    command:
      "pnpm --dir ../packages/web exec node --experimental-strip-types node_modules/vite/bin/vite.js --config ../../extensions/tds.fixture.vite.config.ts",
    env: { TDS_FIXTURE: "components" },
    url: "http://127.0.0.1:4330",
    reuseExistingServer: false,
  },
})
