import { defineConfig, devices } from "@playwright/test"
import base from "../../site.playwright.config"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../../../", import.meta.url))
const node = process.execPath
const fixtureServer = Array.isArray(base.webServer)
  ? base.webServer.at(0)
  : base.webServer

if (!fixtureServer) {
  throw new Error("Consolidation site tests require the base fixture server")
}

export default defineConfig({
  ...base,
  testDir: "../../src/site/tests/browser",
  testMatch: ["oauth-login.spec.ts", "native-document-language.spec.ts"],
  outputDir: "./.results/site",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "./extensions/qa/consolidation/.results/site.json" },
    ],
  ],
  use: { ...base.use, baseURL: "http://127.0.0.1:4316" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: [
    {
      ...fixtureServer,
      command: `"${node}" --import tsx qa/site-fixture-server.ts`,
      url: "http://127.0.0.1:4317/api/health",
      env: { ...fixtureServer.env, SOCKET_PORT: "4317" },
    },
    {
      command: `"${node}" node_modules/vite/bin/vite.js --config ../../extensions/qa/consolidation/site.vite.config.ts --configLoader runner --host 127.0.0.1 --port 4316 --strictPort`,
      cwd: `${root}packages/web`,
      url: "http://127.0.0.1:4316",
      reuseExistingServer: false,
      env: {
        TADAZZ_SITE_ENABLED: "true",
        SOCKET_PORT: "4317",
        WEB_PORT: "4316",
      },
    },
  ],
})
