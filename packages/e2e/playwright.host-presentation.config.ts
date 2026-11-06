import { defineConfig, devices } from "@playwright/test"
import { join } from "node:path"
import base from "./playwright.next.config"

const root = join(import.meta.dirname, "../..")

export default defineConfig({
  ...base,
  testDir: "tests",
  testMatch: "host-presentation.spec.ts",
  workers: 1,
  projects: [
    {
      name: "webkit-ipad",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1194, height: 834 },
      },
    },
  ],
  webServer: [
    {
      command: "node --import tsx src/index.ts",
      cwd: join(root, "packages/socket"),
      url: "http://127.0.0.1:3251/api/health",
      env: {
        CONFIG_PATH: join(root, "work/next-acceptance-config"),
        MANAGER_PASSWORD: "e2e-password",
        JWT_SECRET: "next-local-acceptance-secret-32-characters",
        SOCKET_PORT: "3251",
        GAME_SPEED: "3",
        TADA_PILOT_SECRET: "next-local-simulation-only",
      },
    },
    {
      command:
        "node --experimental-strip-types node_modules/vite/bin/vite.js preview --port 3250 --strictPort",
      cwd: join(root, "packages/web"),
      url: "http://127.0.0.1:3250",
      env: {
        CONFIG_PATH: join(root, "work/next-acceptance-config"),
        SOCKET_PORT: "3251",
        WEB_PORT: "3250",
      },
    },
  ],
})
