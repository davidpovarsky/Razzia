import { defineConfig } from "@playwright/test"
import cleanup from "./playwright.cleanup-theme.config"

// The imported config enforces remote-only execution and isolated temporary storage.
export default defineConfig({
  ...cleanup,
  testMatch: ["branch-sync.spec.ts", "cleanup-legacy-flow.spec.ts"],
  outputDir: "test-results/branch-sync",
  reporter: [["list"], ["json", { outputFile: "test-results/branch-sync-report.json" }]],
})
