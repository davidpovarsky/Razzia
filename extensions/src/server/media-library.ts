import fs from "node:fs"
import path from "node:path"
import type { UploadedMedia } from "@razzia/common/types/game"
import {
  collectQuizMediaReferences,
  detachMediaFromShowData,
  extractMediaNameFromUrl,
  findMediaReferencesAcrossShows,
  type AnyQuizExtras,
  type CardMediaReference,
  type InspectableQuizShow,
  type ShowMediaCatalogItem,
} from "../core/index"
import { readSidecar, writeSidecar } from "./storage/sidecar"

export interface BuiltInSoundItem {
  name: string
  label: string
  url: string
  type: "audio"
  builtIn: true
  defaultLoop: boolean
}

export const BUILT_IN_SOUNDS: BuiltInSoundItem[] = [
  {
    name: "showQuestion.mp3",
    label: "Question Intro",
    url: "/sounds/showQuestion.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "answersMusic.mp3",
    label: "Voting Music Loop",
    url: "/sounds/answersMusic.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: true,
  },
  {
    name: "results.mp3",
    label: "Results Reveal",
    url: "/sounds/results.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "answersSound.mp3",
    label: "Show Answers Pop",
    url: "/sounds/answersSound.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "snearRoll.mp3",
    label: "Drum Roll",
    url: "/sounds/snearRoll.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "podiumFirst.mp3",
    label: "Podium 1st Place",
    url: "/sounds/podiumFirst.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "podiumSecond.mp3",
    label: "Podium 2nd Place",
    url: "/sounds/podiumSecond.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "podiumThird.mp3",
    label: "Podium 3rd Place",
    url: "/sounds/podiumThird.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  {
    name: "pop.mp3",
    label: "Pop Sound",
    url: "/sounds/pop.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
]

export interface LoadedShowRecord extends InspectableQuizShow {
  filePath: string
}

export function loadAllShowsFromDisk(
  getPath: (subPath?: string) => string,
): LoadedShowRecord[] {
  const quizzDir = getPath("quizz")
  if (!fs.existsSync(quizzDir)) {
    return []
  }

  const records: LoadedShowRecord[] = []
  const files = fs.readdirSync(quizzDir).filter((f) => f.endsWith(".json"))

  for (const file of files) {
    const filePath = path.join(quizzDir, file)
    try {
      if (!fs.lstatSync(filePath).isFile()) {
        continue
      }
      const raw = fs.readFileSync(filePath, "utf-8")
      const parsed = JSON.parse(raw) as LoadedShowRecord["quizz"] & {
        id?: string
      }
      if (!parsed || typeof parsed !== "object") {
        continue
      }
      const quizId =
        typeof parsed.id === "string" && parsed.id.trim().length > 0
          ? parsed.id
          : file.replace(/\.json$/iu, "")
      const extras = readSidecar(getPath, quizId)
      records.push({
        id: quizId,
        filePath,
        quizz: parsed,
        extras,
      })
    } catch {
      // Ignore malformed file
    }
  }

  return records
}

export interface MediaDeleteSafetyResult {
  allowed: boolean
  references: CardMediaReference[]
  detachedFromShows: string[]
}

/**
 * Checks whether a media file can be safely deleted from the shared media store.
 * - If referenced by any show/card and `detach !== true`, returns `allowed: false` with full reference list.
 * - If `detach === true`, removes references from affected shows/sidecars on disk before returning `allowed: true`.
 */
export function checkMediaDeleteSafety(
  getPath: (subPath?: string) => string,
  mediaNameOrUrl: string,
  options?: {
    detach?: boolean
  },
): MediaDeleteSafetyResult {
  const shows = loadAllShowsFromDisk(getPath)
  const references = findMediaReferencesAcrossShows(mediaNameOrUrl, shows)

  if (references.length > 0 && !options?.detach) {
    return {
      allowed: false,
      references,
      detachedFromShows: [],
    }
  }

  const detachedFromShows: string[] = []
  const targetMediaName = extractMediaNameFromUrl(mediaNameOrUrl)

  for (const show of shows) {
    const showRefs = findMediaReferencesAcrossShows(mediaNameOrUrl, [show])
    const hasCatalogEntry = Boolean(
      show.extras?.mediaCatalog?.some(
        (item) =>
          item.url === mediaNameOrUrl ||
          item.name === mediaNameOrUrl ||
          (targetMediaName && item.name === targetMediaName),
      ),
    )

    if (showRefs.length > 0 || hasCatalogEntry) {
      const detached = detachMediaFromShowData(
        mediaNameOrUrl,
        show.quizz,
        show.extras,
      )
      if (detached.modified) {
        detachedFromShows.push(show.id)
        try {
          fs.writeFileSync(
            show.filePath,
            JSON.stringify(detached.quizz, null, 2),
            "utf-8",
          )
        } catch {
          // Ignore write error if quiz file was read-only
        }

        if (detached.extras) {
          writeSidecar(getPath, show.id, detached.extras as AnyQuizExtras)
        }
      }
    }
  }

  return {
    allowed: true,
    references,
    detachedFromShows,
  }
}

export interface EnrichedMediaCatalogItem extends UploadedMedia {
  usedInCurrentShow: boolean
  referenceCount: number
  references: CardMediaReference[]
}

export interface MediaCatalogResponse {
  media: EnrichedMediaCatalogItem[]
  builtInSounds: BuiltInSoundItem[]
  showMediaCatalog: ShowMediaCatalogItem[]
}

export function buildMediaCatalogResponse(
  getPath: (subPath?: string) => string,
  uploadedMedia: UploadedMedia[],
  currentQuizId?: string,
): MediaCatalogResponse {
  const shows = loadAllShowsFromDisk(getPath)
  const allRefs: CardMediaReference[] = []

  for (const show of shows) {
    allRefs.push(...collectQuizMediaReferences(show))
  }

  const currentShow = currentQuizId
    ? shows.find((s) => s.id === currentQuizId)
    : undefined
  const showMediaCatalog: ShowMediaCatalogItem[] =
    currentShow?.extras?.mediaCatalog ?? []
  const currentCatalogNames = new Set(
    showMediaCatalog.map((item) => item.name),
  )
  const currentCatalogUrls = new Set(showMediaCatalog.map((item) => item.url))

  const enriched: EnrichedMediaCatalogItem[] = uploadedMedia.map((item) => {
    const itemRefs = allRefs.filter(
      (r) => r.mediaName === item.name || r.url === item.url,
    )
    const usedInCurrentShow = Boolean(
      currentQuizId &&
        (itemRefs.some((r) => r.quizId === currentQuizId) ||
          currentCatalogNames.has(item.name) ||
          currentCatalogUrls.has(item.url)),
    )

    return {
      ...item,
      usedInCurrentShow,
      referenceCount: itemRefs.length,
      references: itemRefs,
    }
  })

  return {
    media: enriched,
    builtInSounds: BUILT_IN_SOUNDS,
    showMediaCatalog,
  }
}

export function associateMediaWithShow(
  getPath: (subPath?: string) => string,
  quizId: string,
  item: ShowMediaCatalogItem,
): ShowMediaCatalogItem[] {
  const existing = readSidecar(getPath, quizId)
  if (!existing) {
    return [item]
  }

  const currentCatalog = existing.mediaCatalog ? [...existing.mediaCatalog] : []
  const alreadyPresent = currentCatalog.some(
    (entry) => entry.url === item.url || entry.name === item.name,
  )
  if (!alreadyPresent) {
    currentCatalog.unshift({
      ...item,
      addedAt: item.addedAt ?? Date.now(),
    })
  }

  const updated: AnyQuizExtras = {
    ...existing,
    mediaCatalog: currentCatalog,
  }
  writeSidecar(getPath, quizId, updated)
  return currentCatalog
}
