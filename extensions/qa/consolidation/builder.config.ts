import { defineConfig } from "@playwright/test"
import site from "./site.config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  testDir: "../theme-builder",
  testMatch: "account-boundary.spec.ts",
  workers: 1,
  timeout: 60_000,
  outputDir: "./.results/builder",
  reporter: "list",
  projects: site.projects,
  use: { baseURL: "http://127.0.0.1:4318" },
  webServer: {
    command: `"${process.execPath}" node_modules/vite/bin/vite.js --config qa/consolidation/builder.vite.config.ts --configLoader runner --host 127.0.0.1 --port 4318 --strictPort`,
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    url: "http://127.0.0.1:4318",
    reuseExistingServer: false,
  },
})
