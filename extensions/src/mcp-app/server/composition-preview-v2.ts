// HOST ONLY. No tool, renderer payload, accepted pin or native write is added here.
import {
  getCompositionPreviewDigestContentV2,
  type ValidatedCompositionPreviewV2,
} from "../../core/show-library/composition-preview-v2"
import {
  serializePreviewIdentity,
  type CompositionPreviewIdentityEnvelopeV2,
} from "../contracts/canonical.ts"

/**
 * Bind D's complete prepared content to the existing canonical MCP digest path.
 * Extra assets are host-resolved manifest pairs, never model-provided URLs.
 * This is content identity only; executable acceptance remains the renderer's job.
 */

export function createCompositionPreviewIdentityV2(
  prepared: ValidatedCompositionPreviewV2,
  draftId: string,
  assets: ReadonlyArray<Readonly<{ assetId: string; sha256: string }>> = [],
): Readonly<CompositionPreviewIdentityEnvelopeV2> {
  if (
    typeof draftId !== "string" ||
    draftId.length < 1 ||
    draftId.length > 160
  ) {
    throw new Error("Invalid preview draft identity")
  }

  // This call validates D's process-local prepared capability. Do not recreate,
  // subset or replace its returned content with the document's SHA alone.
  const content = getCompositionPreviewDigestContentV2(prepared)
  const pairs = new Map<string, Readonly<{ assetId: string; sha256: string }>>()
  for (const asset of [...content.preview.assetDigests, ...assets]) {
    if (typeof asset.assetId !== "string" || !asset.assetId.length) {
      throw new Error("Invalid preview asset identity")
    }

    const pair = Object.freeze({ assetId: asset.assetId, sha256: asset.sha256 })
    pairs.set(JSON.stringify([pair.assetId, pair.sha256]), pair)
  }
  const result = Object.freeze({
    version: 2 as const,
    draftId,
    revision: prepared.draftRevision,
    compositionPreviewContent: content,
    previewContext: prepared.draft.input.context,
    assetDigests: Object.freeze([...pairs.values()]),
  })
  // Validate finite JSON and digest syntax at the boundary. Hashing still uses
  // previewIdentityDigest, the same function as the unchanged V1 envelope.
  serializePreviewIdentity(result)

  return result
}
