// Payload-only leaf. No host producer, account, OAuth, key, registry or IO imports.
import { z } from "zod"
import { nativePreviewRendererInputV2Schema } from "../../core/show-library/native-preview-renderer-v2-schema"
import { digest, opaqueId, revision } from "./schemas.ts"

export const PREVIEW_CANDIDATE_META_V2 = "tadazz/preview-candidate-v2"
export const previewCandidateV2Schema = z
  .strictObject({
    version: z.literal(2),
    mode: z.literal("development-candidate"),
    executableAcceptance: z.literal(false),
    draftId: opaqueId,
    revision,
    projectionDigest: digest,
    inputDigest: digest,
    input: nativePreviewRendererInputV2Schema,
  })
  .superRefine((value, ctx) => {
    if (value.revision !== value.input.frame.revision)
      ctx.addIssue({ code: "custom", message: "Preview revision mismatch" })
  })
export type PreviewCandidateV2 = z.infer<typeof previewCandidateV2Schema>
