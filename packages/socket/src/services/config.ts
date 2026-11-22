import {
  EXAMPLE_QUIZZ,
  EXAMPLE_QUIZZ_IMAGE,
  QUIZZ_MODES,
} from "@razzia/common/constants"
import type {
  GameResult,
  GameResultMeta,
  QuizzMode,
  QuizzWithId,
} from "@razzia/common/types/game"
import {
  normalizeLegacyQuizz,
  quizzValidator,
} from "@razzia/common/validators/quizz"
import { invalidInput, notFound } from "@razzia/socket/services/errors"
import { normalizeFilename } from "@razzia/socket/utils/file"
import { resolveConfigFile } from "@razzia/socket/services/config-scope"
import { accountsEnabled, activeAccount } from "./account-scope"
import { createHash } from "node:crypto"
import fs from "fs"
import { nanoid } from "nanoid"
import { isAbsolute, join } from "path"

export const getPath = resolveConfigFile

const readJson = (filePath: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
      string,
      unknown
    >
  } catch {
    return null
  }
}

// Lstat (not stat) so a symlink planted in the config dir is skipped instead
// of followed outside it.
const listJsonFiles = (dirPath: string): string[] =>
  fs.readdirSync(dirPath).filter((file) => {
    if (!file.endsWith(".json")) {
      return false
    }

    try {
      return fs.lstatSync(join(dirPath, file)).isFile()
    } catch {
      return false
    }
  })

const resolveFileId = (dirPath: string, file: string): string => {
  const data = readJson(join(dirPath, file))

  return typeof data?.id === "string" ? data.id : file.replace(/\.json$/u, "")
}

// Never builds a path from `id` — avoids path traversal by construction.
const findFileById = (subDir: string, id: string): string | undefined => {
  const dirPath = getPath(subDir)

  if (!fs.existsSync(dirPath)) {
    return undefined
  }

  return listJsonFiles(dirPath).find(
    (file) => resolveFileId(dirPath, file) === id,
  )
}

const requireFileById = (subDir: string, id: string, key: string): string => {
  const file = findFileById(subDir, id)

  if (!file) {
    throw notFound(key)
  }

  return file
}

/** Only the explicit first-run seed copies this existing bundled illustration. */
const materializeExampleImage = () => {
  // The configured built site is authoritative for relocated native QA bundles.
  // Production uses /app/web, including the isolated /candidate launch gate.
  // Source/tsx and the standalone socket build retain their fixed repo layouts.
  const siteDist = process.env.TADAZZ_SITE_DIST_DIR

  if (siteDist && !isAbsolute(siteDist)) {
    throw new Error("Example image site dist must be absolute")
  }

  const source = (
    siteDist
      ? [join(siteDist, EXAMPLE_QUIZZ_IMAGE.publicPath)]
      : [
          join("/app/web", EXAMPLE_QUIZZ_IMAGE.publicPath),
          new URL(
            `../../../web/public/${EXAMPLE_QUIZZ_IMAGE.publicPath}`,
            import.meta.url,
          ),
          new URL(
            `../../web/public/${EXAMPLE_QUIZZ_IMAGE.publicPath}`,
            import.meta.url,
          ),
        ]
  ).find((candidate) => fs.existsSync(candidate))

  if (!source) {
    throw new Error("Bundled example image unavailable")
  }

  const sourceStat = fs.lstatSync(source)

  if (!sourceStat.isFile() || sourceStat.size !== EXAMPLE_QUIZZ_IMAGE.bytes) {
    throw new Error("Bundled example image invalid")
  }

  const bytes = fs.readFileSync(source)

  if (
    createHash("sha256").update(bytes).digest("hex") !==
    EXAMPLE_QUIZZ_IMAGE.sha256
  ) {
    throw new Error("Bundled example image changed")
  }

  const mediaDirectory = getPath("media")
  fs.mkdirSync(mediaDirectory, { recursive: true })

  if (!fs.lstatSync(mediaDirectory).isDirectory()) {
    throw new Error("Example media directory invalid")
  }

  const destination = getPath(`media/${EXAMPLE_QUIZZ_IMAGE.name}`)

  if (fs.existsSync(destination)) {
    const stat = fs.lstatSync(destination)

    if (
      !stat.isFile() ||
      stat.size !== bytes.length ||
      !fs.readFileSync(destination).equals(bytes)
    ) {
      throw new Error(
        "Existing example image differs; no media was overwritten",
      )
    }
  } else {
    fs.writeFileSync(destination, bytes, { flag: "wx" })
  }
}

export const initConfig = () => {
  const isConfigFolderExists = fs.existsSync(getPath())

  if (!isConfigFolderExists) {
    fs.mkdirSync(getPath())
  }

  const isQuizzExists = fs.existsSync(getPath("quizz"))

  if (!isQuizzExists) {
    // Materialize first: an unavailable asset must not leave a broken seed quiz.
    materializeExampleImage()
    fs.mkdirSync(getPath("quizz"))

    fs.writeFileSync(
      getPath("quizz/example.json"),
      JSON.stringify({ id: nanoid(), ...EXAMPLE_QUIZZ }, null, 2),
    )
  }
}

const subjectCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export const getQuizzMeta = () =>
  getQuizz()
    .map(({ id, subject }) => ({ id, subject }))
    .sort((a, b) => subjectCollator.compare(a.subject, b.subject))

export const getQuizzById = (id: string): QuizzWithId => {
  const quizz = getQuizz().find((q) => q.id === id)

  if (!quizz) {
    throw notFound("errors:quizz.notFound")
  }

  return quizz
}

export const getQuizz = (): QuizzWithId[] => {
  const isExists = fs.existsSync(getPath("quizz"))

  if (!isExists) {
    return []
  }

  try {
    const files = listJsonFiles(getPath("quizz"))

    const quizz: QuizzWithId[] = files.flatMap((file) => {
      const filePath = getPath(`quizz/${file}`)
      const data = readJson(filePath)

      if (!data) {
        console.warn(`Invalid quizz config "${file}": unreadable`)

        return []
      }

      const result = quizzValidator.safeParse(normalizeLegacyQuizz(data))

      if (!result.success) {
        console.warn(`Invalid quizz config "${file}":`, result.error.issues)

        return []
      }

      if (typeof data.id === "string") {
        return [{ id: data.id, ...result.data }]
      }

      const id = nanoid()

      fs.writeFileSync(
        filePath,
        JSON.stringify({ id, ...result.data }, null, 2),
      )

      return [{ id, ...result.data }]
    })

    return quizz
  } catch (error) {
    console.error("Failed to read quizz config:", error)

    return []
  }
}

export const updateQuizz = (id: string, data: unknown): { id: string } => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw invalidInput(result.error.issues[0].message)
  }

  const file = requireFileById("quizz", id, "errors:quizz.notFound")

  fs.writeFileSync(
    join(getPath("quizz"), file),
    JSON.stringify({ id, ...result.data }, null, 2),
  )

  return { id }
}

export const deleteQuizz = (id: string): void => {
  const file = requireFileById("quizz", id, "errors:quizz.notFound")

  fs.unlinkSync(join(getPath("quizz"), file))
}

export const saveResult = (data: GameResult): void => {
  try {
    const resultsPath = getPath("results")

    if (!fs.existsSync(resultsPath)) {
      fs.mkdirSync(resultsPath)
    }

    fs.writeFileSync(
      join(resultsPath, `${nanoid()}.json`),
      JSON.stringify(data, null, 2),
    )

    console.log(`Saved result for "${data.subject}"`)
  } catch (error) {
    console.error("Failed to save result:", error)
  }
}

/** Results written before survey mode have no `gameMode` field. */
type StoredResult = Omit<GameResult, "gameMode"> & { gameMode?: QuizzMode }

export const getResultsMeta = (): GameResultMeta[] => {
  const resultsPath = getPath("results")

  if (!fs.existsSync(resultsPath)) {
    return []
  }

  const readMeta = (file: string): GameResultMeta | null => {
    const data = readJson(join(resultsPath, file)) as StoredResult | null

    if (!data) {
      return null
    }

    try {
      return {
        id: data.id,
        gameMode: data.gameMode ?? QUIZZ_MODES.QUIZ,
        subject: data.subject,
        date: data.date,
        playerCount: data.players.length,
      }
    } catch {
      return null
    }
  }

  try {
    return listJsonFiles(resultsPath)
      .map(readMeta)
      .filter((meta): meta is GameResultMeta => meta !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  } catch {
    return []
  }
}

export const getResultById = (id: string): GameResult => {
  const file = requireFileById("results", id, "errors:result.notFound")
  const data = readJson(join(getPath("results"), file))

  if (!data) {
    throw notFound("errors:result.notFound")
  }

  const result = data as unknown as StoredResult

  return { ...result, gameMode: result.gameMode ?? QUIZZ_MODES.QUIZ }
}

export const deleteResult = (id: string): void => {
  const file = requireFileById("results", id, "errors:result.notFound")

  fs.unlinkSync(join(getPath("results"), file))
}

/** C1 allocation only. The scoped creation port owns all physical publication. */
export const prepareNativeQuizCreation = (data: unknown) => {
  const owner = activeAccount()

  if (
    accountsEnabled() &&
    (!owner || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu.test(owner))
  ) {
    throw invalidInput("Missing or invalid native creation account scope")
  }

  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw invalidInput(result.error.issues[0].message)
  }

  const id = nanoid()
  const baseFileName = `${normalizeFilename(result.data.subject, { fallback: "quizz" })}.json`

  if (findFileById("quizz", id)) {
    throw invalidInput("Native creation ID collision")
  }

  return { id, baseFileName, normalizedBase: result.data }
}

export const saveQuizz = (data: unknown): { id: string } => {
  const result = quizzValidator.safeParse(data)

  if (!result.success) {
    throw invalidInput(result.error.issues[0].message)
  }

  const id = nanoid()
  const fileName = normalizeFilename(result.data.subject, { fallback: "quizz" })

  fs.writeFileSync(
    getPath(`quizz/${fileName}.json`),
    JSON.stringify({ id, ...result.data }, null, 2),
  )

  return { id }
}
