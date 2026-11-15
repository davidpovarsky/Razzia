// HOST ONLY. The payload imports native-preview-renderer-v2-schema, never this file.
import {
  resolveCardStageAnimations,
  resolveQuestionDecoration,
} from "../card-appearance"
import { resolveShowTheme } from "../show-themes/resolve"
import { resolveCompositionSections } from "./assets"
import {
  assertCompositionPreviewV2,
  type ValidatedCompositionPreviewV2,
} from "./composition-preview-v2"
import { compositionDocumentV2Digest } from "./composition-document-v2"
import { canonicalJson } from "./digest"
import { getPreviewIdentityId } from "./identity"
import { findNativeShowLibraryFamily } from "./native-library"
import { resolveNativePresentationLayers } from "./native-presentation-settings"
import { produceNativePreviewFrameV1 } from "./native-preview-frame"
import {
  nativePreviewRendererInputV2Schema,
  type NativePreviewRendererInputV2,
} from "./native-preview-renderer-v2-schema"
import { freeze } from "./primitives"
import type { PreviewProjectionBinding } from "./projection"
import { derivePreviewStageMetadata } from "./stage-metadata"

const bindings = new WeakMap<
  object,
  {
    prepared: ValidatedCompositionPreviewV2
    questionId: string
    phase: string
    clock: string
  }
>()
function currentCard(
  preview: ValidatedCompositionPreviewV2,
  questionId: string,
) {
  const card = preview.draft.show.cards.find(
    (entry) =>
      (entry.kind === "quiz" || entry.kind === "survey") &&
      getPreviewIdentityId(
        preview.draft.input.identityMap,
        "questions",
        entry.key,
      ) === questionId,
  )

  if (!card || (card.kind !== "quiz" && card.kind !== "survey")) {
    throw new Error("show-preview:missing-authored-card")
  }

  return card
}
function assertController(
  preview: ValidatedCompositionPreviewV2,
  binding: PreviewProjectionBinding,
): void {
  assertCompositionPreviewV2(preview)

  if (binding.draft !== preview.draft || binding.plan !== preview.plan) {
    throw new Error("show-library:foreign-composition-preview-binding")
  }
}
function hasUrl(input: unknown): boolean {
  if (!input || typeof input !== "object") {
    return false
  }

  return Object.entries(input).some(
    ([name, value]) =>
      (/url$/iu.test(name) && typeof value === "string" && value !== "") ||
      hasUrl(value),
  )
}

/** Host audio owner may consume the existing resolved theme; never forward it as payload. */
export function resolveCompositionNativeHostThemeV2(
  preview: ValidatedCompositionPreviewV2,
  questionId: string,
) {
  assertCompositionPreviewV2(preview)
  const card = currentCard(preview, questionId)

  return resolveShowTheme({
    selection: preview.draft.show.defaults?.showTheme,
    scope: card.themeOverrides,
    role: preview.draft.input.context.role,
  })
}

/** Candidate data only: exact loader/pin/asset authority remains outside this producer. */
export function produceCompositionNativePreviewInputV2(
  preview: ValidatedCompositionPreviewV2,
  snapshot: unknown,
  binding: PreviewProjectionBinding,
) {
  assertController(preview, binding)
  const metadata = derivePreviewStageMetadata(
    preview.draft,
    preview.plan,
    binding.currentQuestionId,
  )
  const frame = produceNativePreviewFrameV1(
    snapshot,
    preview.draft.input.context,
    binding,
    metadata,
    preview.draftRevision,
  )
  const card = currentCard(preview, frame.question.id)
  const resolved = resolveCompositionNativeHostThemeV2(
    preview,
    frame.question.id,
  )
  const family = findNativeShowLibraryFamily({
    id: resolved.requested.id,
    version: resolved.requested.version,
  })
  const reasons: string[] = []

  if (!family) {
    reasons.push("native-theme-not-bundled")
  }

  const scopeId = preview.scopeBindings.find(
    (entry) => entry.authoredCardKey === card.key,
  )?.scopeId
  const sections = resolveCompositionSections(
    preview.document.composition,
    frame.role,
    scopeId,
  )

  if (
    Object.values(sections).some((section) => Object.keys(section).length > 0)
  ) {
    reasons.push("composition-registry-adapter-unavailable")
  }

  if (
    Object.values(resolved.slots).some((slot) => slot.mediaUrl !== undefined) ||
    Object.values(resolved.audioSelections).some(
      (event) => event.mediaUrl !== undefined,
    ) ||
    hasUrl(card.background) ||
    hasUrl(card.media) ||
    hasUrl(card.audioCues) ||
    hasUrl(preview.draft.show.defaults?.tadazzBackground) ||
    card.answers.some(
      (answer) => answer.display !== "text" || Boolean(answer.imageUrl),
    )
  ) {
    reasons.push("native-media-binding-unavailable")
  }

  const layers = resolveNativePresentationLayers(
    preview.document.nativePresentation,
    {
      role: frame.role,
      authoredCardKey: card.key,
      theme: { id: resolved.requested.id, version: resolved.requested.version },
    },
  )
  const decoration = resolveQuestionDecoration({
    cardDecoration: layers.card.questionDecoration ?? card.questionDecoration,
    globalDecoration:
      layers.global.questionDecoration ??
      preview.draft.show.defaults?.questionDecoration,
  })

  if (
    (decoration.enabled && decoration.preset === "lottie") ||
    (
      layers.card.overlayAnimations ??
      layers.global.overlayAnimations ??
      []
    ).some((overlay) => overlay.enabled)
  ) {
    reasons.push("native-media-binding-unavailable")
  }

  if (reasons.length || !family) {
    return freeze({
      kind: "unavailable" as const,
      input: null,
      diagnostics: [...new Set(reasons)].sort(),
      executableAcceptance: false as const,
    })
  }

  const input = freeze(
    nativePreviewRendererInputV2Schema.parse({
      inputVersion: 2,
      frame,
      locale: preview.draft.input.context.locale,
      reducedMotion: preview.draft.input.context.reducedMotion,
      themeBinding: {
        format: "tadazz-native-preview-theme",
        schemaVersion: 2,
        portVersion: 3,
        identityRuleVersion: 2,
        questionId: frame.question.id,
        role: frame.role,
        draftRevision: preview.draftRevision,
        theme: family.ref,
        rendererId: family.definition.rendererId,
        definitionSha256: family.definitionSha256,
        compositionDocumentSha256: compositionDocumentV2Digest(
          preview.document,
        ),
        slots: Object.fromEntries(
          Object.entries(resolved.slots).map(([slot, variant]) => [
            slot,
            { variantId: variant.id },
          ]),
        ),
        settings: {
          stageAnimations: resolveCardStageAnimations({
            questionEntrance: card.questionEntrance,
            stageAnimations: {
              ...card.stageAnimations,
              ...layers.card.stageAnimations,
            },
            globalStageAnimations: {
              ...preview.draft.show.defaults?.stageAnimations,
              ...layers.global.stageAnimations,
            },
          }),
          questionDecoration: decoration,
        },
      },
    }),
  )
  bindings.set(input, {
    prepared: preview,
    questionId: binding.currentQuestionId,
    phase: binding.phase,
    clock: canonicalJson(binding.clock),
  })

  return freeze({
    kind: "candidate" as const,
    input,
    diagnostics: resolved.diagnostics.map((diagnostic) => diagnostic.code),
    executableAcceptance: false as const,
  })
}

/** Call on the trusted host before serialization/mount; parsed JSON cannot mint this association. */
export function assertCompositionNativePreviewInputV2(
  preview: ValidatedCompositionPreviewV2,
  binding: PreviewProjectionBinding,
  input: Readonly<NativePreviewRendererInputV2>,
): void {
  assertController(preview, binding)
  const association = bindings.get(input)

  if (
    !association ||
    association.prepared !== preview ||
    association.questionId !== binding.currentQuestionId ||
    association.phase !== binding.phase ||
    association.clock !== canonicalJson(binding.clock)
  ) {
    throw new Error("show-library:unbound-native-preview-input")
  }
}
