import { z } from "zod"
import {
  cardStageAnimationsSchema,
  questionDecorationSchema,
} from "../card-appearance"
import { cinematicOverlayAnimationsArraySchema } from "../cinematic-overlays"
import {
  assertBoundedJson,
  exactRefSchema,
  freeze,
  previewRoleSchema,
} from "./primitives"

export const nativePresentationValuesSchema = z.strictObject({
  stageAnimations: cardStageAnimationsSchema.optional(),
  questionDecoration: questionDecorationSchema.optional(),
  overlayAnimations: cinematicOverlayAnimationsArraySchema.optional(),
})

const roles = z.partialRecord(previewRoleSchema, nativePresentationValuesSchema)
const cardKey = z.string().min(1).max(160)

export const nativePresentationSettingsV1Schema = z
  .strictObject({
    format: z.literal("tadazz-native-presentation-settings"),
    schemaVersion: z.literal(1),
    defaults: nativePresentationValuesSchema,
    roles,
    cards: z
      .array(
        z.strictObject({
          authoredCardKey: cardKey,
          theme: exactRefSchema,
          settings: nativePresentationValuesSchema,
          roles,
        }),
      )
      .max(128),
  })
  .superRefine((settings, ctx) => {
    const keys = settings.cards.map((entry) =>
      JSON.stringify([
        entry.authoredCardKey,
        entry.theme.id,
        entry.theme.version,
      ]),
    )

    if (new Set(keys).size !== keys.length) {
      ctx.addIssue({
        code: "custom",
        message: "show-library:duplicate-native-card-setting",
      })
    }
  })

export type NativePresentationValues = z.infer<
  typeof nativePresentationValuesSchema
>

export type NativePresentationSettingsV1 = z.infer<
  typeof nativePresentationSettingsV1Schema
>

function merge(
  left: NativePresentationValues,
  right: NativePresentationValues = {},
): NativePresentationValues {
  return {
    ...(left.stageAnimations || right.stageAnimations
      ? {
          stageAnimations: {
            ...left.stageAnimations,
            ...right.stageAnimations,
          },
        }
      : {}),
    ...((right.questionDecoration ?? left.questionDecoration)
      ? {
          questionDecoration:
            right.questionDecoration ?? left.questionDecoration,
        }
      : {}),
    ...((right.overlayAnimations ?? left.overlayAnimations)
      ? { overlayAnimations: right.overlayAnimations ?? left.overlayAnimations }
      : {}),
  }
}

/** Source card keys are values in bounded arrays, never JS dictionary keys/aliases. */
export function resolveNativePresentationLayers(
  input: unknown,
  contextInput: unknown,
) {
  assertBoundedJson(input)
  assertBoundedJson(contextInput)
  const settings = nativePresentationSettingsV1Schema.parse(input)
  const { role, theme, authoredCardKey } = z
    .strictObject({
      role: previewRoleSchema,
      theme: exactRefSchema,
      authoredCardKey: cardKey,
    })
    .parse(contextInput)
  const card = settings.cards.find(
    (entry) =>
      entry.authoredCardKey === authoredCardKey &&
      entry.theme.id === theme.id &&
      entry.theme.version === theme.version,
  )

  return freeze({
    global: merge(settings.defaults, settings.roles[role]),
    card: merge(card?.settings ?? {}, card?.roles[role]),
  })
}
