import { randomBytes } from "node:crypto"
import type { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import { quizzValidator } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  enhancedBundleSchema,
} from "@razzia/extensions/core"
import type {
  NativeCreationOperationBinding,
  NativeCreationOperationPort,
} from "../../server/storage/creation-operation-types"
import type {
  AuthoringPolicy,
  Dependencies,
  DraftRecord,
  MutationIdentity,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import { canonicalJson, hashJson } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, digest, opaqueId } from "../contracts/schemas.ts"
import { dataSchemas, inputs } from "../contracts/tools.ts"
import {
  nativeSaveConsentRequestId,
  nativeSaveInspection,
  nativeSaveApproval,
} from "../contracts/native-save.ts"
import { checkedDraft } from "../server/drafts.ts"
import { ToolError } from "../server/errors.ts"
import type {
  FirstPartyBindings,
  FirstPartySessionPrincipal,
} from "./bindings.ts"
import type { StoredOAuthGrant } from "./oauth-grants.ts"
import { createExportBody } from "./oauth-export.ts"
import {
  OAuthError,
  tokenDigest,
  type OAuthProtocol,
} from "./oauth-protocol.ts"

export interface FirstPartyNativeSaveOptions {
  authoring: AuthoringPolicy
  /** Actual C1 enableOperationBindings:true port, supplied by the trusted host. */
  operations: NativeCreationOperationPort
  /** A real same-origin human exact-revision consent page. Request ID is a path segment. */
  consentPageUrl: string
}

export interface NativeSaveLedgerAccess {
  auth: FirstPartyBindings
  protocol: OAuthProtocol
  assertIssued(principal: VerifiedPrincipal): void
  grant(db: DatabaseSync, owner: string, grantId: string): StoredOAuthGrant
  atomic<T>(owner: string, action: (db: DatabaseSync) => T): T
  read<T>(owner: string, action: (db: DatabaseSync) => T): T
  audit(
    db: DatabaseSync,
    grantId: string,
    kind: string,
    mutation?: MutationIdentity,
  ): void
}

const requestId = nativeSaveConsentRequestId
const approvalSchema = z.strictObject({
  sid: z.uuid(),
  approvedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
  proofDigest: digest,
  approvalMac: digest,
})
const nativeResultSchema = z.strictObject({
  quizId: z.string().regex(/^[A-Za-z0-9_-]{21}$/u),
  revision: z.literal(1),
  baseDigest: digest,
})
const saveRecordSchema = z.strictObject({
  version: z.literal(1),
  state: z.enum(["pending", "approved", "publishing", "saved"]),
  requestId,
  requestKey: opaqueId,
  inputDigest: digest,
  operationId: digest,
  draft: z.unknown(),
  nativeSnapshot: z.string().min(1).max(262_144),
  nativeDigest: digest,
  expiresAt: z.number().int().positive(),
  intentMac: digest,
  approved: approvalSchema.nullable(),
  result: nativeResultSchema.nullable(),
  outcome: dataSchemas.save_game.nullable(),
  outcomeMac: digest.nullable(),
})
const mappingSchema = z.strictObject({
  version: z.literal(1),
  requestId,
  requestKey: opaqueId,
  inputDigest: digest,
  intentMac: digest,
})
type SaveRecord = Omit<z.infer<typeof saveRecordSchema>, "draft"> & {
  draft: DraftRecord
}
const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")

// Private ledger consumer only. It cannot mint OAuth principals, bypass native
// first-party consent, allocate an alternate native target, or repair a journal.
//
export function createNativeSaveAdapter(
  ledger: NativeSaveLedgerAccess,
  options: FirstPartyNativeSaveOptions,
) {
  const { auth, protocol } = ledger
  const issuer = new URL(protocol.config.issuer)
  const page = new URL(options.consentPageUrl)

  if (
    page.origin !== issuer.origin ||
    page.protocol !== "https:" ||
    page.username ||
    page.password ||
    page.search ||
    page.hash ||
    !protocol.config.firstPartyOrigins?.includes(issuer.origin) ||
    typeof options.operations.lookup !== "function" ||
    typeof options.operations.create !== "function"
  ) {
    throw new Error(
      "Real same-origin native-save consent page and durable native port required",
    )
  }

  const selectedScopes = ["tadazz.drafts.read", "tadazz.library.write"]
  const operationId = (p: VerifiedPrincipal, mutation: MutationIdentity) =>
    hashJson({
      domain: "tadazz-mcp-native-save-operation-v1",
      issuer: p.issuer,
      audience: p.audience,
      accountId: p.accountId,
      clientId: p.clientId,
      grantId: p.grantId,
      tool: "save_game",
      idempotencyKey: mutation.idempotencyKey,
      inputDigest: mutation.inputDigest,
    })
  const intentValue = (record: SaveRecord) => ({
    requestId: record.requestId,
    requestKey: record.requestKey,
    inputDigest: record.inputDigest,
    operationId: record.operationId,
    draftId: record.draft.draftId,
    revision: record.draft.revision,
    authoredDigest: tokenDigest(record.draft.authoredShowJson),
    nativeDigest: record.nativeDigest,
    expiresAt: record.expiresAt,
  })
  const approvalValue = (record: SaveRecord) => {
    if (!record.approved) {
      throw unavailable()
    }

    const { approvalMac: _mac, ...approved } = record.approved

    return { intentMac: record.intentMac, ...approved }
  }
  const binding = (record: SaveRecord): NativeCreationOperationBinding => {
    if (!record.approved) {
      throw unavailable()
    }

    return Object.freeze({
      version: 1,
      operationId: record.operationId,
      authorizationDigest: hashJson({
        domain: "tadazz-mcp-native-save-authorization-v1",
        ...intentValue(record),
        approvedConsentDigest: hashJson(record.approved),
      }),
    })
  }
  const outcomeValue = (record: SaveRecord) => ({
    intentMac: record.intentMac,
    binding: binding(record),
    result: record.result,
    outcome: record.outcome,
  })
  const consentValue = (record: SaveRecord, p: FirstPartySessionPrincipal) => ({
    accountId: p.accountId,
    sid: p.sid,
    requestId: record.requestId,
    intentMac: record.intentMac,
  })
  const nativeBundle = (record: SaveRecord) => {
    const bundle = enhancedBundleSchema.parse(JSON.parse(record.nativeSnapshot))
    const base = quizzValidator.parse(bundle.quizz)
    const normalized: unknown = JSON.parse(
      JSON.stringify({ ...bundle, quizz: base }),
    )

    if (
      canonicalJson(normalized) !== record.nativeSnapshot ||
      tokenDigest(record.nativeSnapshot) !== record.nativeDigest
    ) {
      throw unavailable()
    }

    return { base, extras: bundle.extras }
  }
  const checked = (value: unknown): SaveRecord => {
    const parsed = saveRecordSchema.parse(value)
    const record = {
      ...parsed,
      draft: checkedDraft(parsed.draft, { authoring: options.authoring }),
    }
    protocol.checkNativeSaveMac("intent", intentValue(record), record.intentMac)
    nativeBundle(record)

    if (record.state === "pending") {
      if (
        record.approved ||
        record.result ||
        record.outcome ||
        record.outcomeMac
      ) {
        throw unavailable()
      }
    } else {
      if (
        !record.approved ||
        record.approved.expiresAt > record.expiresAt ||
        record.approved.approvedAt > record.approved.expiresAt
      ) {
        throw unavailable()
      }

      protocol.checkNativeSaveMac(
        "approval",
        approvalValue(record),
        record.approved.approvalMac,
      )

      if (record.state === "saved") {
        if (!record.result || !record.outcome || !record.outcomeMac) {
          throw unavailable()
        }

        protocol.checkNativeSaveMac(
          "outcome",
          outcomeValue(record),
          record.outcomeMac,
        )
      } else if (record.result || record.outcome || record.outcomeMac) {
        throw unavailable()
      }
    }

    return record
  }
  const authority = (db: DatabaseSync, p: VerifiedPrincipal) => {
    ledger.assertIssued(p)
    const grant = ledger.grant(db, p.accountId, p.grantId)

    if (
      p.issuer !== protocol.config.issuer ||
      p.audience !== protocol.config.resource ||
      p.subject !== grant.subject ||
      p.clientId !== grant.clientId ||
      p.expiresAt <= Date.now() ||
      !selectedScopes.every(
        (scope) => p.scopes.includes(scope) && grant.scopes.includes(scope),
      )
    ) {
      throw new ToolError("SCOPE_REQUIRED")
    }

    return grant
  }
  const currentDraft = (db: DatabaseSync, owner: string, id: string) => {
    const raw = db
      .prepare(
        "SELECT id,revision,authored,summary,locale FROM drafts WHERE owner=? AND id=?",
      )
      .get(owner, id)

    if (!raw || typeof raw.summary !== "string") {
      throw new ToolError("NOT_FOUND")
    }

    const summary: unknown = JSON.parse(raw.summary)

    return checkedDraft(
      {
        draftId: raw.id,
        revision: raw.revision,
        authoredShowJson: raw.authored,
        summary,
        ...(raw.locale === null ? {} : { locale: raw.locale }),
      },
      { authoring: options.authoring },
    )
  }
  // eslint-disable-next-line max-params -- The lookup binds one SQL transaction to the exact grant, request key and digest.
  const readOperation = (
    db: DatabaseSync,
    grantId: string,
    key: string,
    inputDigest: string,
  ) => {
    const row = db
      .prepare(
        "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
      )
      .get(grantId, key)

    if (!row) {
      return undefined
    }

    if (row.digest !== inputDigest) {
      throw new ToolError("REQUEST_KEY_REUSED")
    }

    if (typeof row.outcome !== "string") {
      throw unavailable()
    }

    const record = checked(JSON.parse(row.outcome))

    if (
      record.requestKey !== key ||
      record.inputDigest !== inputDigest ||
      !record.requestId.startsWith(grantId)
    ) {
      throw unavailable()
    }

    return record
  }
  const store = (db: DatabaseSync, grantId: string, record: SaveRecord) => {
    const updated = db
      .prepare(
        "UPDATE operations SET outcome=? WHERE grant_id=? AND kind='save' AND request_key=? AND digest=?",
      )
      .run(
        canonicalJson(record),
        grantId,
        record.requestKey,
        record.inputDigest,
      )

    if (updated.changes !== 1) {
      throw unavailable()
    }
  }
  const freshConsent = (
    db: DatabaseSync,
    p: VerifiedPrincipal,
    record: SaveRecord,
  ) => {
    if (
      !record.approved ||
      record.approved.expiresAt <= Date.now() ||
      record.expiresAt <= Date.now() ||
      !auth.delegatedSessionActive(p.accountId, record.approved.sid)
    ) {
      throw new ToolError("CONSENT_REQUIRED")
    }

    const current = currentDraft(db, p.accountId, record.draft.draftId)

    if (current.revision !== record.draft.revision) {
      throw new ToolError("REVISION_CONFLICT", {
        currentRevision: current.revision,
      })
    }

    if (canonicalJson(current) !== canonicalJson(record.draft)) {
      throw unavailable()
    }
  }
  // eslint-disable-next-line max-params -- Commit the exact native result under the same transaction, principal and mutation.
  const complete = (
    db: DatabaseSync,
    p: VerifiedPrincipal,
    record: SaveRecord,
    raw: unknown,
    mutation: MutationIdentity,
  ) => {
    const result = nativeResultSchema.parse(raw)

    if (
      result.baseDigest !==
      computeCanonicalBaseDigest(nativeBundle(record).base)
    ) {
      throw unavailable()
    }

    const outcome = dataSchemas.save_game.parse({
      draftId: record.draft.draftId,
      revision: record.draft.revision,
      quizId: result.quizId,
      savedRevision: result.revision,
      studioUrl: new URL(`/manager/quizz/${result.quizId}`, issuer.origin).href,
    })
    const saved: SaveRecord = {
      ...record,
      state: "saved",
      result,
      outcome,
      outcomeMac: null,
    }
    saved.outcomeMac = protocol.nativeSaveMac("outcome", outcomeValue(saved))
    store(db, p.grantId, checked(saved))
    ledger.audit(db, p.grantId, "save-native-completed", mutation)
    authority(db, p)

    return outcome
  }
  const consentRequired = (record: SaveRecord) =>
    new ToolError("CONSENT_REQUIRED", {
      consentRequestId: record.requestId,
      consentUrl: new URL(
        `${page.pathname.replace(/\/$/u, "")}/${record.requestId}`,
        page.origin,
      ).href,
    })
  const safe = async <T>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action()
    } catch (error) {
      if (error instanceof ToolError) {
        throw error
      }

      throw new ToolError(
        error instanceof OAuthError && error.code === "invalid_grant"
          ? "SCOPE_REQUIRED"
          : "DEPENDENCY_UNAVAILABLE",
      )
    }
  }
  const storage: NonNullable<Dependencies["storage"]> = {
    createNewWithConsent: (p, selection, mutation) =>
      safe(async () => {
        ledger.assertIssued(p)
        const parsed = inputs.save_game.safeParse({
          contractVersion: CONTRACT_VERSION,
          ...selection,
          intent: "createNew",
          idempotencyKey: mutation.idempotencyKey,
        })

        if (
          !parsed.success ||
          hashJson(parsed.data) !== mutation.inputDigest ||
          !z.string().min(1).max(128).safeParse(mutation.correlationId).success
        ) {
          throw new ToolError("VALIDATION_FAILED")
        }

        const decision = await auth.withDelegatedAccount(p.accountId, () => {
          const prepared = ledger.atomic(p.accountId, (db) => {
            const grant = authority(db, p)
            const existing = readOperation(
              db,
              p.grantId,
              mutation.idempotencyKey,
              mutation.inputDigest,
            )

            if (existing) {
              if (
                existing.operationId !== operationId(p, mutation) ||
                existing.draft.draftId !== selection.draftId ||
                existing.draft.revision !== selection.expectedRevision
              ) {
                throw unavailable()
              }

              return existing
            }

            const count = db
              .prepare("SELECT count(*) AS n FROM operations")
              .get()?.n

            if (typeof count !== "number" || count + 2 > 5000) {
              throw new ToolError("QUOTA_EXCEEDED")
            }

            const draft = currentDraft(db, p.accountId, selection.draftId)

            if (draft.revision !== selection.expectedRevision) {
              throw new ToolError("REVISION_CONFLICT", {
                currentRevision: draft.revision,
              })
            }

            const id = p.grantId + randomBytes(16).toString("base64url")
            const nativeSnapshot = createExportBody(draft, "enhanced-bundle")
            const record: SaveRecord = {
              version: 1,
              state: "pending",
              requestId: id,
              requestKey: mutation.idempotencyKey,
              inputDigest: mutation.inputDigest,
              operationId: operationId(p, mutation),
              draft,
              nativeSnapshot,
              nativeDigest: tokenDigest(nativeSnapshot),
              expiresAt: Math.min(Date.now() + 300_000, grant.expiresAt),
              intentMac: "0".repeat(64),
              approved: null,
              result: null,
              outcome: null,
              outcomeMac: null,
            }
            record.intentMac = protocol.nativeSaveMac(
              "intent",
              intentValue(record),
            )
            const mapping = mappingSchema.parse({
              version: 1,
              requestId: id,
              requestKey: record.requestKey,
              inputDigest: record.inputDigest,
              intentMac: record.intentMac,
            })
            db.prepare(
              "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,'save',?,?,?)",
            ).run(
              p.grantId,
              record.requestKey,
              record.inputDigest,
              canonicalJson(checked(record)),
            )
            db.prepare(
              "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,'save-consent',?,?,?)",
            ).run(
              p.grantId,
              id.slice(32),
              record.inputDigest,
              canonicalJson(mapping),
            )
            ledger.audit(db, p.grantId, "save-consent-requested", mutation)
            authority(db, p)

            return record
          })

          if (prepared.state === "pending") {
            return { consent: prepared, outcome: null }
          }

          if (prepared.state === "saved") {
            if (!prepared.outcome) {
              throw unavailable()
            }

            return { consent: null, outcome: prepared.outcome }
          }
          // Both transactions make their native lookup before a mutable draft read.

          const first = ledger.atomic(p.accountId, (db) => {
            authority(db, p)
            const record = readOperation(
              db,
              p.grantId,
              mutation.idempotencyKey,
              mutation.inputDigest,
            )

            if (!record) {
              throw unavailable()
            }

            const status = options.operations.lookup(binding(record))

            if (status.status === "committed") {
              return {
                outcome: complete(db, p, record, status.result, mutation),
              }
            }

            if (status.status !== "absent") {
              throw unavailable()
            }

            freshConsent(db, p, record)

            if (record.state !== "publishing") {
              store(db, p.grantId, { ...record, state: "publishing" })
              ledger.audit(db, p.grantId, "save-native-started", mutation)
            }

            authority(db, p)

            return { outcome: null }
          })

          if (first.outcome) {
            return { consent: null, outcome: first.outcome }
          }

          const outcome = ledger.atomic(p.accountId, (db) => {
            authority(db, p)
            const record = readOperation(
              db,
              p.grantId,
              mutation.idempotencyKey,
              mutation.inputDigest,
            )

            if (!record) {
              throw unavailable()
            }

            if (record.state === "saved") {
              if (!record.outcome) {
                throw unavailable()
              }

              return record.outcome
            }

            const status = options.operations.lookup(binding(record))

            if (status.status === "committed") {
              return complete(db, p, record, status.result, mutation)
            }

            if (status.status !== "absent") {
              throw unavailable()
            }

            freshConsent(db, p, record)
            const bundle = nativeBundle(record)
            authority(db, p)
            // No SQL write in this transaction precedes native commit. Publishing
            // was committed above; a crash cannot roll that durable decision back.
            const result = options.operations.create(
              binding(record),
              { ...bundle.base },
              bundle.extras,
            )

            return complete(db, p, record, result, mutation)
          })

          return { consent: null, outcome }
        })
        ledger.assertIssued(p)
        ledger.read(p.accountId, (db) => authority(db, p))

        if (decision.consent) {
          throw consentRequired(decision.consent)
        }

        // eslint-disable-next-line typescript/no-unnecessary-condition -- Fail closed on an unexpected internal adapter outcome before disclosure.
        if (!decision.outcome) {
          throw unavailable()
        }

        return decision.outcome
      }),
  }
  const nativeSelection = (
    db: DatabaseSync,
    p: FirstPartySessionPrincipal,
    id: string,
  ) => {
    auth.assertActive(p)
    requestId.parse(id)
    const grantId = id.slice(0, 32)
    const grant = ledger.grant(db, p.accountId, grantId)

    if (!selectedScopes.every((scope) => grant.scopes.includes(scope))) {
      throw new ToolError("SCOPE_REQUIRED")
    }

    const raw = db
      .prepare(
        "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind='save-consent' AND request_key=?",
      )
      .get(grantId, id.slice(32))

    if (!raw || typeof raw.outcome !== "string") {
      throw new ToolError("NOT_FOUND")
    }

    const mapping = mappingSchema.parse(JSON.parse(raw.outcome))
    const record = readOperation(
      db,
      grantId,
      mapping.requestKey,
      mapping.inputDigest,
    )

    if (
      !record ||
      mapping.requestId !== id ||
      record.requestId !== id ||
      record.intentMac !== mapping.intentMac ||
      raw.digest !== record.inputDigest
    ) {
      throw unavailable()
    }

    return { grant, record }
  }

  return {
    storage,
    inspect(p: FirstPartySessionPrincipal, id: string) {
      auth.assertActive(p)

      return ledger.read(p.accountId, (db) => {
        const { grant, record } = nativeSelection(db, p, id)

        if (record.state === "pending" || record.state === "approved") {
          const current = currentDraft(db, p.accountId, record.draft.draftId)

          if (current.revision !== record.draft.revision) {
            throw new ToolError("REVISION_CONFLICT", {
              currentRevision: current.revision,
            })
          }

          if (canonicalJson(current) !== canonicalJson(record.draft)) {
            throw unavailable()
          }
        }

        auth.assertActive(p)
        const expiresAt = Math.min(
          record.expiresAt,
          record.approved?.expiresAt ?? record.expiresAt,
        )
        const expired =
          (record.state === "pending" || record.state === "approved") &&
          (expiresAt <= Date.now() ||
            (record.approved !== null &&
              !auth.delegatedSessionActive(p.accountId, record.approved.sid)))

        return nativeSaveInspection.parse({
          version: 1,
          consentRequestId: id,
          accountId: p.accountId,
          clientId: grant.clientId,
          draftId: record.draft.draftId,
          revision: record.draft.revision,
          summary: record.draft.summary,
          authoredShowJson: record.draft.authoredShowJson,
          authoredDigest: tokenDigest(record.draft.authoredShowJson),
          expiresAt,
          state: expired ? "expired" : record.state,
          ...(record.state === "pending" && !expired
            ? {
                proof: protocol.nativeSaveMac(
                  "consent",
                  consentValue(record, p),
                ),
              }
            : {}),
        })
      })
    },
    approve(p: FirstPartySessionPrincipal, id: string, proof: string) {
      auth.assertActive(p)

      return ledger.atomic(p.accountId, (db) => {
        const { record } = nativeSelection(db, p, id)

        if (record.state !== "pending" || record.expiresAt <= Date.now()) {
          throw new ToolError("CONSENT_REQUIRED")
        }

        const current = currentDraft(db, p.accountId, record.draft.draftId)

        if (current.revision !== record.draft.revision) {
          throw new ToolError("REVISION_CONFLICT", {
            currentRevision: current.revision,
          })
        }

        if (canonicalJson(current) !== canonicalJson(record.draft)) {
          throw unavailable()
        }

        protocol.checkNativeSaveMac("consent", consentValue(record, p), proof)
        record.approved = {
          sid: p.sid,
          approvedAt: Date.now(),
          expiresAt: Math.min(p.expiresAt, record.expiresAt),
          proofDigest: tokenDigest(proof),
          approvalMac: "0".repeat(64),
        }
        record.approved.approvalMac = protocol.nativeSaveMac(
          "approval",
          approvalValue(record),
        )
        record.state = "approved"
        store(db, id.slice(0, 32), checked(record))
        ledger.audit(db, id.slice(0, 32), "save-consent-approved", {
          idempotencyKey: record.requestKey,
          inputDigest: record.inputDigest,
          correlationId: record.requestId,
        })
        auth.assertActive(p)

        return nativeSaveApproval.parse({
          version: 1,
          state: "approved",
          consentRequestId: id,
          draftId: record.draft.draftId,
          revision: record.draft.revision,
          expiresAt: record.approved.expiresAt,
        })
      })
    },
  }
}
