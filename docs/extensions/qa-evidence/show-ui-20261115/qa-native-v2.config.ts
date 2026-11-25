import base from "./qa-native.config.ts"
export default {
  ...base,
  testMatch: "qa-native-v2.spec.ts",
  outputDir: "/out/native-v2-browser-results",
}
