import { defineConfig } from "@playwright/test"
import { createHmac } from "node:crypto"
import fs from "node:fs"
import { join } from "node:path"

if (process.platform !== "linux" || process.env.TADAZZ_REMOTE_QA !== "1") {
  throw new Error("Package QA requires isolated Oracle Linux")
}

const root = join(import.meta.dirname, "../..")
const configPath =
  process.env.TADAZZ_PACKAGE_QA_CONFIG_PATH ??
  "/evidence/package-staging-config"

if (!/^\/evidence\/package-staging-[a-z0-9-]+$/u.test(configPath)) {
  throw new Error("Private package QA data path required")
}

for (const dir of ["quizz", "media", "extensions/quizzes"]) {
  fs.mkdirSync(join(configPath, dir), { recursive: true })
}
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
  testMatch: ["package-runtime.spec.ts", "package-runtime-load.spec.ts"],
  outputDir: "test-results/package-runtime",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [
    ["list"],
    ["json", { outputFile: "/evidence/package-browser-report.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3190",
    actionTimeout: 20_000,
    locale: "en-US",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium", viewport: { width: 1920, height: 1080 } },
    },
    {
      name: "webkit",
      use: {
        browserName: "webkit",
        viewport: { width: 1024, height: 768 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx ../../scripts/qa/start-package-server.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3191/api/health",
      reuseExistingServer: false,
      env: common,
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --port 3190 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3190",
      reuseExistingServer: false,
      env: { ...common, WEB_PORT: "3190" },
    },
    {
      command:
        "node --import ./extensions/node_modules/tsx/dist/loader.mjs extensions/qa/package-runtime-server.ts",
      cwd: root,
      // A ready file is not needed: the server returns 404 at its unprivileged root.
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
