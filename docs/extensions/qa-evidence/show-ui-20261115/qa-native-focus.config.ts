import base from "./qa-native.config.ts"
export default {
  ...base,
  use: { ...base.use, screenshot: "off" },
}
