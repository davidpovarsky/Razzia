import type { PreviewProjectionBinding } from "../../core/show-library/projection"
import type { ValidatedPreviewStageMetadata } from "../../core/show-library/stage-metadata"
import { produceNativePreviewFrameV1 } from "../../core/show-library/native-preview-frame"

/** Host-only adapter. Authored duration and bound projection come from the sole producer. */
export function projectedFrame(
  ...[snapshot, context, binding, metadata, revision, expectedSeconds]: [
    snapshot: unknown,
    context: unknown,
    binding: PreviewProjectionBinding,
    metadata: ValidatedPreviewStageMetadata,
    revision: number,
    expectedSeconds?: number | null,
  ]
) {
  const frame = produceNativePreviewFrameV1(
    snapshot,
    context,
    binding,
    metadata,
    revision,
  )

  // Preserve the old assertion argument for existing callers; it cannot override data.
  if (expectedSeconds !== undefined && expectedSeconds !== frame.seconds) {
    throw new Error("show-preview:authored-duration-mismatch")
  }

  return frame
}
