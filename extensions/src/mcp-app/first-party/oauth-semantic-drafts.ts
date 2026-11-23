import { z } from "zod"
import type { DatabaseSync } from "node:sqlite"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import {
  semanticPatchInputSchema,
  semanticUndoInputSchema,
  semanticStateInputSchema,
  semanticAssetsInputSchema,
  semanticMutationResultSchema,
  semanticAssetsResultSchema,
  type SemanticMutationResult,
} from "../contracts/semantic-edit.ts"
import {
  authoredJson,
  draftData,
  locale,
  opaqueId,
  LIMITS,
} from "../contracts/schemas.ts"
import type {
  AuthoringPolicy,
  DraftRecord,
  MutationIdentity,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import type { SemanticDraftPort } from "../server/semantic-drafts.ts"
import { normalizeStoredDraft } from "../server/authoring.ts"
import { checkedDraft } from "../server/drafts.ts"
import {
  applySemanticPatch,
  reverseSemanticPatch,
  listSemanticAssets,
} from "../server/semantic-state.ts"
import { ToolError } from "../server/errors.ts"

const PATCH = "semantic-patch-v1"
const UNDO = "semantic-undo-v1"
const required = ["tadazz.drafts.read", "tadazz.drafts.write"] as const
const stored = draftData
  .extend({ authoredShowJson: authoredJson, locale: locale.optional() })
  .strict()
const patchReceipt = z.strictObject({
  version: z.literal(1),
  command: semanticPatchInputSchema,
  before: stored,
  after: stored,
  result: semanticMutationResultSchema,
})
const undoReceipt = z.strictObject({
  version: z.literal(1),
  command: semanticUndoInputSchema,
  before: stored,
  after: stored,
  result: semanticMutationResultSchema,
})
interface Ledger {
  authoring: AuthoringPolicy
  /** Actual issuer checks unforgeable principal/live grant before and after callback. */
  run<T>(
    principal: VerifiedPrincipal,
    scopes: readonly string[],
    callback: (db: DatabaseSync) => T,
  ): T
  read(db: DatabaseSync, principal: VerifiedPrincipal, id: string): DraftRecord
  write(
    db: DatabaseSync,
    principal: VerifiedPrincipal,
    change: { current: DraftRecord; next: NormalizedDraft },
  ): DraftRecord
  audit(
    db: DatabaseSync,
    principal: VerifiedPrincipal,
    entry: { kind: string; mutation: MutationIdentity },
  ): void
}
const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")
const same = (left: unknown, right: unknown) =>
  canonicalJson(left) === canonicalJson(right)
const commandDigest = (kind: string, input: unknown) =>
  hashJson({ kind, version: 1, input })
const outcome = (
  record: DraftRecord,
  undoOperationId?: string,
): SemanticMutationResult =>
  semanticMutationResultSchema.parse({
    draftId: record.draftId,
    revision: record.revision,
    summary: record.summary,
    ...(undoOperationId ? { undoOperationId } : {}),
  })
const decoded = (value: unknown): unknown => {
  if (typeof value !== "string" || utf8Bytes(value) > LIMITS.response) {
    throw unavailable()
  }

  return JSON.parse(value)
}
const quota = (db: DatabaseSync) => {
  const count = db.prepare("SELECT count(*) AS n FROM operations").get()?.n

  if (typeof count !== "number" || count >= 5000) {
    throw new ToolError("QUOTA_EXCEEDED")
  }
}
const conflict = (current: DraftRecord, expected: number | undefined) => {
  if (expected !== undefined && current.revision !== expected) {
    throw new ToolError("REVISION_CONFLICT", {
      currentRevision: current.revision,
    })
  }
}

export function createSemanticDraftPort(ledger: Ledger): SemanticDraftPort {
  const checked = (value: unknown) =>
    checkedDraft(value, { authoring: ledger.authoring })
  const checkPatch = (value: unknown, digest: unknown) => {
    const receipt = patchReceipt.parse(decoded(value))
    const before = checked(receipt.before),
      after = checked(receipt.after)

    if (
      digest !== commandDigest(PATCH, receipt.command) ||
      before.draftId !== receipt.command.draftId ||
      after.draftId !== before.draftId ||
      before.revision !== receipt.command.expectedRevision ||
      after.revision !== before.revision + 1 ||
      !same(receipt.result, outcome(after, receipt.command.idempotencyKey))
    ) {
      throw unavailable()
    }

    const reproduced = normalizeStoredDraft(
      applySemanticPatch(
        before.authoredShowJson,
        receipt.command.patch,
        ledger.authoring,
      ),
      ledger.authoring,
    )

    if (
      reproduced.authoredShowJson !== after.authoredShowJson ||
      !same(reproduced.summary, after.summary)
    ) {
      throw unavailable()
    }

    return { ...receipt, before, after }
  }
  const readPatch = (db: DatabaseSync, p: VerifiedPrincipal, key: string) => {
    const row = db
      .prepare(
        "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind=? AND request_key=?",
      )
      .get(p.grantId, PATCH, key)

    if (!row) {
      throw new ToolError("NOT_FOUND")
    }

    return checkPatch(row.outcome, row.digest)
  }
  const checkUndo = (
    db: DatabaseSync,
    p: VerifiedPrincipal,
    entry: { outcome: unknown; digest: unknown },
  ) => {
    const receipt = undoReceipt.parse(decoded(entry.outcome))
    const before = checked(receipt.before),
      after = checked(receipt.after)
    const original = readPatch(db, p, receipt.command.undoOperationId)

    if (
      entry.digest !== commandDigest(UNDO, receipt.command) ||
      before.draftId !== receipt.command.draftId ||
      before.revision !== receipt.command.expectedRevision ||
      !same(before, original.after) ||
      after.draftId !== before.draftId ||
      after.revision !== before.revision + 1 ||
      after.authoredShowJson !== original.before.authoredShowJson ||
      !same(after.summary, original.before.summary) ||
      !same(receipt.result, outcome(after))
    ) {
      throw unavailable()
    }

    return { ...receipt, before, after }
  }
  const admit = () => {
    if (!ledger.authoring.semantic) {
      throw unavailable()
    }
  }
  const persist = (
    db: DatabaseSync,
    p: VerifiedPrincipal,
    entry: { kind: string; mutation: MutationIdentity; value: unknown },
  ) => {
    const { kind, mutation } = entry
    const text = canonicalJson(entry.value)

    if (utf8Bytes(text) > LIMITS.response) {
      throw new ToolError("QUOTA_EXCEEDED")
    }

    db.prepare(
      "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,?,?,?,?)",
    ).run(p.grantId, kind, mutation.idempotencyKey, mutation.inputDigest, text)
    ledger.audit(db, p, { kind, mutation })
  }

  return Object.freeze({
    patch: (p, raw, metadata) =>
      Promise.resolve().then(() => {
        admit()
        const input = semanticPatchInputSchema.parse(raw)
        const mutation = {
          idempotencyKey: input.idempotencyKey,
          correlationId: opaqueId.parse(metadata.correlationId),
          inputDigest: commandDigest(PATCH, input),
        }

        return ledger.run(p, required, (db) => {
          const prior = db
            .prepare(
              "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind=? AND request_key=?",
            )
            .get(p.grantId, PATCH, input.idempotencyKey)

          if (prior) {
            if (prior.digest !== mutation.inputDigest) {
              throw new ToolError("REQUEST_KEY_REUSED")
            }

            return checkPatch(prior.outcome, prior.digest).result
          }

          quota(db)
          const before = ledger.read(db, p, input.draftId)
          conflict(before, input.expectedRevision)
          const next = normalizeStoredDraft(
            applySemanticPatch(
              before.authoredShowJson,
              input.patch,
              ledger.authoring,
            ),
            ledger.authoring,
          )
          const after = ledger.write(db, p, { current: before, next })
          const result = outcome(after, input.idempotencyKey)
          persist(db, p, {
            kind: PATCH,
            mutation,
            value: {
              version: 1,
              command: input,
              before,
              after,
              result,
            },
          })

          return result
        })
      }),
    undo: (p, raw, metadata) =>
      Promise.resolve().then(() => {
        admit()
        const input = semanticUndoInputSchema.parse(raw)
        const mutation = {
          idempotencyKey: input.idempotencyKey,
          correlationId: opaqueId.parse(metadata.correlationId),
          inputDigest: commandDigest(UNDO, input),
        }

        return ledger.run(p, required, (db) => {
          const prior = db
            .prepare(
              "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind=? AND request_key=?",
            )
            .get(p.grantId, UNDO, input.idempotencyKey)

          if (prior) {
            if (prior.digest !== mutation.inputDigest) {
              throw new ToolError("REQUEST_KEY_REUSED")
            }

            return checkUndo(db, p, {
              outcome: prior.outcome,
              digest: prior.digest,
            }).result
          }

          quota(db)
          const original = readPatch(db, p, input.undoOperationId)

          if (original.after.draftId !== input.draftId) {
            throw new ToolError("NOT_FOUND")
          }

          const before = ledger.read(db, p, input.draftId)
          conflict(before, input.expectedRevision)
          conflict(before, original.after.revision)

          if (!same(before, original.after)) {
            throw unavailable()
          }

          const next = normalizeStoredDraft(
            reverseSemanticPatch(
              before.authoredShowJson,
              original.before.authoredShowJson,
              original.command.patch,
            ),
            ledger.authoring,
          )

          if (
            next.authoredShowJson !== original.before.authoredShowJson ||
            !same(next.summary, original.before.summary)
          ) {
            throw unavailable()
          }

          const after = ledger.write(db, p, { current: before, next })
          const result = outcome(after)
          persist(db, p, {
            kind: UNDO,
            mutation,
            value: {
              version: 1,
              command: input,
              before,
              after,
              result,
            },
          })

          return result
        })
      }),
    state: (p, raw) =>
      Promise.resolve().then(() => {
        admit()
        const input = semanticStateInputSchema.parse(raw)

        return ledger.run(p, ["tadazz.drafts.read"], (db) => {
          const current = ledger.read(db, p, input.draftId)
          conflict(current, input.expectedRevision)
          const rows = db
            .prepare(
              "SELECT request_key,digest,outcome FROM operations WHERE grant_id=? AND kind=? AND json_extract(outcome,'$.after.draftId')=? AND json_extract(outcome,'$.after.revision')=? LIMIT 2",
            )
            .all(p.grantId, PATCH, current.draftId, current.revision)

          if (rows.length > 1) {
            throw unavailable()
          }

          const row = rows.at(0)

          if (!row) {
            return outcome(current)
          }

          const receipt = checkPatch(row.outcome, row.digest)

          if (
            !same(receipt.after, current) ||
            row.request_key !== receipt.command.idempotencyKey
          ) {
            throw unavailable()
          }

          return outcome(current, receipt.command.idempotencyKey)
        })
      }),
    assets: (p, raw) =>
      Promise.resolve().then(() => {
        admit()
        const input = semanticAssetsInputSchema.parse(raw)

        return ledger.run(p, ["tadazz.drafts.read"], (db) => {
          const current = ledger.read(db, p, input.draftId)
          conflict(current, input.expectedRevision)
          const result = semanticAssetsResultSchema.parse({
            draftId: current.draftId,
            revision: current.revision,
            purpose: input.purpose,
            assets: listSemanticAssets(
              current.authoredShowJson,
              { purpose: input.purpose, language: input.locale },
              ledger.authoring,
            ),
          })

          if (utf8Bytes(canonicalJson(result)) > LIMITS.structured) {
            throw unavailable()
          }

          return result
        })
      }),
  } satisfies SemanticDraftPort)
}
