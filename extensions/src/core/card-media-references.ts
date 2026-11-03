import type { QuizExtrasV1, QuizExtrasV2 } from "./quiz-extras.js"

export type MediaReferenceField =
  | "question.media"
  | "question.answerVisual"
  | "question.background"
  | "question.audio.showQuestion"
  | "question.audio.answersMusic"
  | "question.audio.revealResults"
  | "question.interlude.media"
  | "question.decoration.lottie"
  | "scene.media"
  | "scene.lottie"
  | "scene.background"
  | "scene.audio"
  | "show.audioCue"
  | "show.decoration.lottie"
  | "show.mediaCatalog"

export interface CardMediaReference {
  quizId: string
  quizTitle: string
  cardId: string
  cardKind: "question" | "scene" | "global"
  cardLabel: string
  field: MediaReferenceField
  url: string
  mediaName: string
}

/**
 * Extracts the bare filename from a `/media/<name>` URL, or returns the trimmed URL if external.
 */
export const extractMediaNameFromUrl = (url: string): string => {
  const trimmed = url.trim()
  if (trimmed.startsWith("/media/")) {
    return trimmed.slice("/media/".length)
  }
  return trimmed
}

/**
 * Normalizes a media identifier (`name` or `/media/name`) to both `/media/<name>` and `<name>`.
 */
export const normalizeMediaTarget = (
  urlOrName: string,
): { url: string; name: string } => {
  const trimmed = urlOrName.trim()
  if (trimmed.startsWith("/media/")) {
    return {
      url: trimmed,
      name: trimmed.slice("/media/".length),
    }
  }
  return {
    url: `/media/${trimmed}`,
    name: trimmed,
  }
}

export interface InspectableQuizShow {
  id: string
  quizz: {
    subject?: string
    questions?: Array<{
      id?: string
      question?: string
      media?: { type?: string; url?: string } | null
    }>
  }
  extras?: Partial<QuizExtrasV1 & QuizExtrasV2> | null
}

/**
 * Collects all active media references within a single show (base quiz + V1/V2 extras).
 * Does NOT treat `mediaCatalog` entries alone as active card references so unassigned
 * catalog items can still be deleted when no card/global cue references them.
 */
export const collectQuizMediaReferences = (
  show: InspectableQuizShow,
): CardMediaReference[] => {
  const refs: CardMediaReference[] = []
  const quizId = show.id
  const quizTitle = show.quizz.subject?.trim() || show.id
  const questions = Array.isArray(show.quizz.questions)
    ? show.quizz.questions
    : []
  const questionIds = show.extras?.questionIds ?? []

  const addRef = (
    cardId: string,
    cardKind: "question" | "scene" | "global",
    cardLabel: string,
    field: MediaReferenceField,
    url?: string | null,
  ) => {
    if (!url || typeof url !== "string") {
      return
    }
    const trimmed = url.trim()
    if (!trimmed) {
      return
    }
    refs.push({
      quizId,
      quizTitle,
      cardId,
      cardKind,
      cardLabel,
      field,
      url: trimmed,
      mediaName: extractMediaNameFromUrl(trimmed),
    })
  }

  // 1. Base questions & perQuestion extras
  questions.forEach((q, idx) => {
    const qId = q.id || questionIds[idx] || `q_${idx + 1}`
    const qLabel = q.question?.trim() || `Question ${idx + 1}`

    if (q.media?.url) {
      addRef(qId, "question", qLabel, "question.media", q.media.url)
    }

    const pq = show.extras?.perQuestion?.[qId]
    if (pq) {
      if (Array.isArray(pq.answerVisuals)) {
        for (const av of pq.answerVisuals) {
          addRef(qId, "question", qLabel, "question.answerVisual", av.url)
        }
      }

      if (pq.background?.url) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.background",
          pq.background.url,
        )
      }

      if (pq.audioCues?.showQuestion?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.showQuestion",
          pq.audioCues.showQuestion.url,
        )
      }

      if (pq.audioCues?.answersMusic?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.answersMusic",
          pq.audioCues.answersMusic.url,
        )
      }

      if (pq.audioCues?.revealResults?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.revealResults",
          pq.audioCues.revealResults.url,
        )
      }

      const interludeUrl =
        pq.interlude?.url ??
        (pq.interlude as { mediaUrl?: string } | undefined)?.mediaUrl
      if (interludeUrl) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.interlude.media",
          interludeUrl,
        )
      }
      if (pq.questionDecoration?.lottieUrl) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.decoration.lottie",
          pq.questionDecoration.lottieUrl,
        )
      }
    }
  })

  // Also scan any perQuestion keys not matched above (defensive)
  const visitedQIds = new Set(
    questions.map((q, idx) => q.id || questionIds[idx] || `q_${idx + 1}`),
  )
  if (show.extras?.perQuestion) {
    for (const [qId, pq] of Object.entries(show.extras.perQuestion)) {
      if (visitedQIds.has(qId) || !pq) {
        continue
      }
      const qLabel = `Question (${qId})`
      if (Array.isArray(pq.answerVisuals)) {
        for (const av of pq.answerVisuals) {
          addRef(qId, "question", qLabel, "question.answerVisual", av.url)
        }
      }
      if (pq.background?.url) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.background",
          pq.background.url,
        )
      }
      if (pq.audioCues?.showQuestion?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.showQuestion",
          pq.audioCues.showQuestion.url,
        )
      }
      if (pq.audioCues?.answersMusic?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.answersMusic",
          pq.audioCues.answersMusic.url,
        )
      }
      if (pq.audioCues?.revealResults?.mode === "custom") {
        addRef(
          qId,
          "question",
          qLabel,
          "question.audio.revealResults",
          pq.audioCues.revealResults.url,
        )
      }
      const interludeUrl =
        pq.interlude?.url ??
        (pq.interlude as { mediaUrl?: string } | undefined)?.mediaUrl
      if (interludeUrl) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.interlude.media",
          interludeUrl,
        )
      }
      if (pq.questionDecoration?.lottieUrl) {
        addRef(
          qId,
          "question",
          qLabel,
          "question.decoration.lottie",
          pq.questionDecoration.lottieUrl,
        )
      }
    }
  }

  // 2. Scenes
  if (show.extras?.scenes) {
    for (const [sceneId, scene] of Object.entries(show.extras.scenes)) {
      if (!scene) {
        continue
      }
      const sLabel = scene.title?.trim() || `${scene.kind} (${sceneId})`
      if ("mediaUrl" in scene && typeof scene.mediaUrl === "string") {
        addRef(sceneId, "scene", sLabel, "scene.media", scene.mediaUrl)
      }
      if ("lottieUrl" in scene && typeof scene.lottieUrl === "string") {
        addRef(sceneId, "scene", sLabel, "scene.lottie", scene.lottieUrl)
      }
      if (scene.background?.url) {
        addRef(
          sceneId,
          "scene",
          sLabel,
          "scene.background",
          scene.background.url,
        )
      }
      if (scene.audio?.url && scene.audio.mode !== "mute") {
        addRef(sceneId, "scene", sLabel, "scene.audio", scene.audio.url)
      }
    }
  }

  // 2b. Global show decoration Lottie
  if (show.extras?.defaults?.questionDecoration?.lottieUrl) {
    addRef(
      "defaults_decoration",
      "global",
      "Global Question Decoration",
      "show.decoration.lottie",
      show.extras.defaults.questionDecoration.lottieUrl,
    )
  }

  // 3. Global show audio cues
  if (show.extras?.audio?.cues) {
    for (const [cueKey, cueCfg] of Object.entries(show.extras.audio.cues)) {
      const source = (cueCfg as { source?: string } | undefined)?.source
      if ((source === "media" || source === "custom") && cueCfg?.url) {
        addRef(
          `audio_${cueKey}`,
          "global",
          `Global Cue: ${cueKey}`,
          "show.audioCue",
          cueCfg.url,
        )
      }
    }
  }

  // 4. Show media catalog associations
  if (Array.isArray(show.extras?.mediaCatalog)) {
    for (const cat of show.extras.mediaCatalog) {
      if (cat?.url) {
        addRef(
          `catalog_${cat.name}`,
          "global",
          `Show Catalog: ${cat.name}`,
          "show.mediaCatalog",
          cat.url,
        )
      }
    }
  }

  return refs
}

/**
 * Checks whether a media asset (`name` or `/media/<name>`) is actively referenced
 * across any of the provided shows.
 */
export const findMediaReferencesAcrossShows = (
  urlOrName: string,
  shows: InspectableQuizShow[],
): CardMediaReference[] => {
  const target = normalizeMediaTarget(urlOrName)
  const matches: CardMediaReference[] = []

  for (const show of shows) {
    const refs = collectQuizMediaReferences(show)
    for (const ref of refs) {
      if (ref.url === target.url || ref.mediaName === target.name) {
        matches.push(ref)
      }
    }
  }

  return matches
}

/**
 * Pure helper that detaches all references to `urlOrName` from a single show's
 * quiz and extras (used only when an explicit force-detach delete is requested).
 */
export const detachMediaFromShowData = <
  TQuizz extends {
    questions?: Array<{
      media?: { type?: string; url?: string } | null
    }>
  },
  TExtras extends Partial<QuizExtrasV1 & QuizExtrasV2>,
>(
  urlOrName: string,
  quizz: TQuizz,
  extras?: TExtras | null,
): { quizz: TQuizz; extras: TExtras | null | undefined; modified: boolean } => {
  const target = normalizeMediaTarget(urlOrName)
  let modified = false

  const matchesTarget = (u?: string | null): boolean => {
    if (!u) {
      return false
    }
    const trimmed = u.trim()
    return (
      trimmed === target.url || extractMediaNameFromUrl(trimmed) === target.name
    )
  }

  const nextQuizz = structuredClone(quizz)
  if (Array.isArray(nextQuizz.questions)) {
    nextQuizz.questions = nextQuizz.questions.map((q) => {
      if (q.media?.url && matchesTarget(q.media.url)) {
        modified = true
        const nextQ = { ...q }
        delete nextQ.media
        return nextQ
      }
      return q
    })
  }

  if (!extras) {
    return { quizz: nextQuizz, extras, modified }
  }

  const nextExtras = structuredClone(extras)

  if (nextExtras.perQuestion) {
    for (const pq of Object.values(nextExtras.perQuestion)) {
      if (!pq) {
        continue
      }
      if (Array.isArray(pq.answerVisuals)) {
        const beforeLen = pq.answerVisuals.length
        pq.answerVisuals = pq.answerVisuals.filter(
          (av) => !matchesTarget(av.url),
        )
        if (pq.answerVisuals.length !== beforeLen) {
          modified = true
        }
      }
      if (pq.background?.url && matchesTarget(pq.background.url)) {
        delete pq.background
        modified = true
      }
      if (pq.audioCues) {
        for (const key of [
          "showQuestion",
          "answersMusic",
          "revealResults",
        ] as const) {
          const cue = pq.audioCues[key]
          if (cue?.url && matchesTarget(cue.url)) {
            pq.audioCues[key] = {
              mode: "inherit",
              volume: cue.volume ?? 0.8,
            }
            modified = true
          }
        }
      }
      if (pq.interlude) {
        const interludeObj = pq.interlude as {
          url?: string
          mediaUrl?: string
        }
        if (interludeObj.url && matchesTarget(interludeObj.url)) {
          delete interludeObj.url
          modified = true
        }
        if (interludeObj.mediaUrl && matchesTarget(interludeObj.mediaUrl)) {
          delete interludeObj.mediaUrl
          modified = true
        }
      }
      if (
        pq.questionDecoration?.lottieUrl &&
        matchesTarget(pq.questionDecoration.lottieUrl)
      ) {
        delete pq.questionDecoration.lottieUrl
        if (pq.questionDecoration.preset === "lottie") {
          pq.questionDecoration.preset = "none"
          pq.questionDecoration.enabled = false
        }
        modified = true
      }
    }
  }

  if (
    nextExtras.defaults?.questionDecoration?.lottieUrl &&
    matchesTarget(nextExtras.defaults.questionDecoration.lottieUrl)
  ) {
    delete nextExtras.defaults.questionDecoration.lottieUrl
    if (nextExtras.defaults.questionDecoration.preset === "lottie") {
      nextExtras.defaults.questionDecoration.preset = "none"
      nextExtras.defaults.questionDecoration.enabled = false
    }
    modified = true
  }

  if (nextExtras.scenes) {
    for (const scene of Object.values(nextExtras.scenes)) {
      if (!scene) {
        continue
      }
      if (
        "mediaUrl" in scene &&
        typeof scene.mediaUrl === "string" &&
        matchesTarget(scene.mediaUrl)
      ) {
        delete (scene as { mediaUrl?: string }).mediaUrl
        modified = true
      }
      if (
        "lottieUrl" in scene &&
        typeof scene.lottieUrl === "string" &&
        matchesTarget(scene.lottieUrl)
      ) {
        delete (scene as { lottieUrl?: string }).lottieUrl
        modified = true
      }
      if (scene.background?.url && matchesTarget(scene.background.url)) {
        delete scene.background
        modified = true
      }
      if (scene.audio?.url && matchesTarget(scene.audio.url)) {
        delete scene.audio
        modified = true
      }
    }
  }

  if (nextExtras.audio?.cues) {
    for (const cueCfg of Object.values(nextExtras.audio.cues)) {
      if (cueCfg?.url && matchesTarget(cueCfg.url)) {
        cueCfg.source = "default"
        delete cueCfg.url
        modified = true
      }
    }
  }

  if (Array.isArray(nextExtras.mediaCatalog)) {
    const before = nextExtras.mediaCatalog.length
    nextExtras.mediaCatalog = nextExtras.mediaCatalog.filter(
      (item) => !matchesTarget(item.url) && item.name !== target.name,
    )
    if (nextExtras.mediaCatalog.length !== before) {
      modified = true
    }
  }

  return { quizz: nextQuizz, extras: nextExtras, modified }
}
