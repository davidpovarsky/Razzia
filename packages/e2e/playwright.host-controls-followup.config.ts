import { defineConfig } from "@playwright/test"
import base from "./playwright.platform-opening.config"
import { join } from "node:path"

const evidence = join(
  import.meta.dirname,
  "../../docs/extensions/plans/ux-followup-20261119/host-controls",
)

export default defineConfig({
  ...base,
  testMatch: ["host-followup.spec.ts"],
  outputDir: join(evidence, "playwright"),
  reporter: [
    ["list"],
    ["json", { outputFile: join(evidence, "playwright.json") }],
  ],
  use: {
    ...base.use,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    actionTimeout: 15000,
  },
})
