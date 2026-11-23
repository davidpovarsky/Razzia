import { defineConfig } from "@playwright/test"
import base from "./playwright.config"

// Preserve the stock fixture setup and both servers. Only this dedicated suite
// uses real two-second lead-ins; the ordinary generic suite stays accelerated.
if (!Array.isArray(base.webServer)) {
  throw new Error("The normal-speed acceptance expects the stock server array")
}

let backendCount = 0
const webServer = base.webServer.map((server) => {
  if (server.env?.GAME_SPEED === undefined) {
    return server
  }

  if (server.env.GAME_SPEED !== "10") {
    throw new Error(
      "The generic backend speed changed; review this dedicated override",
    )
  }

  backendCount += 1

  return { ...server, env: { ...server.env, GAME_SPEED: "1" } }
})

if (backendCount !== 1) {
  throw new Error(
    "Exactly one stock backend must receive the normal-speed override",
  )
}

export default defineConfig({
  ...base,
  testMatch: "**/answers-only-and-explanations.acceptance.ts",
  outputDir: "test-results/answers-only-normal-speed",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalTimeout: 660_000,
  webServer,
})
