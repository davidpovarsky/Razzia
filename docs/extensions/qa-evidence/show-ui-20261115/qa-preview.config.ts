import { defineConfig } from "../../../../node_modules/.pnpm/playwright@1.64.0/node_modules/playwright/test.js"

const address = new URL(process.env.TADAZZ_QA_BASE ?? "")
if (address.protocol !== "http:" || address.hostname !== "127.0.0.1" || !address.port || address.username || address.password) {
  throw new Error("qa:loopback-base-required")
}
export default defineConfig({
  testDir: ".",
  testMatch: "qa-preview.spec.ts",
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  outputDir: "/out/browser-results",
  use: { baseURL: address.origin, browserName: "chromium", screenshot: "only-on-failure", trace: "off" },
})
