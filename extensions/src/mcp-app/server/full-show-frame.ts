// Host-only projection. Current display data is explicitly selected; source never crosses the boundary.
import { createFullShowSelectionPortV3 } from "./full-show-selection.ts"
import {
  fullShowFrameV3Schema,
  fullShowSceneV3Schema,
  type FullShowFrameV3,
} from "../contracts/full-show-frame.ts"
import { fullShowSelectionInputV3Schema } from "../contracts/full-show-selection.ts"
import { nativePreviewFrameV1Schema } from "../../core/show-library/native-preview-frame-schema.ts"
import { getNativeShowLibrary } from "../../core/show-library/native-library.ts"
import { resolveShowTheme } from "../../core/show-themes/resolve.ts"
import { SHOW_THEME_SLOTS } from "../../core/show-themes/selection.ts"
import {
  resolveCardStageAnimations,
  questionDecorationSchema,
} from "../../core/card-appearance.ts"
import { canonicalJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS } from "../contracts/schemas.ts"
import { freeze } from "../../core/show-library/primitives.ts"
import { ToolError } from "./errors.ts"
import type { Dependencies, VerifiedPrincipal } from "./dependencies.ts"

export interface FullShowRuntimePolicyV3 {
  /** From the exact physical-source build manifest, matched by the bundled consumer. */
  readonly rendererBuildId: string
  // Host verifies actual bundled asset bytes/provenance and live issuer authority.
  // This cannot be derived from a model field or a catalog permission bit.
  assertAssets(
    principal: VerifiedPrincipal,
    theme: { id: string; version: string },
    urls: readonly string[],
  ): Promise<void>
}

export interface FullShowPreviewPortV3 {
  render(principal: VerifiedPrincipal, input: unknown): Promise<FullShowFrameV3>
}

export function createFullShowPreviewPortV3(
  dependencies: Pick<Dependencies, "drafts" | "authoring">,
  policy: FullShowRuntimePolicyV3,
): FullShowPreviewPortV3 {
  if (
    !/^[a-f0-9]{64}$/u.test(policy.rendererBuildId) ||
    typeof policy.assertAssets !== "function"
  ) {
    throw new ToolError("PREVIEW_UNAVAILABLE")
  }

  const selection = createFullShowSelectionPortV3(dependencies)

  return Object.freeze({
    async render(p: VerifiedPrincipal, raw: unknown) {
      const input = fullShowSelectionInputV3Schema.parse(raw)

      if (input.context.role === "player") {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const prepared = await selection.prepare(p, input)
      const source = await selection.getHostSource(p, prepared)
      const { inventory } = prepared
      const { chapter } = source

      if (!chapter) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const theme = resolveShowTheme({
        selection: source.defaults.showTheme,
        role: input.context.role,
      })
      const family = getNativeShowLibrary().families.find(
        (f) =>
          f.ref.id === theme.requested.id &&
          f.ref.version === theme.requested.version,
      )

      if (
        !family ||
        theme.diagnostics.length ||
        Object.values(theme.slots).some((slot) => slot.mediaUrl)
      ) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      // Only exact bundled variants. Custom media or role overrides must have a separately qualified delivery path.
      const binding = {
        ...family.ref,
        definitionSha256: family.definitionSha256,
        rendererId: family.definition.rendererId,
        slots: Object.fromEntries(
          SHOW_THEME_SLOTS.map((slot) => [
            slot,
            { variantId: theme.slots[slot].id },
          ]),
        ),
      }
      const media: string[] = []
      const { card } = source
      let content: FullShowFrameV3["content"] | null = null

      if (card.kind === "quiz" || card.kind === "survey") {
        if (
          card.questionType === "estimation" ||
          card.answers.length > 5 ||
          card.media ||
          card.answers.some((a) => a.imageUrl)
        ) {
          throw new ToolError("PREVIEW_UNAVAILABLE")
        }

        const questionId =
          "questionId" in source ? source.questionId : undefined

        if (!questionId || chapter.questionOrdinal === null) {
          throw new ToolError("PREVIEW_UNAVAILABLE")
        }

        const choices = card.answers.map((answer, index) => ({
          id: `${questionId}-answer-${index}`,
          label: answer.text,
        }))
        content = {
          kind: "question",
          frame: {
            phase: nativePreviewFrameV1Schema.shape.phase.parse(chapter.kind),
            role: input.context.role,
            epoch: chapter.index + 1,
            revision: inventory.revision,
            question: {
              id: questionId,
              text: card.question,
              type: card.questionType,
              mode: card.kind,
              ordinal: chapter.questionOrdinal,
              totalQuestions: new Set(
                inventory.chapters
                  .map((c) => c.questionOrdinal)
                  .filter((n) => n !== null),
              ).size,
            },
            choices: chapter.kind === "question" ? [] : choices,
            ...(chapter.kind === "results"
              ? {
                  results: choices.map((choice, index) => ({
                    answerId: choice.id,
                    count: 0,
                    percent: 0,
                    ...(card.kind === "quiz"
                      ? { correct: card.correctAnswers.includes(index + 1) }
                      : {}),
                  })),
                }
              : {}),
            clock: {
              elapsedMs: 0,
              deadlineMs:
                chapter.kind === "voting" && card.timeSeconds > 0
                  ? card.timeSeconds * 1000
                  : null,
              paused: false,
            },
            seconds: card.timeSeconds > 0 ? card.timeSeconds : null,
          },
          visualSettings: {
            stageAnimations: resolveCardStageAnimations({}),
            questionDecoration: questionDecorationSchema.parse({}),
          },
        }
      } else {
        const scene = "scene" in source ? source.scene : undefined

        if (!scene || !("sceneId" in source) || !source.sceneId) {
          throw new ToolError("PREVIEW_UNAVAILABLE")
        }

        const allowed = [
          "kind",
          "title",
          "subtitle",
          "description",
          "durationMs",
          "durationSeconds",
          "advance",
          "preset",
          "mediaUrl",
          "mediaType",
          "mediaFit",
          "stageLayout",
          "logoPosition",
          "textOverlay",
          "endBehavior",
          "mode",
          "maxItemsPerPage",
          "showCounts",
          "showPercentages",
        ]
        const picked = Object.fromEntries(
          Object.entries(scene).filter(
            ([name, value]) => allowed.includes(name) && value !== undefined,
          ),
        )

        if (typeof picked.mediaUrl === "string" && picked.mediaUrl) {
          if (
            !dependencies.authoring?.allowedPublicAssetUrls.has(picked.mediaUrl)
          ) {
            throw new ToolError("PREVIEW_UNAVAILABLE")
          }

          media.push(picked.mediaUrl)
        } else {
          delete picked.mediaUrl
        }

        content = {
          kind: "scene",
          scene: fullShowSceneV3Schema.parse({ ...picked, id: source.sceneId }),
        }
      }

      await policy.assertAssets(p, family.ref, media)
      await selection.assertCurrent(p, prepared)
      const frame = fullShowFrameV3Schema.parse({
        frameVersion: 3,
        inventory,
        rendererBuildId: policy.rendererBuildId,
        theme: binding,
        content,
      })

      if (utf8Bytes(canonicalJson(frame)) > LIMITS.preview) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      // A second issuer/revision check closes asynchronous asset admission races.
      await selection.assertCurrent(p, prepared)

      return freeze(frame)
    },
  })
}
