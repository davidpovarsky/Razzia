import { defineConfig } from "@playwright/test"
import { createHmac } from "node:crypto"
import fs from "node:fs"
import { join } from "node:path"

if (process.platform !== "linux" || process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Package presentation QA requires isolated Linux")
}

const revision = process.env.TADAZZ_PACKAGE_PRESENTATION_SHA ?? ""
const sourceRun = process.env.TADAZZ_PACKAGE_PRESENTATION_SOURCE_RUN ?? ""
const configPath = process.env.TADAZZ_PACKAGE_QA_CONFIG_PATH ?? ""
const evidence = process.env.TADAZZ_PACKAGE_QA_EVIDENCE ?? ""

if (
  !/^[a-f0-9]{40}$/u.test(revision) ||
  !new RegExp(`^tadazz-codex-${revision.slice(0, 12)}-[a-f0-9]{8}$`, "u").test(
    sourceRun,
  ) ||
  !new RegExp(
    `^/evidence/package-staging-presentation-${revision.slice(
      0,
      12,
    )}-[a-f0-9]{8}$`,
    "u",
  ).test(configPath) ||
  evidence !== "/evidence/browser"
) {
  throw new Error(
    "Exact final revision, source run and isolated evidence paths required",
  )
}

const root = join(import.meta.dirname, "../..")
for (const directory of ["quizz", "media", "extensions/quizzes"]) {
  fs.mkdirSync(join(configPath, directory), { recursive: true })
}
fs.mkdirSync(evidence, { recursive: true })

const secret = "remote-package-QA-only-not-production-20261109"
const common = {
  CONFIG_PATH: configPath,
  TADAZZ_REMOTE_QA: "1",
  TADAZZ_ACCOUNTS_ENABLED: "true",
  TADAZZ_PACKAGE_INSTALLER_ENABLED: "true",
  TADAZZ_PACKAGE_RUNTIME_ENABLED: "true",
  TADAZZ_PACKAGE_PARENT_ORIGIN: "http://127.0.0.1:3190",
  TADAZZ_PACKAGE_RUNTIME_ORIGIN: "http://localhost:3192",
  JWT_SECRET: secret,
  SOCKET_PORT: "3191",
  GAME_SPEED: "1",
  TADAZZ_THEME_INSTALLER_ENABLED: "false",
  RESEND_API_KEY: "qa-no-network",
  TADAZZ_AUTH_EMAIL_FROM: "qa@example.invalid",
}

export default defineConfig({
  testDir: "tests",
  testMatch: ["package-question-sequence.spec.ts"],
  outputDir: join(evidence, "test-results"),
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [
    ["list"],
    ["json", { outputFile: join(evidence, "playwright-report.json") }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3190",
    actionTimeout: 20_000,
    locale: "en-US",
    trace: "off",
    video: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: `node --import tsx ${join(root, "scripts/qa/start-package-server.ts")}`,
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3191/api/health",
      reuseExistingServer: false,
      env: common,
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --configLoader runner --port 3190 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3190",
      reuseExistingServer: false,
      env: { ...common, WEB_PORT: "3190" },
    },
    {
      command: "node /runtime/runtime.mjs",
      cwd: root,
      url: "http://localhost:3192/health",
      reuseExistingServer: false,
      env: {
        ...common,
        TADAZZ_PACKAGE_STORE: join(configPath, "extensions/packages"),
        TADAZZ_RUNTIME_CAPABILITY_SECRET: createHmac("sha256", secret)
          .update("tadazz-package-runtime-v1")
          .digest("hex"),
      },
    },
  ],
})
