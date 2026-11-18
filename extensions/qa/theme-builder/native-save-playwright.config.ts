import base from "./playwright.config.ts"
export default {
  ...base,
  testMatch: "native-save.spec.ts",
  outputDir: "/out/native-save-browser-results",
  use: { ...base.use, screenshot: "off" },
}
