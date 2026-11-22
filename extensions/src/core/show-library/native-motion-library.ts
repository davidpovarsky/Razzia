import { z } from "zod"
import {
  cardStageAnimationsSchema,
  QUESTION_DECORATION_PRESETS,
  questionDecorationSchema,
  STAGE_ANIMATION_PRESETS,
  stageAnimationSlotSchema,
} from "../card-appearance"
import {
  cinematicOverlayAnimationSchema,
  MAX_CINEMATIC_OVERLAY_ANIMATIONS,
  OVERLAY_ANCHORS,
  OVERLAY_FINISH_MODES,
  OVERLAY_FITS,
  OVERLAY_LAYERS,
  OVERLAY_TIME_BASES,
} from "../cinematic-overlays"
import { getNativeShowLibrary } from "./native-library"
import { assertBoundedJson, freeze } from "./primitives"
import { createNativeLibraryPager } from "./native-library-page"

const library = freeze({
  format: "tadazz-native-motion-library" as const,
  schemaVersion: 1 as const,
  version: "1.0.0",
  stageEntrances: STAGE_ANIMATION_PRESETS.map((preset) => ({
    preset,
    defaults: stageAnimationSlotSchema.parse({ preset }),
    configurationSlots: Object.keys(cardStageAnimationsSchema.shape),
    source: "extensions/src/core/card-appearance.ts#stageAnimationSlotSchema",
  })),
  questionDecorations: QUESTION_DECORATION_PRESETS.map((preset) => ({
    preset,
    defaults: questionDecorationSchema.parse({ preset }),
    source: "extensions/src/core/card-appearance.ts#questionDecorationSchema",
  })),
  cinematicOverlay: {
    source:
      "extensions/src/core/cinematic-overlays.ts#cinematicOverlayAnimationSchema",
    maxPerScene: MAX_CINEMATIC_OVERLAY_ANIMATIONS,
    anchors: [...OVERLAY_ANCHORS],
    fits: [...OVERLAY_FITS],
    layers: [...OVERLAY_LAYERS],
    timeBases: [...OVERLAY_TIME_BASES],
    finishModes: [...OVERLAY_FINISH_MODES],
  },
  nativeChoreography: getNativeShowLibrary().families.map((family) => ({
    theme: family.ref,
    presets: family.motionPresets,
    ownership: "native-template" as const,
  })),
  seek: "unavailable" as const,
  lifecycleAcceptance: "not-evaluated" as const,
  runtimeOwner: "existing-native-stage-and-cinematic-owners" as const,
})

const readPage = createNativeLibraryPager(
  {
    format: library.format,
    schemaVersion: library.schemaVersion,
    version: library.version,
    cinematicOverlay: library.cinematicOverlay,
    seek: library.seek,
    lifecycleAcceptance: library.lifecycleAcceptance,
    runtimeOwner: library.runtimeOwner,
  },
  [
    ...library.stageEntrances.map((value) => ({ collection: "stageEntrances" as const, value })),
    ...library.questionDecorations.map((value) => ({ collection: "questionDecorations" as const, value })),
    ...library.nativeChoreography.map((value) => ({ collection: "nativeChoreography" as const, value })),
  ],
)

const settingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal("stage-entrance"),
    settings: stageAnimationSlotSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal("question-decoration"),
    settings: questionDecorationSchema,
  }),
  z.strictObject({
    schemaVersion: z.literal(1),
    kind: z.literal("cinematic-overlay"),
    settings: cinematicOverlayAnimationSchema,
  }),
])

export type NativeMotionSetting = z.infer<typeof settingSchema>

/** Uses existing strict schemas; no new playback, timers, JS, CSS or Lottie grant. */
export function parseNativeMotionSetting(
  input: unknown,
): Readonly<NativeMotionSetting> {
  assertBoundedJson(input)

  return freeze(settingSchema.parse(input))
}

/** Complete in-process configuration discovery; no generic replay/seek grant. */
export function getNativeMotionLibrary(): typeof library {
  return library
}

/** Every motion configuration collection, with the same bounded JSON contract. */
export function getNativeMotionLibraryPage(input: unknown = {}) {
  return readPage(input)
}
