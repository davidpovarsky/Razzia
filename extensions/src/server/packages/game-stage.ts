import fs from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { CompositeStorageService } from "../storage/service"

/** Existing importer validates/remaps everything; only storage is private staging. */
export function stagePackageGame(payload: unknown, stagingRoot: string) {
  const bases = new Map<string, unknown>()
  const service = new CompositeStorageService({
    getPath: (p = "") => path.join(stagingRoot, p),
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
