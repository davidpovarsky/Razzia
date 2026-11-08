import { defineConfig } from "@playwright/test"
if (process.env.TADAZZ_REMOTE_QA !== "1")
  throw new Error("Original game regressions run only in isolated remote QA")
const { default: upstream } = await import("./playwright.config")
export default defineConfig(upstream, {
  testMatch: ["manager.spec.ts", "editor.spec.ts", "flow.spec.ts"],
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/upstream-parity-report.json" }],
  ],
})
