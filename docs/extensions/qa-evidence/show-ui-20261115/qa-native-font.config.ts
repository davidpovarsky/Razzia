import base from "./qa-native.config.ts"
export default {
  ...base,
  testMatch: "qa-native-font.spec.ts",
  outputDir: "/out/native-font-browser-results",
  timeout: 120000,
}
