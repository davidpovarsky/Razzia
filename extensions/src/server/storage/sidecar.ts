import fs from "node:fs"
import path from "node:path"
import { quizExtrasV1Schema, type QuizExtrasV1 } from "../../core/index"

export interface StorageInjections {
  getPath: (subPath?: string) => string
  getQuizzById: (id: string) => unknown
  saveQuizz: (data: unknown) => { id: string }
  updateQuizz: (id: string, data: unknown) => { id: string }
  deleteQuizz: (id: string) => void
}

export const getSidecarDirectory = (
  getPath: (subPath?: string) => string,
): string => {
  const dir = getPath("extensions/quizzes")

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  return dir
}

export const getSidecarFilePath = (
  getPath: (subPath?: string) => string,
  quizId: string,
): string => {
  const cleanId = path.basename(quizId).replace(/\.json$/i, "")
  const dir = getSidecarDirectory(getPath)

  return path.join(dir, `${cleanId}.json`)
}

export const sidecarExists = (
  getPath: (subPath?: string) => string,
  quizId: string,
): boolean => {
  const filePath = getSidecarFilePath(getPath, quizId)

  return fs.existsSync(filePath)
}

export const readSidecar = (
  getPath: (subPath?: string) => string,
  quizId: string,
): QuizExtrasV1 | null => {
  const filePath = getSidecarFilePath(getPath, quizId)

  if (!fs.existsSync(filePath)) {
    return null
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8")
    const parsed = JSON.parse(raw) as unknown
    const validated = quizExtrasV1Schema.safeParse(parsed)

    if (!validated.success) {
      console.warn(
        `[Sidecar] Warning: invalid sidecar at ${filePath}:`,
        validated.error.issues,
      )

      return null
    }

    return validated.data
  } catch (error) {
    console.warn(`[Sidecar] Failed to read sidecar at ${filePath}:`, error)

    return null
  }
}

export const writeSidecar = (
  getPath: (subPath?: string) => string,
  quizId: string,
  extras: QuizExtrasV1,
): void => {
  const filePath = getSidecarFilePath(getPath, quizId)
  const content = JSON.stringify(extras, null, 2)

  fs.writeFileSync(filePath, content, "utf-8")
}

export const deleteSidecar = (
  getPath: (subPath?: string) => string,
  quizId: string,
): boolean => {
  const filePath = getSidecarFilePath(getPath, quizId)

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)

    return true
  }

  return false
}
