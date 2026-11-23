import playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
import type * as Playwright from "../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"
const { defineConfig } = playwright as unknown as typeof Playwright
const url = new URL(process.env.TADAZZ_QA_BASE ?? "")

if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port) {
  throw new Error("qa:loopback-required")
}

export default defineConfig({
  testDir: ".",
  testMatch: "theme-builder.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "/out/ui-browser-results",
  timeout: 60000,
  use: { baseURL: url.origin, screenshot: "only-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
})
