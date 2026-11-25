import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  isQuizExtrasV2,
  upgradeLegacyExtrasToV2,
} from "../../core/studio-migrate"
import { gamePosterUrlSchema } from "../../core/game-poster"
import { CompositeStorageService } from "../storage/service"
import { readSidecar, writeSidecar } from "../storage/sidecar"

/** Existing importer validates/remaps everything; only storage is private staging. */
export function stagePackageGame(
  payload: unknown,
  stagingRoot: string,
  posterUrl?: string,
) {
  const bases = new Map<string, unknown>()
  const getPath = (relative = "") => path.join(stagingRoot, relative)
  const service = new CompositeStorageService({
    getPath,
    getQuizzById: (id) => bases.get(id),
    saveQuizz: (data) => {
      const id = randomUUID()
      bases.set(id, { id, ...quizzValidator.parse(data) })

      return { id }
    },
    updateQuizz: (id, data) => {
      bases.set(id, data)

      return { id }
    },
    deleteQuizz: (id) => {
      bases.delete(id)
    },
  })
  const result = service.importEnhancedBundle(payload)

  if (posterUrl) {
    const existing = readSidecar(getPath, result.quizId)
    const extras = isQuizExtrasV2(existing)
      ? existing
      : upgradeLegacyExtrasToV2(
          quizzValidator.parse(bases.get(result.quizId)),
          existing,
          result,
        )

    writeSidecar(getPath, result.quizId, {
      ...extras,
      authoring: {
        ...extras.authoring,
        posterUrl: gamePosterUrlSchema.parse(posterUrl),
      },
    })
  }

  const files = [
    {
      relative: `quizz/${result.quizId}.json`,
      bytes: Buffer.from(JSON.stringify(bases.get(result.quizId))),
    },
  ]
  const sidecar = path.join(
    stagingRoot,
    `extensions/quizzes/${result.quizId}.json`,
  )

  if (fs.existsSync(sidecar)) {
    files.push({
      relative: `extensions/quizzes/${result.quizId}.json`,
      bytes: fs.readFileSync(sidecar),
    })
  }

  return { ...result, files }
}
