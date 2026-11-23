/** Browser-safe first-party consent DTOs only. No server/auth/key/native imports. */
import { z } from "zod"
import {
  CONTRACT_VERSION,
  authoredJson,
  digest,
  errorSchema,
  opaqueId,
  revision,
  summarySchema,
} from "./schemas.ts"

export const nativeSaveConsentRequestId = opaqueId.length(54)

export const nativeSaveInspectInput = z.strictObject({
  consentRequestId: nativeSaveConsentRequestId,
})

export const nativeSaveApproveInput = nativeSaveInspectInput.extend({
  decision: z.literal("allow"),
  proof: digest,
})

const milliseconds = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

export const nativeSaveInspection = z
  .strictObject({
    version: z.literal(1),
    consentRequestId: nativeSaveConsentRequestId,
    accountId: z.uuid(),
    clientId: z.string().min(1).max(256),
    draftId: opaqueId,
    revision,
    summary: summarySchema,
    authoredShowJson: authoredJson,
    authoredDigest: digest,
    expiresAt: milliseconds,
    state: z.enum(["pending", "approved", "publishing", "saved", "expired"]),
    proof: digest.optional(),
  })
  .superRefine((value, context) => {
    if ((value.state === "pending") !== (value.proof !== undefined)) {
      context.addIssue({
        code: "custom",
        path: ["proof"],
        message: "Pending consent alone requires a proof",
      })
    }
  })

export const nativeSaveApproval = z.strictObject({
  version: z.literal(1),
  state: z.literal("approved"),
  consentRequestId: nativeSaveConsentRequestId,
  draftId: opaqueId,
  revision,
  expiresAt: milliseconds,
})

export const nativeSaveConsentFailure = z.strictObject({
  contractVersion: z.literal(CONTRACT_VERSION),
  ok: z.literal(false),
  error: errorSchema,
})

export const nativeSaveInspectResponse = z.discriminatedUnion("ok", [
  z.strictObject({
    contractVersion: z.literal(CONTRACT_VERSION),
    ok: z.literal(true),
    data: nativeSaveInspection,
  }),
  nativeSaveConsentFailure,
])

export const nativeSaveApproveResponse = z.discriminatedUnion("ok", [
  z.strictObject({
    contractVersion: z.literal(CONTRACT_VERSION),
    ok: z.literal(true),
    data: nativeSaveApproval,
  }),
  nativeSaveConsentFailure,
])

export type NativeSaveInspection = Readonly<
  z.infer<typeof nativeSaveInspection>
>

export type NativeSaveApproval = Readonly<z.infer<typeof nativeSaveApproval>>
