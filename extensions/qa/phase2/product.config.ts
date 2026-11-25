import { defineConfig, devices } from "@playwright/test"
import base from "../../site.playwright.config"
import { fileURLToPath } from "node:url"

const servers = Array.isArray(base.webServer) ? base.webServer : []

if (servers.length !== 2) {
  throw new Error("Expected isolated API and website fixtures")
}

const root = fileURLToPath(new URL("../../../", import.meta.url))

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error(
    "Phase 2 browser checks run only in the isolated Tadazz server QA container",
  )
}

export default defineConfig({
  ...base,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 768 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
  testDir: ".",
  testMatch: "product.spec.ts",
  outputDir: "./.results/product",
  timeout: 120_000,
  reporter: [
    ["list"],
    ["json", { outputFile: "extensions/qa/phase2/.results/product.json" }],
  ],
  use: {
    ...base.use,
    baseURL: "http://127.0.0.1:4326",
    viewport: { width: 1366, height: 768 },
  },
  webServer: [
    {
      ...servers[0],
      command: `"${process.execPath}" --import tsx qa/phase2/site-fixture-server.ts`,
      url: "http://127.0.0.1:4327/api/health",
      env: {
        ...servers[0].env,
        SOCKET_PORT: "4327",
        GAME_SPEED: "1",
        TADAZZ_THEME_INSTALLER_ENABLED: "true",
        TADAZZ_INLINE_GAME_PREVIEW_ENABLED: "true",
        TADAZZ_PUBLIC_GAME_PREVIEW_ENABLED: "true",
      },
    },
    {
      ...servers[1],
      command: `"${process.execPath}" node_modules/vite/bin/vite.js --config ../../extensions/qa/phase2/site.vite.config.ts --configLoader runner --host 127.0.0.1 --port 4326 --strictPort`,
      cwd: `${root}packages/web`,
      url: "http://127.0.0.1:4326",
      env: {
        ...servers[1].env,
        SOCKET_PORT: "4327",
        WEB_PORT: "4326",
        TADAZZ_ACCOUNTS_ENABLED: "true",
        VITE_TADAZZ_INLINE_GAME_PREVIEW: "true",
        VITE_TADAZZ_THEME_BUILDER_ENABLED: "true",
      },
    },
  ],
})
