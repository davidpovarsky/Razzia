import base from "./playwright.config.ts"
export default {
  ...base,
  testMatch: "oauth-consent.spec.ts",
  outputDir: "/out/oauth-browser-results",
  use: { ...base.use, screenshot: "off" },
}
