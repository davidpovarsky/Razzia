import { defineConfig } from "@playwright/test"

if (process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Remote only")
}

const { default: base } = await import("./playwright.config")

export default defineConfig(base, {
  testMatch: ["studio-native-parity.spec.ts"],
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/studio-native-parity.json" }],
  ],
})
