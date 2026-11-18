import { defineConfig, devices } from "@playwright/test"
import { join } from "node:path"

const baseURL = process.env.TADAZZ_QA_WEB_URL ?? "http://127.0.0.1:3180"

if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error(
    "Editor follow-up checks require an isolated loopback fixture",
  )
}

const evidenceName = process.env.TADAZZ_QA_EVIDENCE_NAME ?? "import-acceptance"

if (!/^[a-z0-9-]+$/.test(evidenceName)) {
  throw new Error("Expected an evidence directory name")
}

const evidence = join(
  import.meta.dirname,
  "../../docs/extensions/plans/editor-hebrew-20261118",
  evidenceName,
)

export default defineConfig({
  testDir: "tests",
  testMatch: [
    "wave1-show-import-acceptance.spec.ts",
    "host-presentation.spec.ts",
  ],
  outputDir: join(evidence, "test-results"),
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: join(evidence, "result.json") }]],
  use: {
    baseURL,
    locale: "en-US",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(process.platform === "win32" ? { channel: "msedge" } : {}),
      },
    },
  ],
})
