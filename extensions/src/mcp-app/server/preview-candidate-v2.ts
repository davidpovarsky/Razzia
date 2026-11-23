// Trusted host only. Never bundle this module in the UI resource.
import { derivePreviewIdentityMap } from "../../core/show-library/identity"
import {
  prepareCompositionPreviewV2,
  type ValidatedCompositionPreviewV2,
} from "../../core/show-library/composition-preview-v2"
import {
  produceCompositionNativePreviewInputV2,
  assertCompositionNativePreviewInputV2,
} from "../../core/show-library/native-preview-renderer-v2"
import type { PreviewProjectionBinding } from "../../core/show-library/projection"
import type { PreviewContext } from "../../core/show-library/preview-schemas"
import {
  canonicalJson,
  hashJson,
  previewIdentityDigest,
  utf8Bytes,
} from "../contracts/canonical.ts"
import {
  previewCandidateV2Schema,
  type PreviewCandidateV2,
} from "../contracts/preview-candidate-v2.ts"
import { LIMITS } from "../contracts/schemas.ts"
import { createCompositionPreviewIdentityV2 } from "./composition-preview-v2.ts"
import type {
  DraftRepository,
  DraftRecord,
  VerifiedPrincipal,
} from "./dependencies.ts"
import { ToolError } from "./errors.ts"

export interface CandidatePreviewOptionsV2 {
  select(
    principal: VerifiedPrincipal,
    draft: DraftRecord,
    locale?: string,
  ): Promise<{
    document: unknown
    scopeBindings?: unknown
    context: PreviewContext
    /** Existing host controller supplies its snapshot and genuine D binding. */
    project(prepared: ValidatedCompositionPreviewV2): Promise<{
      snapshot: unknown
      binding: PreviewProjectionBinding
    }>
  }>
  /** Explicit data-only development policy; never grants executable/media rights. */
  canPreview(
    principal: VerifiedPrincipal,
    prepared: ValidatedCompositionPreviewV2,
  ): boolean
}

export interface CandidatePreviewPortV2 {
  render(
    principal: VerifiedPrincipal,
    draft: DraftRecord,
    locale?: string,
  ): Promise<PreviewCandidateV2>
}

/**
 * Use the actual issuer's draftRepository(policy), never a global/fallback store.
 * Its read rechecks issued capability, live grant/session and owner before/after
 * asynchronous host work. Preparation starts from that exact canonical draft.
 */

export function createPreviewCandidatePortV2(
  repository: Pick<DraftRepository, "get">,
  options: CandidatePreviewOptionsV2,
): CandidatePreviewPortV2 {
  const verify = async (p: VerifiedPrincipal, expected: DraftRecord) => {
    const actual = await repository.get(p, expected.draftId)

    if (!actual) {
      throw new ToolError("NOT_FOUND")
    }

    if (actual.revision !== expected.revision) {
      throw new ToolError("REVISION_CONFLICT", {
        currentRevision: actual.revision,
      })
    }

    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new ToolError("PREVIEW_UNAVAILABLE")
    }
  }

  return Object.freeze({
    async render(p: VerifiedPrincipal, draft: DraftRecord, locale?: string) {
      await verify(p, draft)
      const selection = await options.select(p, draft, locale)

      // V2 candidate is read-only manager/spectator data, never a player action.
      if (
        selection.context.role === "player" ||
        selection.context.locale !== (locale ?? draft.locale ?? "en")
      ) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const prepared = prepareCompositionPreviewV2(
        {
          portVersion: 3,
          identityRuleVersion: 2,
          authoredShowJson: draft.authoredShowJson,
          identityMap: derivePreviewIdentityMap(draft.authoredShowJson),
          assets: [],
          context: selection.context,
        },
        selection.document,
        {
          draftRevision: draft.revision,
          scopeBindings: selection.scopeBindings,
        },
      )

      // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- Runtime preview policy must explicitly return true; reject every other value.
      if (options.canPreview(p, prepared) !== true) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      const projection = await selection.project(prepared)
      const result = produceCompositionNativePreviewInputV2(
        prepared,
        projection.snapshot,
        projection.binding,
      )

      if (result.kind !== "candidate") {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      assertCompositionNativePreviewInputV2(
        prepared,
        projection.binding,
        result.input,
      )
      const identity = createCompositionPreviewIdentityV2(
        prepared,
        draft.draftId,
      )
      const candidate = previewCandidateV2Schema.parse({
        version: 2,
        mode: "development-candidate",
        executableAcceptance: false,
        draftId: draft.draftId,
        revision: draft.revision,
        projectionDigest: previewIdentityDigest(identity),
        inputDigest: hashJson(result.input),
        input: result.input,
      })

      if (utf8Bytes(JSON.stringify(candidate)) > LIMITS.preview) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      // oxlint-disable-next-line typescript/no-unnecessary-boolean-literal-compare -- Runtime preview policy must explicitly return true; reject every other value.
      if (options.canPreview(p, prepared) !== true) {
        throw new ToolError("PREVIEW_UNAVAILABLE")
      }

      await verify(p, draft)

      return Object.freeze(candidate)
    },
  })
}
