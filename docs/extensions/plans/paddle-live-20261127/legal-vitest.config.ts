import { defineConfig } from "vitest/config"
import pricing from "./pricing-vitest.config.ts"

export default defineConfig({
  ...pricing,
  test: {
    ...pricing.test,
    include: [
      "src/site/tests/legal-policies.test.ts",
      "src/site/tests/metadata-policy.test.ts",
    ],
  },
})
