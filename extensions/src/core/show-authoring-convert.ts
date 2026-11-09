// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
// Preserve legacy wire text coercion while keeping unknown values at the boundary.
function legacyText(value: unknown): string {
  return String(value)
}
import {
  quizzValidator,
  type QuizzValidated,
} from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createStudioDefaults,
  createDefaultAudioExtras,
  createDefaultRosterExtras,
  quizExtrasV2Schema,
  type AnyQuizExtras,
  type QuizExtrasV2,
  type SceneConfig,
  type TimelineItem,
} from "./index"
import {
  tadaShowV1Schema,
  type AuthoredAnswer,
  type AuthoredCard,
  type AuthoredQuizCard,
  type AuthoredSetting,
  type TadaShowV1,
} from "./show-authoring-schema"
import { isQuizExtrasV2, upgradeLegacyExtrasToV2 } from "./studio-migrate"
import type { PerQuestionItem } from "./quiz-extras"

export interface ConversionDiagnostic {
  path: string[]
  message: string
  severity: "error" | "warning"
}

export interface ConvertShowResult {
  ok: boolean
  bundleDraft?: {
    quizz: QuizzValidated
    extras: QuizExtrasV2
  }
  diagnostics: ConversionDiagnostic[]
}

/**
 * Normalizes and converts an authored show (`TadaShowV1`) into a native
 * `QuizzValidated` and `QuizExtrasV2` draft ready for atomic composite storage.
 */
export function authoredShowToNativeBundleDraft(
  showInput: unknown,
  fixedQuizId?: string,
): ConvertShowResult {
  const diagnostics: ConversionDiagnostic[] = []
  const parseResult = tadaShowV1Schema.safeParse(showInput)

  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      diagnostics.push({
        path: issue.path.map(String),
        message: issue.message,
        severity: "error",
      })
    }

    return {
      ok: false,
      diagnostics,
    }
  }

  const show = parseResult.data
  const tempQuizId = fixedQuizId || crypto.randomUUID()
  const questionIds: string[] = []
  const timeline: TimelineItem[] = []
  const scenes: Record<string, SceneConfig> = {}
  const perQuestion: Record<string, PerQuestionItem> = {}
  const baseQuestions: QuizzValidated["questions"] = []
  const keyToQuestionId = new Map<string, string>()
  for (const _entry of show.cards) {
    const card = _entry

    if (card.kind === "quiz" || card.kind === "survey") {
      const qId = crypto.randomUUID()
      const timelineItemId = crypto.randomUUID()
      keyToQuestionId.set(card.key, qId)
      questionIds.push(qId)
      const solutions =
        card.kind === "quiz" && card.correctAnswers
          ? card.correctAnswers.map((ansNum) => ansNum - 1)
          : undefined
      const baseQ = {
        type: card.questionType,
        playMode: card.kind,
        question: card.question,
        category: card.category,
        note: card.note,
        media: card.media,
        answers: card.answers.map((a) => a.text),
        solutions,
        cooldown: card.cooldownSeconds,
        time: card.timeSeconds,
        maxPoints: card.maxPoints,
        penalty: card.penalty,
        options: card.options,
      }
      baseQuestions.push(baseQ)

      // Build perQuestion visuals and reveal
      const answerVisuals: NonNullable<PerQuestionItem["answerVisuals"]> = []
      for (let aIdx = 0; aIdx < card.answers.length; aIdx += 1) {
        const ans = card.answers[aIdx]

        if (ans.display !== "text" || ans.imageUrl) {
          answerVisuals.push({
            answerIndex: aIdx,
            display: ans.display,
            url: ans.imageUrl,
            alt: ans.alt ?? "",
          })
        }
      }
      const qExtras: PerQuestionItem = {}

      if (answerVisuals.length > 0) {
        qExtras.answerVisuals = answerVisuals
      }

      if (card.reveal) {
        qExtras.reveal = card.reveal
      }

      if (card.interlude) {
        qExtras.interlude = card.interlude
      }

      if (card.questionEntrance && card.questionEntrance.preset !== "none") {
        qExtras.questionEntrance = card.questionEntrance
      }

      if (card.background) {
        qExtras.background = card.background
      }

      if (card.audioCues) {
        qExtras.audioCues = card.audioCues
      }

      if (card.stageAnimations) {
        qExtras.stageAnimations = card.stageAnimations
      }

      if (card.questionDecoration) {
        qExtras.questionDecoration = card.questionDecoration
      }

      if (card.themeOverrides) {
        qExtras.themeOverrides = card.themeOverrides
      }

      if (Object.keys(qExtras).length > 0) {
        perQuestion[qId] = qExtras
      }

      timeline.push({
        id: timelineItemId,
        kind: "question",
        questionId: qId,
      })
    } else {
      const sceneId = crypto.randomUUID()
      const timelineItemId = crypto.randomUUID()
      const sceneAppearance = {
        ...(card.background
          ? {
              background: card.background,
            }
          : {}),
        ...(card.themeOverrides
          ? {
              themeOverrides: card.themeOverrides,
            }
          : {}),
        ...(card.audio
          ? {
              audio: card.audio,
            }
          : {}),
        ...(card.stageAnimations
          ? {
              stageAnimations: card.stageAnimations,
            }
          : {}),
      }
      let sceneConfig: SceneConfig | undefined = undefined

      switch (card.kind) {
        case "transition":
          sceneConfig = {
            id: sceneId,
            kind: "transition",
            title: card.title,
            description: card.description,
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break

        case "animation":
          sceneConfig = {
            id: sceneId,
            kind: "animation",
            preset: card.preset,
            title: card.title,
            durationMs: card.durationMs,
            advance: card.advance,
            ...(card.lottieUrl
              ? {
                  lottieUrl: card.lottieUrl,
                }
              : {}),
            ...(card.lottieFit
              ? {
                  lottieFit: card.lottieFit,
                }
              : {}),
            ...(card.lottieLoop !== undefined
              ? {
                  lottieLoop: card.lottieLoop,
                }
              : {}),
            ...(card.lottieSpeed !== undefined
              ? {
                  lottieSpeed: card.lottieSpeed,
                }
              : {}),
            ...sceneAppearance,
          }

          break

        case "media":
          sceneConfig = {
            id: sceneId,
            kind: "media",
            mediaUrl: card.mediaUrl,
            mediaType: card.mediaType,
            title: card.title,
            ...(card.subtitle !== undefined
              ? {
                  subtitle: card.subtitle,
                }
              : {}),
            ...(card.stageLayout
              ? {
                  stageLayout: card.stageLayout,
                }
              : {}),
            ...(card.textOverlay !== undefined
              ? {
                  textOverlay: card.textOverlay,
                }
              : {}),
            ...(card.endBehavior
              ? {
                  endBehavior: card.endBehavior,
                }
              : {}),
            durationMs: card.durationMs,
            ...(card.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: card.mediaEndFallbackMs,
                }
              : {}),
            advance: card.advance,
            ...(card.volume !== undefined
              ? {
                  volume: card.volume,
                }
              : {}),
            ...(card.loop !== undefined
              ? {
                  loop: card.loop,
                }
              : {}),
            ...(card.muted !== undefined
              ? {
                  muted: card.muted,
                }
              : {}),
            ...(card.showControls !== undefined
              ? {
                  showControls: card.showControls,
                }
              : {}),
            ...(card.mediaFit
              ? {
                  mediaFit: card.mediaFit,
                }
              : {}),
            ...(card.overlayAnimations
              ? {
                  overlayAnimations: card.overlayAnimations,
                }
              : {}),
            ...sceneAppearance,
          }

          break

        case "leaderboard":
          sceneConfig = {
            id: sceneId,
            kind: "leaderboard",
            title: card.title,
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break

        case "interimResults":
          sceneConfig = {
            id: sceneId,
            kind: "interimResults",
            title: card.title,
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break

        case "answerRecap": {
          const resolvedStartQId = card.startQuestionKey
            ? keyToQuestionId.get(card.startQuestionKey)
            : questionIds[0]
          sceneConfig = {
            id: sceneId,
            kind: "answerRecap",
            title: card.title,
            ...(resolvedStartQId
              ? {
                  startQuestionId: resolvedStartQId,
                }
              : {}),
            mode: card.mode ?? "mostSelected",
            ...(card.maxItemsPerPage !== undefined
              ? {
                  maxItemsPerPage: card.maxItemsPerPage,
                }
              : {}),
            ...(card.showCounts !== undefined
              ? {
                  showCounts: card.showCounts,
                }
              : {}),
            ...(card.showPercentages !== undefined
              ? {
                  showPercentages: card.showPercentages,
                }
              : {}),
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break
        }

        case "countdown":
          sceneConfig = {
            id: sceneId,
            kind: "countdown",
            durationSeconds: card.durationSeconds,
            title: card.title,
            advance: card.advance,
            ...sceneAppearance,
          }

          break

        case "opening":
          sceneConfig = {
            id: sceneId,
            kind: "opening",
            title: card.title,
            subtitle: card.subtitle,
            mediaUrl: card.mediaUrl,
            ...(card.mediaType
              ? {
                  mediaType: card.mediaType,
                }
              : {}),
            ...(card.stageLayout
              ? {
                  stageLayout: card.stageLayout,
                }
              : {}),
            ...(card.mediaFit
              ? {
                  mediaFit: card.mediaFit,
                }
              : {}),
            ...(card.logoPosition
              ? {
                  logoPosition: card.logoPosition,
                }
              : {}),
            ...(card.textOverlay !== undefined
              ? {
                  textOverlay: card.textOverlay,
                }
              : {}),
            ...(card.endBehavior
              ? {
                  endBehavior: card.endBehavior,
                }
              : {}),
            ...(card.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: card.mediaEndFallbackMs,
                }
              : {}),
            ...(card.volume !== undefined
              ? {
                  volume: card.volume,
                }
              : {}),
            ...(card.loop !== undefined
              ? {
                  loop: card.loop,
                }
              : {}),
            ...(card.muted !== undefined
              ? {
                  muted: card.muted,
                }
              : {}),
            ...(card.showControls !== undefined
              ? {
                  showControls: card.showControls,
                }
              : {}),
            ...(card.lottieUrl
              ? {
                  lottieUrl: card.lottieUrl,
                }
              : {}),
            ...(card.lottieFit
              ? {
                  lottieFit: card.lottieFit,
                }
              : {}),
            ...(card.lottieLoop !== undefined
              ? {
                  lottieLoop: card.lottieLoop,
                }
              : {}),
            ...(card.lottieSpeed !== undefined
              ? {
                  lottieSpeed: card.lottieSpeed,
                }
              : {}),
            ...(card.overlayAnimations
              ? {
                  overlayAnimations: card.overlayAnimations,
                }
              : {}),
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break

        case "closing":
          sceneConfig = {
            id: sceneId,
            kind: "closing",
            title: card.title,
            subtitle: card.subtitle,
            mediaUrl: card.mediaUrl,
            ...(card.mediaType
              ? {
                  mediaType: card.mediaType,
                }
              : {}),
            ...(card.stageLayout
              ? {
                  stageLayout: card.stageLayout,
                }
              : {}),
            ...(card.mediaFit
              ? {
                  mediaFit: card.mediaFit,
                }
              : {}),
            ...(card.logoPosition
              ? {
                  logoPosition: card.logoPosition,
                }
              : {}),
            ...(card.textOverlay !== undefined
              ? {
                  textOverlay: card.textOverlay,
                }
              : {}),
            ...(card.endBehavior
              ? {
                  endBehavior: card.endBehavior,
                }
              : {}),
            ...(card.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: card.mediaEndFallbackMs,
                }
              : {}),
            ...(card.volume !== undefined
              ? {
                  volume: card.volume,
                }
              : {}),
            ...(card.loop !== undefined
              ? {
                  loop: card.loop,
                }
              : {}),
            ...(card.muted !== undefined
              ? {
                  muted: card.muted,
                }
              : {}),
            ...(card.showControls !== undefined
              ? {
                  showControls: card.showControls,
                }
              : {}),
            ...(card.lottieUrl
              ? {
                  lottieUrl: card.lottieUrl,
                }
              : {}),
            ...(card.lottieFit
              ? {
                  lottieFit: card.lottieFit,
                }
              : {}),
            ...(card.lottieLoop !== undefined
              ? {
                  lottieLoop: card.lottieLoop,
                }
              : {}),
            ...(card.lottieSpeed !== undefined
              ? {
                  lottieSpeed: card.lottieSpeed,
                }
              : {}),
            ...(card.overlayAnimations
              ? {
                  overlayAnimations: card.overlayAnimations,
                }
              : {}),
            durationMs: card.durationMs,
            advance: card.advance,
            ...sceneAppearance,
          }

          break
      }

      scenes[sceneId] = sceneConfig
      timeline.push({
        id: timelineItemId,
        kind: card.kind,
        sceneId,
      })
    }
  }

  // Base Quizz validation
  const baseQuizzCandidate = {
    gameMode: show.baseGameMode,
    subject: show.title,
    questions: baseQuestions,
  }
  const baseParse = quizzValidator.safeParse(baseQuizzCandidate)

  if (!baseParse.success) {
    for (const issue of baseParse.error.issues) {
      diagnostics.push({
        path: ["quizz", ...issue.path.map(String)],
        message: issue.message,
        severity: "error",
      })
    }

    return {
      ok: false,
      diagnostics,
    }
  }

  const quizz = baseParse.data
  const baseDigest = computeCanonicalBaseDigest(quizz)
  const defaults = createStudioDefaults(show.defaults)

  // Apply settings channel overrides if present
  const settingExtras: Pick<QuizExtrasV2, "leaderboard"> = {}
  let teamsExtras: QuizExtrasV2["teams"] = {
    enabled: false,
    teams: [],
    autoAssign: "roundRobin",
  }
  let audioExtras: QuizExtrasV2["audio"] = createDefaultAudioExtras()
  let rosterExtras: QuizExtrasV2["roster"] = createDefaultRosterExtras()
  let mediaCatalogExtras: QuizExtrasV2["mediaCatalog"] | undefined = undefined

  if (show.settings && show.settings.length > 0) {
    for (let sIdx = 0; sIdx < show.settings.length; sIdx += 1) {
      const s = show.settings[sIdx]

      if (s.targetKey !== "show") {
        diagnostics.push({
          path: ["settings", String(sIdx), "targetKey"],
          message: `errors:extensions.unsupportedSettingTargetKey:${s.scope}.${s.targetKey}`,
          severity: "error",
        })
      }

      if (s.scope === "leaderboard") {
        if (s.property === "mode" && typeof s.valueJson === "string") {
          settingExtras.leaderboard = {
            mode: s.valueJson as NonNullable<
              QuizExtrasV2["leaderboard"]
            >["mode"],
            ...(settingExtras.leaderboard ?? {}),
          }
        } else if (s.property === "everyN" && typeof s.valueJson === "number") {
          settingExtras.leaderboard = {
            mode: settingExtras.leaderboard?.mode ?? "everyN",
            ...(settingExtras.leaderboard ?? {}),
            everyN: s.valueJson,
          }
        } else if (
          s.property === "afterQuestionIds" &&
          Array.isArray(s.valueJson)
        ) {
          const mappedIds: string[] = []
          for (let kIdx = 0; kIdx < s.valueJson.length; kIdx += 1) {
            const k = String(s.valueJson[kIdx])
            const resolvedQId = keyToQuestionId.get(k)

            if (!resolvedQId) {
              diagnostics.push({
                path: ["settings", String(sIdx), "valueJson", String(kIdx)],
                message: `errors:extensions.unknownQuestionKeyRef:${k}`,
                severity: "error",
              })
            } else {
              mappedIds.push(resolvedQId)
            }
          }
          settingExtras.leaderboard = {
            mode: settingExtras.leaderboard?.mode ?? "selected",
            ...(settingExtras.leaderboard ?? {}),
            afterQuestionIds: mappedIds,
          }
        } else {
          diagnostics.push({
            path: ["settings", String(sIdx), "property"],
            message: `errors:extensions.unsupportedSettingProperty:${s.scope}.${s.property}`,
            severity: "error",
          })
        }
      } else if (s.scope === "team" && s.property === "config") {
        teamsExtras = s.valueJson as QuizExtrasV2["teams"]
      } else if (s.scope === "audio" && s.property === "cues") {
        audioExtras = {
          cues: {
            ...createDefaultAudioExtras().cues,
            ...(s.valueJson as QuizExtrasV2["audio"]["cues"]),
          },
        }
      } else if (s.scope === "roster" && s.property === "config") {
        rosterExtras = s.valueJson as QuizExtrasV2["roster"]
      } else if (s.scope === "media" && s.property === "catalog") {
        mediaCatalogExtras = s.valueJson as QuizExtrasV2["mediaCatalog"]
      } else {
        diagnostics.push({
          path: ["settings", String(sIdx)],
          message: `errors:extensions.unsupportedSettingProperty:${s.scope}.${s.property}`,
          severity: "error",
        })
      }
    }
  }

  const extrasCandidate: QuizExtrasV2 = {
    schemaVersion: 2,
    revision: 1,
    quizId: tempQuizId,
    baseDigest,
    questionIds,
    timeline,
    scenes,
    defaults,
    leaderboard: settingExtras.leaderboard,
    teams: teamsExtras,
    audio: audioExtras,
    perQuestion,
    roster: rosterExtras,
    authoring:
      show.note !== undefined
        ? {
            showNote: show.note,
          }
        : undefined,
    ...(mediaCatalogExtras
      ? {
          mediaCatalog: mediaCatalogExtras,
        }
      : {}),
  }
  const extrasParse = quizExtrasV2Schema.safeParse(extrasCandidate)

  if (!extrasParse.success) {
    for (const issue of extrasParse.error.issues) {
      diagnostics.push({
        path: ["extras", ...issue.path.map(String)],
        message: issue.message,
        severity: "error",
      })
    }

    return {
      ok: false,
      diagnostics,
    }
  }

  return {
    ok: true,
    bundleDraft: {
      quizz,
      extras: extrasParse.data,
    },
    diagnostics,
  }
}

/**
 * Converts a native bundle or composite quiz into a friendly authored show (`TadaShowV1`).
 */
export function nativeBundleToAuthoredShow(
  bundle: {
    quizz: unknown
    extras: AnyQuizExtras
  },
  options?: {
    includePrivateRoster?: boolean
  },
): TadaShowV1 {
  const quizz = bundle.quizz as Record<string, unknown>
  const questions = (
    Array.isArray(quizz.questions) ? quizz.questions : []
  ) as Array<Record<string, unknown>>

  // Ensure V2 extras for timeline processing
  const extrasV2: QuizExtrasV2 = isQuizExtrasV2(bundle.extras)
    ? bundle.extras
    : upgradeLegacyExtrasToV2(quizz, bundle.extras, {
        quizId: bundle.extras.quizId,
        baseDigest: bundle.extras.baseDigest,
      })
  const cards: AuthoredCard[] = []
  const questionMap = new Map<string, Record<string, unknown>>()
  const questionIdToCardKey = new Map<string, string>()
  for (let i = 0; i < extrasV2.questionIds.length; i += 1) {
    const qId = extrasV2.questionIds[i]

    if (questions[i]) {
      questionMap.set(qId, questions[i])
    }
  }
  let qCount = 0
  let sceneCount = 0
  for (const _entry2 of extrasV2.timeline) {
    const item = _entry2

    if (item.kind === "question") {
      qCount += 1
      const q = questionMap.get(item.questionId)
      const qKey = `Q${String(qCount).padStart(2, "0")}`
      questionIdToCardKey.set(item.questionId, qKey)

      if (!q) {
        continue
      }

      const rawAnswers = (Array.isArray(q.answers) ? q.answers : []) as string[]
      const rawSolutions = (
        Array.isArray(q.solutions) ? q.solutions : []
      ) as number[]
      const perQ = Object.hasOwn(extrasV2.perQuestion, item.questionId)
        ? extrasV2.perQuestion[item.questionId]
        : undefined
      const authoredAnswers: AuthoredAnswer[] = rawAnswers.map((txt, aIdx) => {
        const visual = perQ?.answerVisuals?.find((v) => v.answerIndex === aIdx)

        return {
          text: txt,
          display: visual?.display ?? "text",
          imageUrl: visual?.url,
          alt: visual?.alt,
        }
      })
      const playMode =
        (q.playMode as "quiz" | "survey" | undefined) ??
        (quizz.gameMode === "survey" ? "survey" : "quiz")

      if (playMode === "survey") {
        cards.push({
          key: qKey,
          kind: "survey",
          questionType:
            (q.type as AuthoredQuizCard["questionType"]) ?? "single",
          question: legacyText(q.question ?? ""),
          category: q.category ? legacyText(q.category) : undefined,
          note: q.note ? legacyText(q.note) : undefined,
          timeSeconds: typeof q.time === "number" ? q.time : 20,
          cooldownSeconds: typeof q.cooldown === "number" ? q.cooldown : 3,
          maxPoints: typeof q.maxPoints === "number" ? q.maxPoints : 0,
          penalty: typeof q.penalty === "number" ? q.penalty : 0,
          media: q.media as AuthoredQuizCard["media"],
          answers: authoredAnswers,
          options: q.options as AuthoredQuizCard["options"],
          reveal: perQ?.reveal,
          interlude: perQ?.interlude,
          questionEntrance: perQ?.questionEntrance,
          background: perQ?.background,
          audioCues: perQ?.audioCues,
          stageAnimations: perQ?.stageAnimations,
          questionDecoration: perQ?.questionDecoration,
          themeOverrides: perQ?.themeOverrides,
        })
      } else {
        const correctAnswers = rawSolutions.map((solIdx) => solIdx + 1)
        cards.push({
          key: qKey,
          kind: "quiz",
          questionType:
            (q.type as AuthoredQuizCard["questionType"]) ?? "single",
          question: legacyText(q.question ?? ""),
          category: q.category ? legacyText(q.category) : undefined,
          note: q.note ? legacyText(q.note) : undefined,
          timeSeconds: typeof q.time === "number" ? q.time : 20,
          cooldownSeconds: typeof q.cooldown === "number" ? q.cooldown : 3,
          maxPoints: typeof q.maxPoints === "number" ? q.maxPoints : 1000,
          penalty: typeof q.penalty === "number" ? q.penalty : 0,
          media: q.media as AuthoredQuizCard["media"],
          answers: authoredAnswers,
          correctAnswers: correctAnswers.length > 0 ? correctAnswers : [1],
          options: q.options as AuthoredQuizCard["options"],
          reveal: perQ?.reveal,
          interlude: perQ?.interlude,
          questionEntrance: perQ?.questionEntrance,
          background: perQ?.background,
          audioCues: perQ?.audioCues,
          stageAnimations: perQ?.stageAnimations,
          questionDecoration: perQ?.questionDecoration,
          themeOverrides: perQ?.themeOverrides,
        })
      }
    } else {
      sceneCount += 1
      const scene = extrasV2.scenes[item.sceneId]
      const sKey = `${item.kind.toUpperCase()}_${String(sceneCount).padStart(2, "0")}`

      if (!scene) {
        continue
      }

      const sceneAppearance = {
        ...(scene.background
          ? {
              background: scene.background,
            }
          : {}),
        ...(scene.themeOverrides
          ? {
              themeOverrides: scene.themeOverrides,
            }
          : {}),
        ...(scene.audio
          ? {
              audio: scene.audio,
            }
          : {}),
        ...(scene.stageAnimations
          ? {
              stageAnimations: scene.stageAnimations,
            }
          : {}),
      }

      switch (scene.kind) {
        case "transition":
          cards.push({
            key: sKey,
            kind: "transition",
            title: scene.title,
            description: scene.description,
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break

        case "animation":
          cards.push({
            key: sKey,
            kind: "animation",
            preset: scene.preset,
            title: scene.title,
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...(scene.lottieUrl
              ? {
                  lottieUrl: scene.lottieUrl,
                }
              : {}),
            ...(scene.lottieFit
              ? {
                  lottieFit: scene.lottieFit,
                }
              : {}),
            ...(scene.lottieLoop !== undefined
              ? {
                  lottieLoop: scene.lottieLoop,
                }
              : {}),
            ...(scene.lottieSpeed !== undefined
              ? {
                  lottieSpeed: scene.lottieSpeed,
                }
              : {}),
            ...sceneAppearance,
          })

          break

        case "media":
          cards.push({
            key: sKey,
            kind: "media",
            mediaUrl: scene.mediaUrl,
            mediaType: scene.mediaType,
            title: scene.title,
            ...(scene.subtitle !== undefined
              ? {
                  subtitle: scene.subtitle,
                }
              : {}),
            ...(scene.stageLayout
              ? {
                  stageLayout: scene.stageLayout,
                }
              : {}),
            ...(scene.textOverlay !== undefined
              ? {
                  textOverlay: scene.textOverlay,
                }
              : {}),
            ...(scene.endBehavior
              ? {
                  endBehavior: scene.endBehavior,
                }
              : {}),
            durationMs: scene.durationMs,
            ...(scene.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: scene.mediaEndFallbackMs,
                }
              : {}),
            advance: scene.advance,
            ...(scene.volume !== undefined
              ? {
                  volume: scene.volume,
                }
              : {}),
            ...(scene.loop !== undefined
              ? {
                  loop: scene.loop,
                }
              : {}),
            ...(scene.muted !== undefined
              ? {
                  muted: scene.muted,
                }
              : {}),
            ...(scene.showControls !== undefined
              ? {
                  showControls: scene.showControls,
                }
              : {}),
            ...(scene.mediaFit
              ? {
                  mediaFit: scene.mediaFit,
                }
              : {}),
            ...(scene.overlayAnimations
              ? {
                  overlayAnimations: scene.overlayAnimations,
                }
              : {}),
            ...sceneAppearance,
          })

          break

        case "leaderboard":
          cards.push({
            key: sKey,
            kind: "leaderboard",
            title: scene.title,
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break

        case "interimResults":
          cards.push({
            key: sKey,
            kind: "interimResults",
            title: scene.title,
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break

        case "answerRecap": {
          const startQuestionKey = scene.startQuestionId
            ? questionIdToCardKey.get(scene.startQuestionId)
            : undefined
          cards.push({
            key: sKey,
            kind: "answerRecap",
            title: scene.title,
            ...(startQuestionKey
              ? {
                  startQuestionKey,
                }
              : {}),
            mode: scene.mode ?? "mostSelected",
            ...(scene.maxItemsPerPage !== undefined
              ? {
                  maxItemsPerPage: scene.maxItemsPerPage,
                }
              : {}),
            ...(scene.showCounts !== undefined
              ? {
                  showCounts: scene.showCounts,
                }
              : {}),
            ...(scene.showPercentages !== undefined
              ? {
                  showPercentages: scene.showPercentages,
                }
              : {}),
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break
        }

        case "countdown":
          cards.push({
            key: sKey,
            kind: "countdown",
            durationSeconds: scene.durationSeconds,
            title: scene.title,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break

        case "opening":
          cards.push({
            key: sKey,
            kind: "opening",
            title: scene.title,
            subtitle: scene.subtitle,
            mediaUrl: scene.mediaUrl,
            ...(scene.mediaType
              ? {
                  mediaType: scene.mediaType,
                }
              : {}),
            ...(scene.stageLayout
              ? {
                  stageLayout: scene.stageLayout,
                }
              : {}),
            ...(scene.mediaFit
              ? {
                  mediaFit: scene.mediaFit,
                }
              : {}),
            ...(scene.logoPosition
              ? {
                  logoPosition: scene.logoPosition,
                }
              : {}),
            ...(scene.textOverlay !== undefined
              ? {
                  textOverlay: scene.textOverlay,
                }
              : {}),
            ...(scene.endBehavior
              ? {
                  endBehavior: scene.endBehavior,
                }
              : {}),
            ...(scene.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: scene.mediaEndFallbackMs,
                }
              : {}),
            ...(scene.volume !== undefined
              ? {
                  volume: scene.volume,
                }
              : {}),
            ...(scene.loop !== undefined
              ? {
                  loop: scene.loop,
                }
              : {}),
            ...(scene.muted !== undefined
              ? {
                  muted: scene.muted,
                }
              : {}),
            ...(scene.showControls !== undefined
              ? {
                  showControls: scene.showControls,
                }
              : {}),
            ...(scene.lottieUrl
              ? {
                  lottieUrl: scene.lottieUrl,
                }
              : {}),
            ...(scene.lottieFit
              ? {
                  lottieFit: scene.lottieFit,
                }
              : {}),
            ...(scene.lottieLoop !== undefined
              ? {
                  lottieLoop: scene.lottieLoop,
                }
              : {}),
            ...(scene.lottieSpeed !== undefined
              ? {
                  lottieSpeed: scene.lottieSpeed,
                }
              : {}),
            ...(scene.overlayAnimations
              ? {
                  overlayAnimations: scene.overlayAnimations,
                }
              : {}),
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break

        case "closing":
          cards.push({
            key: sKey,
            kind: "closing",
            title: scene.title,
            subtitle: scene.subtitle,
            mediaUrl: scene.mediaUrl,
            ...(scene.mediaType
              ? {
                  mediaType: scene.mediaType,
                }
              : {}),
            ...(scene.stageLayout
              ? {
                  stageLayout: scene.stageLayout,
                }
              : {}),
            ...(scene.mediaFit
              ? {
                  mediaFit: scene.mediaFit,
                }
              : {}),
            ...(scene.logoPosition
              ? {
                  logoPosition: scene.logoPosition,
                }
              : {}),
            ...(scene.textOverlay !== undefined
              ? {
                  textOverlay: scene.textOverlay,
                }
              : {}),
            ...(scene.endBehavior
              ? {
                  endBehavior: scene.endBehavior,
                }
              : {}),
            ...(scene.mediaEndFallbackMs !== undefined
              ? {
                  mediaEndFallbackMs: scene.mediaEndFallbackMs,
                }
              : {}),
            ...(scene.volume !== undefined
              ? {
                  volume: scene.volume,
                }
              : {}),
            ...(scene.loop !== undefined
              ? {
                  loop: scene.loop,
                }
              : {}),
            ...(scene.muted !== undefined
              ? {
                  muted: scene.muted,
                }
              : {}),
            ...(scene.showControls !== undefined
              ? {
                  showControls: scene.showControls,
                }
              : {}),
            ...(scene.lottieUrl
              ? {
                  lottieUrl: scene.lottieUrl,
                }
              : {}),
            ...(scene.lottieFit
              ? {
                  lottieFit: scene.lottieFit,
                }
              : {}),
            ...(scene.lottieLoop !== undefined
              ? {
                  lottieLoop: scene.lottieLoop,
                }
              : {}),
            ...(scene.lottieSpeed !== undefined
              ? {
                  lottieSpeed: scene.lottieSpeed,
                }
              : {}),
            ...(scene.overlayAnimations
              ? {
                  overlayAnimations: scene.overlayAnimations,
                }
              : {}),
            durationMs: scene.durationMs,
            advance: scene.advance,
            ...sceneAppearance,
          })

          break
      }
    }
  }

  // Preserve any non-default audio, teams, leaderboard, or roster in settings
  const settings: AuthoredSetting[] = []

  if (extrasV2.leaderboard) {
    if (extrasV2.leaderboard.mode) {
      settings.push({
        scope: "leaderboard",
        targetKey: "show",
        property: "mode",
        valueJson: extrasV2.leaderboard.mode,
      })
    }

    if (extrasV2.leaderboard.everyN !== undefined) {
      settings.push({
        scope: "leaderboard",
        targetKey: "show",
        property: "everyN",
        valueJson: extrasV2.leaderboard.everyN,
      })
    }

    if (
      extrasV2.leaderboard.afterQuestionIds &&
      extrasV2.leaderboard.afterQuestionIds.length > 0
    ) {
      const mappedKeys = extrasV2.leaderboard.afterQuestionIds
        .map((qId) => questionIdToCardKey.get(qId))
        .filter((k): k is string => Boolean(k))

      if (mappedKeys.length > 0) {
        settings.push({
          scope: "leaderboard",
          targetKey: "show",
          property: "afterQuestionIds",
          valueJson: mappedKeys,
        })
      }
    }
  }

  // Preserve teams even if enabled is false as long as definitions exist
  if (
    extrasV2.teams &&
    (extrasV2.teams.enabled || extrasV2.teams.teams.length > 0)
  ) {
    settings.push({
      scope: "team",
      targetKey: "show",
      property: "config",
      valueJson: extrasV2.teams,
    })
  }

  // Preserve audio cues losslessly
  if (extrasV2.audio?.cues) {
    settings.push({
      scope: "audio",
      targetKey: "show",
      property: "cues",
      valueJson: extrasV2.audio.cues,
    })
  }

  // Preserve roster configuration (Gate D02: omit participant PII by default unless explicitly requested)
  if (
    extrasV2.roster &&
    (extrasV2.roster.phoneInviteOnly ||
      (extrasV2.roster.participants && extrasV2.roster.participants.length > 0))
  ) {
    const shouldIncludeParticipants = Boolean(options?.includePrivateRoster)
    const exportRoster = {
      phoneInviteOnly: extrasV2.roster.phoneInviteOnly ?? false,
      participants: shouldIncludeParticipants
        ? extrasV2.roster.participants
        : [],
    }
    settings.push({
      scope: "roster",
      targetKey: "show",
      property: "config",
      valueJson: exportRoster,
    })
  }

  if (extrasV2.mediaCatalog && extrasV2.mediaCatalog.length > 0) {
    settings.push({
      scope: "media",
      targetKey: "show",
      property: "catalog",
      valueJson: extrasV2.mediaCatalog,
    })
  }

  const showNote = (() => {
    if (extrasV2.authoring?.showNote !== undefined) {
      return extrasV2.authoring.showNote
    }

    if (typeof quizz.note === "string") {
      return quizz.note
    }

    return undefined
  })()

  return {
    format: "tada-show",
    version: 1,
    title: legacyText(quizz.subject ?? "Untitled Show"),
    note: showNote,
    baseGameMode: (quizz.gameMode as "quiz" | "survey") ?? "quiz",
    defaults: extrasV2.defaults,
    cards,
    settings,
  }
}
