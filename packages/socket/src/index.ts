import { createAdaptorServer } from "@hono/node-server"
import {
  recoverStartupOwnerJournals,
  recoverCreationReservations,
} from "@razzia/extensions/server"
import { resolveConfigRoot } from "@razzia/socket/services/config-scope"
import { initConfig } from "@razzia/socket/services/config"
import {
  checkAccountConfiguration,
  readStartupOwnerSnapshot,
} from "@razzia/socket/services/account-db"

async function startServer() {
  const { app, createSocketServer } = await import("@razzia/socket/app")
  const { default: Registry } = await import("@razzia/socket/services/registry")
  const WS_PORT = Number(process.env.SOCKET_PORT) || 3001

  // C1 reads only its trusted private registry, including explicit tenant roots.
  readStartupOwnerSnapshot()
  recoverCreationReservations(resolveConfigRoot())
  initConfig()
  checkAccountConfiguration()

  // Startup journal recovery: recover pending composite-save and media-delete transactions before accepting requests
  recoverStartupOwnerJournals(readStartupOwnerSnapshot())

  process.on("uncaughtException", (error) => {
    console.error("Uncaught exception:", error)
  })

  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason)
  })

  const server = createAdaptorServer({ fetch: app.fetch })

  createSocketServer(server)

  server.listen(WS_PORT, () => {
    console.log(`Server running on port ${WS_PORT}`)
  })

  process.on("SIGINT", () => {
    Registry.getInstance().cleanup()
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    Registry.getInstance().cleanup()
    process.exit(0)
  })
}

async function main() {
  if (process.argv.slice(2).includes("--managed-client-owner")) {
    if (process.argv.length !== 3) {
      throw new Error("Unexpected managed-client owner arguments")
    }

    checkAccountConfiguration()
    const { runManagedClientOwnerCli } =
      await import("@razzia/socket/services/managed-client-owner-cli")
    await runManagedClientOwnerCli()

    return
  }

  await startServer()
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : "Server startup failed",
  )
  process.exitCode = 1
})
