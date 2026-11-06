import { z } from "zod"
import { type CueId } from "./constants.js"
import { lottieMetaSchema } from "./lottie.js"
import { isSafeMediaUrl, safeMediaUrlSchema } from "./media.js"

// ── 1. Per-Card Background Override ─────────────────────────────────────────

export const BACKGROUND_FITS = ["cover", "contain"] as const

export type BackgroundFit = (typeof BACKGROUND_FITS)[number]

export const backgroundFitSchema = z.enum(BACKGROUND_FITS)

export const BACKGROUND_POSITIONS = [
  "center",
  "top",
  "bottom",
  "left",
  "right",
] as const

export type BackgroundPosition = (typeof BACKGROUND_POSITIONS)[number]

export const backgroundPositionSchema = z.enum(BACKGROUND_POSITIONS)

export const cardBackgroundOverrideSchema = z.strictObject({
  url: safeMediaUrlSchema,
  fit: backgroundFitSchema.default("cover"),
  position: backgroundPositionSchema.default("center"),
  overlayOpacity: z.number().min(0).max(0.85).default(0.35),
})

export type CardBackgroundOverride = z.infer<
  typeof cardBackgroundOverrideSchema
>

/**
 * Resolves the effective background for a timeline card.
 * Precedence: valid card background override > game branding background > default background.
 */
export const resolveEffectiveCardBackground = (
  cardBackground?: CardBackgroundOverride | null,
  gameBackgroundUrl?: string | null,
  defaultBackgroundUrl?: string | null,
): {
  mode: "card" | "game"
  url?: string
  fit: BackgroundFit
  position: BackgroundPosition
  overlayOpacity: number
} => {
  if (
    cardBackground?.url &&
    cardBackground.url.trim().length > 0 &&
    isSafeMediaUrl(cardBackground.url)
  ) {
    return {
      mode: "card",
      url: cardBackground.url.trim(),
      fit: cardBackground.fit ?? "cover",
      position: cardBackground.position ?? "center",
      overlayOpacity: cardBackground.overlayOpacity ?? 0.35,
    }
  }

  return {
    mode: "game",
    url: gameBackgroundUrl ?? defaultBackgroundUrl ?? undefined,
    fit: "cover",
    position: "center",
    overlayOpacity: 0,
  }
}

// ── 2. Per-Card Audio Cue Overrides ─────────────────────────────────────────

export const CARD_AUDIO_MODES = ["inherit", "mute", "custom"] as const

export type CardAudioMode = (typeof CARD_AUDIO_MODES)[number]

export const cardAudioModeSchema = z.enum(CARD_AUDIO_MODES)

export const cardAudioCueOverrideSchema = z
  .strictObject({
    mode: cardAudioModeSchema.default("inherit"),
    url: safeMediaUrlSchema.optional(),
    volume: z.number().min(0).max(1).default(0.8),
    loop: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.mode === "custom" && !val.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "errors:invalidMediaUrl",
        path: ["url"],
      })
    }
  })

export type CardAudioCueOverride = z.infer<typeof cardAudioCueOverrideSchema>

export const QUESTION_AUDIO_CUE_KEYS = [
  "showQuestion",
  "answersMusic",
  "revealResults",
] as const

export type QuestionAudioCueKey = (typeof QUESTION_AUDIO_CUE_KEYS)[number]

export const cardAudioOverridesSchema = z.strictObject({
  showQuestion: cardAudioCueOverrideSchema.optional(),
  answersMusic: cardAudioCueOverrideSchema.optional(),
  revealResults: cardAudioCueOverrideSchema.optional(),
})

export type CardAudioOverrides = z.infer<typeof cardAudioOverridesSchema>

export interface ResolvedAudioCueOutput {
  shouldPlay: boolean
  mutedByOverride: boolean
  managedByExtension: boolean
  cueId: CueId
  url?: string
  volume: number
  loop: boolean
}

/**
 * Resolves the single authoritative audio cue configuration for a given phase cueId.
 * Precedence:
 *   1. Card-level override (`mute` -> silence; `custom` -> custom URL/volume/loop)
 *   2. Show-level global `audio.cues[cueId]` (`enabled: false` -> silence; `source: custom` -> custom URL)
 *   3. Built-in default sound (`defaultUrl`)
 */
export const resolveEffectiveAudioCue = (params: {
  cueId: CueId
  cardAudioCues?: CardAudioOverrides | null
  sceneAudio?: {
    mode?: CardAudioMode
    cueId?: CueId
    url?: string
    volume?: number
    loop?: boolean
  } | null
  globalAudio?: {
    cues?: Partial<
      Record<
        CueId,
        {
          enabled?: boolean
          source?: "default" | "media" | "custom"
          url?: string
          volume?: number
          loop?: boolean
        }
      >
    >
  } | null
  defaultUrl: string
  defaultVolume?: number
  defaultLoop?: boolean
  hasCompetingMediaAudio?: boolean
}): ResolvedAudioCueOutput => {
  const {
    cueId,
    cardAudioCues,
    sceneAudio,
    globalAudio,
    defaultUrl,
    defaultVolume = 0.8,
    defaultLoop = cueId === "answersMusic",
    hasCompetingMediaAudio = false,
  } = params

  // If the card has competing foreground video/audio during this phase, suppress background loop music
  if (hasCompetingMediaAudio && cueId === "answersMusic") {
    return {
      shouldPlay: false,
      mutedByOverride: true,
      managedByExtension: true,
      cueId,
      volume: 0,
      loop: false,
    }
  }

  // 1. Check scene-level audio override if provided
  if (sceneAudio) {
    const mode =
      sceneAudio.mode ??
      (sceneAudio.url || sceneAudio.cueId ? "custom" : "inherit")

    if (mode === "mute") {
      return {
        shouldPlay: false,
        mutedByOverride: true,
        managedByExtension: true,
        cueId,
        volume: 0,
        loop: false,
      }
    }

    if (mode === "custom" && sceneAudio.url) {
      return {
        shouldPlay: true,
        mutedByOverride: false,
        managedByExtension: true,
        cueId,
        url: sceneAudio.url,
        volume: sceneAudio.volume ?? defaultVolume,
        loop: sceneAudio.loop ?? false,
      }
    }
  }

  // 2. Check question card-level override if applicable
  const cardOverride: CardAudioCueOverride | undefined =
    cueId === "showQuestion"
      ? cardAudioCues?.showQuestion
      : cueId === "answersMusic"
        ? cardAudioCues?.answersMusic
        : cueId === "revealResults"
          ? cardAudioCues?.revealResults
          : undefined

  if (cardOverride) {
    if (cardOverride.mode === "mute") {
      return {
        shouldPlay: false,
        mutedByOverride: true,
        managedByExtension: true,
        cueId,
        volume: 0,
        loop: false,
      }
    }

    if (cardOverride.mode === "custom" && cardOverride.url) {
      return {
        shouldPlay: true,
        mutedByOverride: false,
        managedByExtension: true,
        cueId,
        url: cardOverride.url,
        volume: cardOverride.volume ?? defaultVolume,
        loop: cardOverride.loop ?? defaultLoop,
      }
    }
  }

  // 3. Check global show-level audio cue configuration
  const globalCue = globalAudio?.cues?.[cueId]

  if (globalCue) {
    if (globalCue.enabled === false) {
      return {
        shouldPlay: false,
        mutedByOverride: true,
        managedByExtension: true,
        cueId,
        volume: 0,
        loop: false,
      }
    }

    const effectiveUrl =
      (globalCue.source === "media" || globalCue.source === "custom") &&
      globalCue.url
        ? globalCue.url
        : defaultUrl

    return {
      shouldPlay: true,
      mutedByOverride: false,
      managedByExtension: true,
      cueId,
      url: effectiveUrl,
      volume: globalCue.volume ?? defaultVolume,
      loop: globalCue.loop ?? defaultLoop,
    }
  }

  // 4. Fallback to original Razzia default sound
  return {
    shouldPlay: true,
    mutedByOverride: false,
    managedByExtension: false,
    cueId,
    url: defaultUrl,
    volume: defaultVolume,
    loop: defaultLoop,
  }
}

// ── 3. Independent Staged Animations ────────────────────────────────────────

export const STAGE_ANIMATION_PRESETS = [
  "none",
  "fade",
  "slide-up",
  "slide-side",
  "zoom-soft",
  "spotlight",
  "curtain",
  "pop-bounce",
  "wobble-settle",
  "cascade",
  "fan-flip",
  "wipe-ripple",
] as const

export type StageAnimationPreset = (typeof STAGE_ANIMATION_PRESETS)[number]

export const stageAnimationPresetSchema = z.enum(STAGE_ANIMATION_PRESETS)

export const STAGE_ANIMATION_TIMINGS = ["simultaneous", "sequential"] as const

export type StageAnimationTiming = (typeof STAGE_ANIMATION_TIMINGS)[number]

export const stageAnimationTimingSchema = z.enum(STAGE_ANIMATION_TIMINGS)

export const stageAnimationSlotSchema = z.strictObject({
  preset: stageAnimationPresetSchema.default("none"),
  durationMs: z.number().int().min(250).max(2500).default(800),
  timing: stageAnimationTimingSchema.default("simultaneous"),
  staggerMs: z.number().int().min(0).max(300).default(90),
})

export type StageAnimationSlot = z.infer<typeof stageAnimationSlotSchema>

export const cardStageAnimationsSchema = z.strictObject({
  questionEntrance: stageAnimationSlotSchema.optional(),
  answerEntrance: stageAnimationSlotSchema.optional(),
  answerBadgeEntrance: stageAnimationSlotSchema.optional(),
  resultsRevealEntrance: stageAnimationSlotSchema.optional(),
})

export type CardStageAnimations = z.infer<typeof cardStageAnimationsSchema>

export interface ResolvedCardStageAnimations {
  questionEntrance: StageAnimationSlot
  answerEntrance: StageAnimationSlot
  answerBadgeEntrance: StageAnimationSlot
  resultsRevealEntrance: StageAnimationSlot
}

const DEFAULT_SLOT: StageAnimationSlot = {
  preset: "none",
  durationMs: 800,
  timing: "simultaneous",
  staggerMs: 90,
}

export const clampAnimationDurationMs = (ms?: number): number => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return 800
  }

  return Math.min(2500, Math.max(250, Math.round(ms)))
}

export const clampAnimationStaggerMs = (ms?: number): number => {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return 90
  }

  return Math.min(300, Math.max(0, Math.round(ms)))
}

/**
 * Resolves all 4 independent stage animation slots for a question or scene,
 * preserving backward compatibility with legacy `questionEntrance` and
 * falling back to `globalStageAnimations` when a per-card slot is omitted (`undefined`),
 * while honoring an explicit `{ preset: "none" }` override on the card.
 */
export const resolveCardStageAnimations = (
  input?: {
    questionEntrance?: {
      preset?: StageAnimationPreset
      durationMs?: number
    } | null
    stageAnimations?: CardStageAnimations | null
    globalStageAnimations?: CardStageAnimations | null
  } | null,
): ResolvedCardStageAnimations => {
  const sa = input?.stageAnimations
  const legacyQe = input?.questionEntrance
  const globalSa = input?.globalStageAnimations

  const qSlot =
    sa?.questionEntrance ??
    (legacyQe && legacyQe.preset && legacyQe.preset !== "none"
      ? {
          preset: legacyQe.preset,
          durationMs: clampAnimationDurationMs(legacyQe.durationMs),
          timing: "simultaneous" as const,
          staggerMs: 90,
        }
      : (globalSa?.questionEntrance ??
        (legacyQe
          ? {
              preset: legacyQe.preset ?? "none",
              durationMs: clampAnimationDurationMs(legacyQe.durationMs),
              timing: "simultaneous" as const,
              staggerMs: 90,
            }
          : DEFAULT_SLOT)))

  const normalizeSlot = (
    slot?: Partial<StageAnimationSlot> | null,
  ): StageAnimationSlot => {
    if (!slot) {
      return { ...DEFAULT_SLOT }
    }

    return {
      preset: STAGE_ANIMATION_PRESETS.includes(
        slot.preset as StageAnimationPreset,
      )
        ? (slot.preset as StageAnimationPreset)
        : "none",
      durationMs: clampAnimationDurationMs(slot.durationMs),
      timing: slot.timing === "sequential" ? "sequential" : "simultaneous",
      staggerMs: clampAnimationStaggerMs(slot.staggerMs),
    }
  }

  return {
    questionEntrance: normalizeSlot(qSlot),
    answerEntrance: normalizeSlot(
      sa?.answerEntrance ?? globalSa?.answerEntrance,
    ),
    answerBadgeEntrance: normalizeSlot(
      sa?.answerBadgeEntrance ?? globalSa?.answerBadgeEntrance,
    ),
    resultsRevealEntrance: normalizeSlot(
      sa?.resultsRevealEntrance ?? globalSa?.resultsRevealEntrance,
    ),
  }
}

// ── 3b. Decorative Question Underline / Header Effect ───────────────────────

export const QUESTION_DECORATION_PRESETS = [
  "none",
  "pulse-bar",
  "shimmer-line",
  "wave-dots",
  "glow-sweep",
  "lottie",
] as const

export type QuestionDecorationPreset =
  (typeof QUESTION_DECORATION_PRESETS)[number]

export const questionDecorationPresetSchema = z.enum(
  QUESTION_DECORATION_PRESETS,
)

export const questionDecorationSchema = z.strictObject({
  enabled: z.boolean().default(false),
  preset: questionDecorationPresetSchema.default("none"),
  lottieUrl: safeMediaUrlSchema.optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/u)
    .optional(),
})

export type QuestionDecoration = z.infer<typeof questionDecorationSchema>

/**
 * Resolves the effective decorative underline for a question card.
 * Precedence: explicit card decoration (`enabled: false` or custom preset) > global default > disabled.
 */
export const resolveQuestionDecoration = (
  input?: {
    cardDecoration?: Partial<QuestionDecoration> | null
    questionDecoration?: Partial<QuestionDecoration> | null
    globalDecoration?: Partial<QuestionDecoration> | null
  } | null,
): QuestionDecoration => {
  const source =
    input?.cardDecoration ??
    input?.questionDecoration ??
    input?.globalDecoration

  if (
    !source ||
    source.enabled === false ||
    !source.preset ||
    source.preset === "none"
  ) {
    return {
      enabled: false,
      preset: "none",
    }
  }

  return {
    enabled: true,
    preset: QUESTION_DECORATION_PRESETS.includes(source.preset)
      ? source.preset
      : "none",
    ...(source.lottieUrl ? { lottieUrl: source.lottieUrl } : {}),
    ...(source.color ? { color: source.color } : {}),
  }
}

// ── 4. Per-Show Logical Media Catalog ───────────────────────────────────────

export const showMediaCatalogItemSchema = z.strictObject({
  name: z.string().min(1).max(260),
  url: safeMediaUrlSchema,
  type: z.enum(["image", "audio", "video", "lottie"]),
  addedAt: z.number().int().nonnegative().optional(),
  lottieMeta: lottieMetaSchema.optional(),
})

export type ShowMediaCatalogItem = z.infer<typeof showMediaCatalogItemSchema>

// ── 5. Smart Question-to-Scene Blank Check ──────────────────────────────────

/**
 * Determines whether a question card is blank/unpopulated so that converting
 * it to a scene card can proceed immediately without an intrusive confirmation modal.
 */
export const isQuestionCardBlankForConversion = (
  question?: {
    question?: string
    answers?: string[]
    media?: { url?: string } | null
  } | null,
  perQuestionExtra?: {
    answerVisuals?: Array<{ url?: string }>
    background?: { url?: string }
    audioCues?: {
      showQuestion?: { mode?: string; url?: string }
      answersMusic?: { mode?: string; url?: string }
      revealResults?: { mode?: string; url?: string }
    }
    interlude?: { enabled?: boolean; mediaUrl?: string; title?: string }
    questionEntrance?: { preset?: string }
    stageAnimations?: {
      questionEntrance?: { preset?: string }
      answerEntrance?: { preset?: string }
      answerBadgeEntrance?: { preset?: string }
      resultsRevealEntrance?: { preset?: string }
    }
    questionDecoration?: { enabled?: boolean; preset?: string }
  } | null,
): boolean => {
  if (!question) {
    return true
  }

  if ((question.question ?? "").trim().length > 0) {
    return false
  }

  if (question.media?.url && question.media.url.trim().length > 0) {
    return false
  }

  if (
    Array.isArray(question.answers) &&
    question.answers.some((ans) => (ans ?? "").trim().length > 0)
  ) {
    return false
  }

  if (!perQuestionExtra) {
    return true
  }

  if (
    Array.isArray(perQuestionExtra.answerVisuals) &&
    perQuestionExtra.answerVisuals.some(
      (av) => av.url && av.url.trim().length > 0,
    )
  ) {
    return false
  }

  if (
    perQuestionExtra.background?.url &&
    perQuestionExtra.background.url.trim().length > 0
  ) {
    return false
  }

  const cues = perQuestionExtra.audioCues

  if (
    cues &&
    ((cues.showQuestion && cues.showQuestion.mode !== "inherit") ||
      (cues.answersMusic && cues.answersMusic.mode !== "inherit") ||
      (cues.revealResults && cues.revealResults.mode !== "inherit"))
  ) {
    return false
  }

  if (
    perQuestionExtra.interlude?.enabled ||
    (perQuestionExtra.interlude?.mediaUrl ?? "").trim().length > 0 ||
    (perQuestionExtra.interlude?.title ?? "").trim().length > 0
  ) {
    return false
  }

  if (
    perQuestionExtra.questionEntrance?.preset &&
    perQuestionExtra.questionEntrance.preset !== "none"
  ) {
    return false
  }

  const sa = perQuestionExtra.stageAnimations

  if (
    sa &&
    ((sa.questionEntrance?.preset && sa.questionEntrance.preset !== "none") ||
      (sa.answerEntrance?.preset && sa.answerEntrance.preset !== "none") ||
      (sa.answerBadgeEntrance?.preset &&
        sa.answerBadgeEntrance.preset !== "none") ||
      (sa.resultsRevealEntrance?.preset &&
        sa.resultsRevealEntrance.preset !== "none"))
  ) {
    return false
  }

  if (
    perQuestionExtra.questionDecoration?.enabled &&
    perQuestionExtra.questionDecoration.preset &&
    perQuestionExtra.questionDecoration.preset !== "none"
  ) {
    return false
  }

  return true
}

// ── 6. Stage Content Fit / Authoring Overflow Check ─────────────────────────

export interface StageFitWarning {
  field: "question" | "answer" | "sceneTitle" | "sceneSubtitle"
  index?: number
  currentLength: number
  recommendedMax: number
  messageKey: string
}

export const STAGE_RECOMMENDED_LIMITS = {
  questionTitle: 140,
  answerText: 65,
  sceneTitle: 90,
  sceneSubtitle: 180,
} as const

/**
 * Evaluates whether authored question/scene text risks stage crowding on 4:3 or compact screens,
 * returning non-blocking authoring warnings for the Studio editor.
 */
export const evaluateCardStageFitWarnings = (params: {
  question?: string
  answers?: string[]
  sceneTitle?: string
  sceneSubtitle?: string
}): StageFitWarning[] => {
  const warnings: StageFitWarning[] = []

  const qLen = (params.question ?? "").trim().length

  if (qLen > STAGE_RECOMMENDED_LIMITS.questionTitle) {
    warnings.push({
      field: "question",
      currentLength: qLen,
      recommendedMax: STAGE_RECOMMENDED_LIMITS.questionTitle,
      messageKey: "extensions:stageFit.questionTooLong",
    })
  }

  if (Array.isArray(params.answers)) {
    params.answers.forEach((ans, idx) => {
      const aLen = (ans ?? "").trim().length

      if (aLen > STAGE_RECOMMENDED_LIMITS.answerText) {
        warnings.push({
          field: "answer",
          index: idx,
          currentLength: aLen,
          recommendedMax: STAGE_RECOMMENDED_LIMITS.answerText,
          messageKey: "extensions:stageFit.answerTooLong",
        })
      }
    })
  }

  const stLen = (params.sceneTitle ?? "").trim().length

  if (stLen > STAGE_RECOMMENDED_LIMITS.sceneTitle) {
    warnings.push({
      field: "sceneTitle",
      currentLength: stLen,
      recommendedMax: STAGE_RECOMMENDED_LIMITS.sceneTitle,
      messageKey: "extensions:stageFit.sceneTitleTooLong",
    })
  }

  const ssLen = (params.sceneSubtitle ?? "").trim().length

  if (ssLen > STAGE_RECOMMENDED_LIMITS.sceneSubtitle) {
    warnings.push({
      field: "sceneSubtitle",
      currentLength: ssLen,
      recommendedMax: STAGE_RECOMMENDED_LIMITS.sceneSubtitle,
      messageKey: "extensions:stageFit.sceneSubtitleTooLong",
    })
  }

  return warnings
}
