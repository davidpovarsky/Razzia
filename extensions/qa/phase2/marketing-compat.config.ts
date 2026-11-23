import { defineConfig } from "@playwright/test"
import { fileURLToPath } from "node:url"
import product from "./product.config"

/** Original site/layout regressions, with the same remote-only native fixture. */
export default defineConfig({
  ...product,
  testDir: fileURLToPath(new URL("../..", import.meta.url)),
  testMatch: [
    "src/site/tests/browser/site.spec.ts",
    "qa/tds-site-layout.spec.ts",
  ],
  grep: /public routes, catalogue, demo|marketing demo uses the native/u,
  outputDir: "./.results/marketing-compat",
  reporter: [
    ["list"],
    [
      "json",
      { outputFile: "extensions/qa/phase2/.results/marketing-compat.json" },
    ],
  ],
})
