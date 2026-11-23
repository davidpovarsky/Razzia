// HOST ONLY. Never forward the native source, authoring JSON or defaults to UI.
import { tadaShowV1Schema } from "../../core/show-authoring-schema.ts"
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert.ts"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline.ts"
import {
  deriveAuthoredShowPreviewIdentityMap,
  getPreviewIdentityId,
} from "../../core/show-library/identity.ts"
import { freeze } from "../../core/show-library/primitives.ts"
import { sha256Hex } from "../../core/digest.ts"
import { canonicalJson } from "../contracts/canonical.ts"
import {
  fullShowSelectionInputV3Schema,
  fullShowInventoryV3Schema,
  type FullShowInventoryV3,
} from "../contracts/full-show-selection.ts"
import type { Dependencies, VerifiedPrincipal } from "./dependencies.ts"
import { readDraft } from "./drafts.ts"
import { ToolError, unavailable } from "./errors.ts"

const selectionBrand: unique symbol = Symbol("tadazz.full-show-selection-v3")

export interface PreparedFullShowSelectionV3 {
  readonly [selectionBrand]: true
  readonly inventory: Readonly<FullShowInventoryV3>
}

const ownerIdentity = (p: VerifiedPrincipal) =>
  canonicalJson([
    p.issuer,
    p.audience,
    p.accountId,
    p.subject,
    p.clientId,
    p.grantId,
  ])
const active = (signal?: AbortSignal) => signal?.throwIfAborted()

// The host supplies its actual issuer-owned repository/policy, not an ambient
// or fallback store. A selection is read-only and creates no native game.
//
export function createFullShowSelectionPortV3(
  dependencies: Pick<Dependencies, "drafts" | "authoring">,
) {
  if (!dependencies.drafts || !dependencies.authoring) {
    throw unavailable()
  }

  const deps = Object.freeze({ ...dependencies })
  const selections = new WeakMap<
    PreparedFullShowSelectionV3,
    {
      owner: string
      record: Awaited<ReturnType<typeof readDraft>>
      show: ReturnType<typeof tadaShowV1Schema.parse>
      native: NonNullable<
        ReturnType<typeof authoredShowToNativeBundleDraft>["bundleDraft"]
      >
      identities: ReturnType<typeof deriveAuthoredShowPreviewIdentityMap>
      cardIndex: number
      questionIndex: number | null
    }
  >()
  const verify = async (
    p: VerifiedPrincipal,
    selection: PreparedFullShowSelectionV3,
    signal?: AbortSignal,
  ) => {
    active(signal)
    const source = selections.get(selection)

    if (!source || source.owner !== ownerIdentity(p)) {
      throw new ToolError("PREVIEW_UNAVAILABLE")
    }

    const current = await readDraft(
      deps,
      p,
      source.record.draftId,
      source.record.revision,
    )
    active(signal)

    if (
      source.owner !== ownerIdentity(p) ||
      canonicalJson(current) !== canonicalJson(source.record)
    ) {
      throw new ToolError("PREVIEW_UNAVAILABLE")
    }

    return source
  }

  return Object.freeze({
    async prepare(
      p: VerifiedPrincipal,
      input: unknown,
      signal?: AbortSignal,
    ): Promise<PreparedFullShowSelectionV3> {
      active(signal)
      const parsed = fullShowSelectionInputV3Schema.safeParse(input)

      if (!parsed.success) {
        throw new ToolError("VALIDATION_FAILED")
      }

      const request = parsed.data
      const owner = ownerIdentity(p)
      const record = await readDraft(
        deps,
        p,
        request.draftId,
        request.expectedRevision,
      )
      active(signal)

      if (owner !== ownerIdentity(p)) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const show = freeze(
        tadaShowV1Schema.parse(JSON.parse(record.authoredShowJson)),
      )
      const identities = (() => {
        try {
          return deriveAuthoredShowPreviewIdentityMap(show)
        } catch {
          throw new ToolError("PREVIEW_UNAVAILABLE")
        }
      })()

      const timeline = compileFullShowPreviewTimeline(show)
      let questionOrdinal = 0
      const ordinals = show.cards.map((card) => {
        if (card.kind !== "quiz" && card.kind !== "survey") {
          return null
        }

        questionOrdinal += 1

        return questionOrdinal
      })
      const chapters = timeline.map((chapter, index) => {
        const publicCardId = getPreviewIdentityId(
          identities,
          "cards",
          chapter.authoredKey,
        )

        return {
          id: `${publicCardId}:${chapter.phase}`,
          cardId: publicCardId,
          index,
          kind: chapter.phase,
          cardOrdinal: chapter.cardIndex + 1,
          questionOrdinal: ordinals[chapter.cardIndex],
          duration: chapter.duration,
        }
      })
      const selectedChapterId = request.chapterId ?? chapters[0]?.id
      const selectedIndex = chapters.findIndex(
        (chapter) => chapter.id === selectedChapterId,
      )
      const chapter = timeline[selectedIndex]

      // oxlint-disable-next-line typescript/no-unnecessary-condition -- findIndex may return -1; indexed access is not runtime proof.
      if (!chapter || !selectedChapterId) {
        throw new ToolError("VALIDATION_FAILED")
      }

      const ordinal = ordinals[chapter.cardIndex]
      const converted = authoredShowToNativeBundleDraft(show, "mcp-preview")

      if (!converted.ok || !converted.bundleDraft) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const inventory = freeze(
        fullShowInventoryV3Schema.parse({
          selectionVersion: 3,
          draftId: record.draftId,
          revision: record.revision,
          authoredSha256: sha256Hex(record.authoredShowJson),
          title: record.summary.title,
          context: request.context,
          selectedChapterId,
          chapters,
        }),
      )
      const prepared: PreparedFullShowSelectionV3 = Object.freeze({
        [selectionBrand]: true as const,
        inventory,
      })
      selections.set(prepared, {
        owner,
        record: freeze(record),
        show,
        identities,
        native: freeze(converted.bundleDraft),
        cardIndex: chapter.cardIndex,
        questionIndex: ordinal === null ? null : ordinal - 1,
      })
      await verify(p, prepared, signal)

      return prepared
    },
    async assertCurrent(
      p: VerifiedPrincipal,
      selection: PreparedFullShowSelectionV3,
      signal?: AbortSignal,
    ): Promise<void> {
      await verify(p, selection, signal)
    },
    // Private producer input only. A later strict current-frame projector must
    // omit notes/solutions before reveal and resolve every visual asset/pin.
    //
    async getHostSource(
      p: VerifiedPrincipal,
      selection: PreparedFullShowSelectionV3,
      signal?: AbortSignal,
    ) {
      const source = await verify(p, selection, signal)
      const card = source.show.cards[source.cardIndex]
      const item = source.native.extras.timeline[source.cardIndex]

      // oxlint-disable-next-line typescript/no-unnecessary-condition -- Validate sparse/indexed source at the host boundary.
      if (!card || !item) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      return Object.freeze({
        title: source.show.title,
        context: selection.inventory.context,
        chapter: selection.inventory.chapters.find(
          (chapter) => chapter.id === selection.inventory.selectedChapterId,
        ),
        card,
        defaults: source.native.extras.defaults,
        ...(item.kind === "question"
          ? {
              questionId: getPreviewIdentityId(
                source.identities,
                "questions",
                card.key,
              ),
              question:
                source.questionIndex === null
                  ? undefined
                  : source.native.quizz.questions[source.questionIndex],
            }
          : {
              sceneId: getPreviewIdentityId(
                source.identities,
                "scenes",
                card.key,
              ),
              scene: source.native.extras.scenes[item.sceneId],
            }),
      })
    },
  })
}
