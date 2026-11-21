import {
  createExtensionRoutes,
  createNativeCreationPort,
} from "@razzia/extensions/server"
import { accountsEnabled, activeAccount } from "../services/account-scope"
import { resolveConfigRoot } from "../services/config-scope"
import { auth } from "@razzia/socket/api/routes/auth"
import { contact } from "@razzia/socket/api/routes/contact"
import { accounts } from "@razzia/socket/api/routes/accounts"
import {
  clientAccess,
  managedClients,
} from "@razzia/socket/api/routes/managed-clients"
import { games } from "@razzia/socket/api/routes/games"
import { media } from "@razzia/socket/api/routes/media"
import { quizz } from "@razzia/socket/api/routes/quizz"
import { results } from "@razzia/socket/api/routes/results"
import { requireManager } from "@razzia/socket/api/middleware"
import { themeRoutes } from "@razzia/socket/api/extensions/theme-routes"
import { packageRoutes } from "@razzia/socket/api/extensions/package-routes"
import {
  deleteQuizz,
  getPath,
  getQuizzById,
  prepareNativeQuizCreation,
  saveQuizz,
  updateQuizz,
} from "@razzia/socket/services/config"
import { listMedia } from "@razzia/socket/services/media"
import { Hono } from "hono"
import { billingRoutes } from "@razzia/socket/api/extensions/billing-routes"
import { isSavedThemeMediaReferenced } from "@razzia/socket/services/theme-installation"

const extensionRoutes = createExtensionRoutes(
  {
    getPath,
    getQuizzById,
    updateQuizz,
    saveQuizz,
    deleteQuizz,
    listMedia,
    isThemeMediaReferenced: (name) => {
      const owner = activeAccount()

      return owner ? isSavedThemeMediaReferenced(owner, name) : false
    },
    creation:
      process.env.TADAZZ_C1_CREATION_PROTOTYPE === "true" &&
      process.platform === "linux"
        ? createNativeCreationPort({
            configuredRoot: resolveConfigRoot,
            accountsEnabled,
            activeOwner: activeAccount,
            getPath,
            prepare: prepareNativeQuizCreation,
          })
        : undefined,
  },
  requireManager,
)

const routes = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/auth", auth)
  .route("/accounts", accounts)
  .route("/managed-clients", managedClients)
  .route("/client-access", clientAccess)
  .route("/contact", contact)
  .route("/billing", billingRoutes)
  .route("/quizz", quizz)
  .route("/results", results)
  .route("/games", games)
  .route("/media", media)
  .route("/extensions", extensionRoutes)
  .route("/themes", themeRoutes)
  .route("/packages", packageRoutes)

export const api = routes

export type ApiType = typeof routes
