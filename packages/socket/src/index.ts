import { createAdaptorServer } from "@hono/node-server"
import { recoverStartupOwnerJournals } from "@razzia/extensions/server"
import { recoverCreationReservations } from "@razzia/extensions/server"
import { resolveConfigRoot } from "@razzia/socket/services/config-scope"
import { app, createSocketServer } from "@razzia/socket/app"
import { initConfig } from "@razzia/socket/services/config"
import Registry from "@razzia/socket/services/registry"
import {
  checkAccountConfiguration,
  readStartupOwnerSnapshot,
} from "@razzia/socket/services/account-db"

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
