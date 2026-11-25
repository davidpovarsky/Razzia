// Payload-only admission. No producer, hashing, registry authority, transport or IO.
import { z } from "zod"
import {
  cardStageAnimationsSchema,
  questionDecorationSchema,
} from "../card-appearance"
import { SHOW_THEME_SLOTS } from "../show-themes/selection"
import {
  ORIGINAL_THEME_IDS,
  isOriginalThemeId,
} from "../show-themes/original-theme-families"
import {
  nativePreviewFrameV1Schema,
  nativePreviewRendererInputV1Schema,
} from "./native-preview-frame-schema"

const identifier = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9._-]+$/u)
const digest = z.string().regex(/^[a-f0-9]{64}$/u)

export const nativePreviewVisualSettingsV2Schema = z
  .strictObject({
    stageAnimations: cardStageAnimationsSchema,
    questionDecoration: questionDecorationSchema,
  })
  .superRefine((settings, ctx) => {
    if (
      settings.questionDecoration.lottieUrl !== undefined ||
      (settings.questionDecoration.enabled &&
        settings.questionDecoration.preset === "lottie")
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-preview:native-media-binding-unavailable",
      })
    }
  })

export const nativePreviewThemeBindingV2Schema = z
  .strictObject({
    format: z.literal("tadazz-native-preview-theme"),
    schemaVersion: z.literal(2),
    portVersion: z.literal(3),
    identityRuleVersion: z.literal(2),
    questionId: z.string().regex(/^preview-question-[a-f0-9]{64}$/u),
    role: z.enum(["manager", "spectator"]),
    draftRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    theme: z.strictObject({
      id: z.enum(["tadazz-classic", "razzia-original", ...ORIGINAL_THEME_IDS]),
      version: z.literal("1.0.0"),
    }),
    rendererId: z.enum([
      "tadazz-classic-stage",
      "razzia-native-stage",
      "tadazz-original-stage",
    ]),
    definitionSha256: digest,
    compositionDocumentSha256: digest,
    slots: z.record(
      z.enum(SHOW_THEME_SLOTS),
      z.strictObject({ variantId: identifier }),
    ),
    settings: nativePreviewVisualSettingsV2Schema,
  })
  .superRefine((binding, ctx) => {
    const legacyRenderer =
      binding.theme.id === "tadazz-classic"
        ? "tadazz-classic-stage"
        : "razzia-native-stage"
    const renderer = isOriginalThemeId(binding.theme.id)
      ? "tadazz-original-stage"
      : legacyRenderer

    if (
      binding.rendererId !== renderer ||
      Object.values(binding.slots).some(
        (slot) => !slot.variantId.startsWith(`${binding.theme.id}.`),
      )
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-preview:native-theme-family-mismatch",
      })
    }
  })

export const nativePreviewRendererInputV2Schema = z
  .strictObject({
    inputVersion: z.literal(2),
    frame: nativePreviewFrameV1Schema,
    locale: nativePreviewRendererInputV1Schema.shape.locale,
    reducedMotion: z.boolean(),
    themeBinding: nativePreviewThemeBindingV2Schema,
  })
  .superRefine((input, ctx) => {
    if (
      input.frame.question.id !== input.themeBinding.questionId ||
      input.frame.role !== input.themeBinding.role ||
      input.frame.revision !== input.themeBinding.draftRevision
    ) {
      ctx.addIssue({
        code: "custom",
        message: "show-preview:theme-frame-association",
      })
    }
  })

export type NativePreviewRendererInputV2 = z.infer<
  typeof nativePreviewRendererInputV2Schema
>

export type NativePreviewThemeBindingV2 = z.infer<
  typeof nativePreviewThemeBindingV2Schema
>

export type NativePreviewCandidateMountV2 = (
  element: HTMLElement,
  onUnavailable: () => void,
) => {
  update(input: NativePreviewRendererInputV2): void
  dispose(): void
  diagnostics?(): {
    disposed: boolean
    handleId: number | null
    lifecycle: Array<{ event: "mounted" | "disposed"; handleId: number }>
  }
}
