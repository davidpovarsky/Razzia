import { createExtensionRoutes } from "@razzia/extensions/server"
import { auth } from "@razzia/socket/api/routes/auth"
import { games } from "@razzia/socket/api/routes/games"
import { media } from "@razzia/socket/api/routes/media"
import { quizz } from "@razzia/socket/api/routes/quizz"
import { results } from "@razzia/socket/api/routes/results"
import { requireManager } from "@razzia/socket/api/middleware"
import {
  deleteQuizz,
  getPath,
  getQuizzById,
  saveQuizz,
  updateQuizz,
} from "@razzia/socket/services/config"
import { listMedia } from "@razzia/socket/services/media"
import { Hono } from "hono"

const extensionRoutes = createExtensionRoutes(
  {
    getPath,
    getQuizzById,
    updateQuizz,
    saveQuizz,
    deleteQuizz,
    listMedia,
  },
  requireManager,
)

const routes = new Hono()
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/auth", auth)
  .route("/quizz", quizz)
  .route("/results", results)
  .route("/games", games)
  .route("/media", media)
  .route("/extensions", extensionRoutes)

export const api = routes

export type ApiType = typeof routes
