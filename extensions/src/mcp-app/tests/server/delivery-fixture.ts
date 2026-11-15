import type {
  DraftRepository,
  DraftSelection,
  MutationIdentity,
  VerifiedPrincipal,
} from "../../server/dependencies.ts"
import { readDraft } from "../../server/drafts.ts"
import { ToolError } from "../../server/errors.ts"
import { newKey } from "./fixtures.ts"

/** Volatile TEST ONLY replay-or-new model. No durable consent, filesystem,
 * rights, download or crash guarantee is established by this fixture. */
export class MemoryDeliveries {
  private outcomes = new Map<string, { digest: string; result: unknown }>()
  private tail: Promise<unknown> = Promise.resolve()
  saves = 0
  exports = 0
  consent = true
  constructor(private drafts: DraftRepository) {}
  private run(
    p: VerifiedPrincipal,
    tool: string,
    selected: DraftSelection,
    m: MutationIdentity,
    format?: "tada-json" | "enhanced-bundle",
  ) {
    const operation = this.tail.then(async () => {
      const key = JSON.stringify([
        p.issuer,
        p.subject,
        p.accountId,
        p.clientId,
        p.grantId,
        tool,
        m.idempotencyKey,
      ])
      const prior = this.outcomes.get(key)
      if (prior) {
        if (prior.digest !== m.inputDigest)
          throw new ToolError("REQUEST_KEY_REUSED")
        return structuredClone(prior.result)
      }
      const draft = await readDraft(
        {
          drafts: this.drafts,
          authoring: { allowedPublicAssetUrls: new Set() },
        },
        p,
        selected.draftId,
        selected.expectedRevision,
      )
      if (!format && !this.consent) throw new ToolError("CONSENT_REQUIRED")
      const result = format
        ? {
            exportId: newKey(),
            draftId: draft.draftId,
            revision: draft.revision,
            format,
            downloadUrl: "https://studio.example.invalid/download/" + newKey(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            sha256: "a".repeat(64),
            bytes: 10,
          }
        : {
            draftId: draft.draftId,
            revision: draft.revision,
            quizId: newKey(),
            savedRevision: 1,
            studioUrl:
              "https://studio.example.invalid/manager/quizz/" + newKey(),
          }
      this.outcomes.set(key, {
        digest: m.inputDigest,
        result: structuredClone(result),
      })
      if (format) this.exports++
      else this.saves++
      return result
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  createNewWithConsent = (
    p: VerifiedPrincipal,
    s: DraftSelection,
    m: MutationIdentity,
  ) => this.run(p, "save_game", s, m)
  createAuthorizedDownload = (
    p: VerifiedPrincipal,
    s: DraftSelection,
    format: "tada-json" | "enhanced-bundle",
    m: MutationIdentity,
  ) => this.run(p, "export_game", s, m, format)
}
