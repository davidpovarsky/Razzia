import { z } from "zod"
import {
  createEnhancedBundle,
  authoredShowToNativeBundleDraft,
} from "@razzia/extensions/core"
import type { AuthoringPolicy, DraftRecord } from "../server/dependencies.ts"
import { canonicalJson, utf8Bytes } from "../contracts/canonical.ts"
import { dataSchemas } from "../contracts/tools.ts"
import { ToolError } from "../server/errors.ts"

export type ExportFormat = "tada-json" | "enhanced-bundle"
export interface ExportRightsContext {
  accountId: string
  grantId: string
  clientId: string
}
/** Deployment-owned rights policy, separate from permission to author a URL.
 * A synchronous true is required both at creation/replay and at delivery.
 */
export interface FirstPartyExportPolicy {
  authoring: AuthoringPolicy
  canExport(
    context: Readonly<ExportRightsContext>,
    draft: Readonly<DraftRecord>,
    format: ExportFormat,
  ): boolean
}
export const exportReceiptSchema = z.strictObject({
  version: z.literal(1),
  data: dataSchemas.export_game,
  draft: z.unknown(),
  body: z.string().min(1).max(262_144),
})
export function createExportBody(
  draft: DraftRecord,
  format: ExportFormat,
): string {
  if (format === "tada-json") return draft.authoredShowJson
  const converted = authoredShowToNativeBundleDraft(
    JSON.parse(draft.authoredShowJson),
  )
  if (!converted.ok || !converted.bundleDraft)
    throw new ToolError("EXPORT_UNAVAILABLE")
  const body = canonicalJson(
    // The native converter deliberately emits optional undefined properties.
    // Apply its normal JSON wire semantics before the strict canonical encoder.
    JSON.parse(
      JSON.stringify(
        createEnhancedBundle(
          converted.bundleDraft.quizz,
          converted.bundleDraft.extras,
        ),
      ),
    ),
  )
  if (utf8Bytes(body) > 262_144) throw new ToolError("EXPORT_UNAVAILABLE")
  return body
}
