import { randomBytes } from "node:crypto"
import { constants, closeSync, openSync } from "node:fs"
import { DatabaseSync } from "node:sqlite"
import { type z, z as schema } from "zod"
import { canonicalJson, hashJson } from "../contracts/canonical.ts"
import { inputs } from "../contracts/tools.ts"
import { digest, opaqueId, revision } from "../contracts/schemas.ts"
import { normalizeDraft, normalizeStoredDraft } from "../server/authoring.ts"
import {
  preserveSemanticState,
  snapshotSemanticPolicy,
} from "../server/semantic-state.ts"
import { checkedDraft } from "../server/drafts.ts"
import type { AuthoringPolicy, DraftRecord } from "../server/dependencies.ts"
import { ToolError } from "../server/errors.ts"
import type {
  FirstPartyBindings,
  FirstPartySessionPrincipal,
} from "./bindings.ts"
import { OwnedStorePath } from "./owner.ts"
import { initialize, inspect } from "./schema.ts"

type Create = z.infer<typeof inputs.create_game_draft>
type Replace = z.infer<typeof inputs.update_game_draft>
type Prepare = z.infer<typeof inputs.save_game>
const pending = schema.strictObject({
  state: schema.literal("PENDING_C1"),
  draftId: opaqueId,
  revision,
  authoredDigest: digest,
})

export type PendingSaveIntent = z.infer<typeof pending>

type Kind = "create" | "replace" | "prepare-save"
type Outcome = DraftRecord | PendingSaveIntent
const unavailable = () => new ToolError("DEPENDENCY_UNAVAILABLE")
const limits = { drafts: 100, operations: 5000 } as const
function noFollowFlag() {
  // Preserve the platform-dependent flag's existing zero fallback.
  const flags: { readonly O_NOFOLLOW?: number } = constants

  return flags.O_NOFOLLOW ?? 0
}

/**
 * Separate first-party authority; deliberately NOT an MCP DraftRepository.
 * Each call opens/closes its own owned DB. No ambient/global/cache fallback.
 * Session revocation is checked at replay, precommit and return. The account
 * DB and draft DB are distinct: this does not make cross-DB revocation linearizable.
 */

export class FirstPartyDraftStore {
  private readonly paths: OwnedStorePath
  private readonly policy: AuthoringPolicy
  constructor(
    private readonly auth: FirstPartyBindings,
    policy: AuthoringPolicy,
  ) {
    this.paths = new OwnedStorePath(auth)
    this.policy = {
      allowedPublicAssetUrls: new Set(policy.allowedPublicAssetUrls),
      ...(policy.semantic
        ? { semantic: snapshotSemanticPolicy(policy.semantic) }
        : {}),
      ...(policy.trustedDefaults === undefined
        ? {}
        : { trustedDefaults: structuredClone(policy.trustedDefaults) }),
    }
  }
  private checked(raw: unknown): DraftRecord {
    return checkedDraft(raw, { authoring: this.policy })
  }
  private open(p: FirstPartySessionPrincipal, mutation: boolean) {
    this.auth.assertActive(p)
    const target = this.paths.path(p, mutation)

    if (!target) {
      return undefined
    }

    if (!target.exists) {
      // Exclusive creation prevents a raced existing database from being initialized.
      const fd = openSync(
        target.file,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          noFollowFlag(),
        0o600,
      )
      closeSync(fd)
    }

    const db = new DatabaseSync(target.file, {
      readOnly: !mutation,
      timeout: 1000,
    })

    try {
      db.exec("PRAGMA trusted_schema=OFF")

      if (!mutation) {
        db.exec("PRAGMA query_only=ON")
      }

      this.auth.assertActive(p)

      if (!target.exists) {
        initialize(db, p.accountId)
      }

      inspect(db, p.accountId)
      this.auth.assertActive(p)

      return db
    } catch (error) {
      db.close()
      throw error
    }
  }
  private row(
    db: DatabaseSync,
    p: FirstPartySessionPrincipal,
    id: string,
  ): DraftRecord {
    const row = db
      .prepare(
        "SELECT id,revision,authored,summary,locale FROM drafts WHERE owner=? AND id=?",
      )
      .get(p.accountId, id)

    if (!row) {
      throw new ToolError("NOT_FOUND")
    }

    return this.checked({
      draftId: row.id,
      revision: row.revision,
      authoredShowJson: row.authored,
      summary:
        typeof row.summary === "string"
          ? (JSON.parse(row.summary) as unknown)
          : null,
      ...(row.locale === null ? {} : { locale: row.locale }),
    })
  }
  get(p: FirstPartySessionPrincipal, id: string): DraftRecord {
    this.auth.assertActive(p)

    if (!opaqueId.safeParse(id).success) {
      throw new ToolError("VALIDATION_FAILED")
    }

    let db: DatabaseSync | undefined = undefined

    try {
      db = this.open(p, false)

      if (!db) {
        throw new ToolError("NOT_FOUND")
      }

      db.exec("BEGIN")
      const result = this.row(db, p, id)
      this.auth.assertActive(p)
      db.exec("COMMIT")
      this.auth.assertActive(p)

      return result
    } catch (error) {
      throw error instanceof ToolError ? error : unavailable()
    } finally {
      db?.close()
    }
  }
  private mutate<T extends Outcome>(
    p: FirstPartySessionPrincipal,
    kind: Kind,
    key: string,
    request: unknown,
    run: (db: DatabaseSync) => T,
  ): T {
    this.auth.assertActive(p)
    const inputDigest = hashJson(request)
    let db: DatabaseSync | undefined = undefined
    let transaction = false

    try {
      db = this.open(p, true)

      if (!db) {
        throw unavailable()
      }

      db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE")
      transaction = true
      this.auth.assertActive(p)
      const prior = db
        .prepare(
          `SELECT digest,state,outcome,native_id FROM operations
        WHERE authority='first-party-session' AND owner=? AND sid=? AND kind=? AND request_key=?`,
        )
        .get(p.accountId, p.sid, kind, key)
      let result: T | undefined = undefined

      if (prior) {
        if (prior.digest !== inputDigest) {
          throw new ToolError("REQUEST_KEY_REUSED")
        }

        if (
          prior.native_id !== null ||
          typeof prior.outcome !== "string" ||
          prior.state !== (kind === "prepare-save" ? "PENDING_C1" : "COMPLETED")
        ) {
          throw unavailable()
        }

        const raw: unknown = JSON.parse(prior.outcome)
        // A replay validates the durable outcome before returning private data;
        // it intentionally precedes any lookup of the current mutable draft.
        result = (
          kind === "prepare-save" ? pending.parse(raw) : this.checked(raw)
        ) as T
        this.auth.assertActive(p)
      } else {
        const count = db.prepare("SELECT count(*) AS n FROM operations").get()

        if (typeof count?.n !== "number" || count.n >= limits.operations) {
          throw new ToolError("QUOTA_EXCEEDED")
        }

        result = run(db)
        const state = kind === "prepare-save" ? "PENDING_C1" : "COMPLETED"
        db.prepare(
          `INSERT INTO operations(authority,owner,sid,kind,request_key,digest,state,outcome,native_id)
          VALUES('first-party-session',?,?,?,?,?,?,?,NULL)`,
        ).run(
          p.accountId,
          p.sid,
          kind,
          key,
          inputDigest,
          state,
          canonicalJson(result),
        )
        db.prepare(
          `INSERT INTO audit(owner,sid,kind,request_key,digest,disposition,created_ms) VALUES(?,?,?,?,?,?,?)`,
        ).run(p.accountId, p.sid, kind, key, inputDigest, state, Date.now())
      }

      this.auth.assertActive(p)
      db.exec("COMMIT")
      transaction = false
      // A revoke after COMMIT denies the outcome; committed rows remain durable.
      this.auth.assertActive(p)

      return result
    } catch (error) {
      if (transaction) {
        try {
          db?.exec("ROLLBACK")
        } catch {
          /* Preserve original error and files. */
        }
      }

      throw error instanceof ToolError ? error : unavailable()
    } finally {
      db?.close()
    }
  }
  create(p: FirstPartySessionPrincipal, raw: Create): DraftRecord {
    this.auth.assertActive(p)
    const parsed = inputs.create_game_draft.safeParse(raw)

    if (!parsed.success) {
      throw new ToolError("VALIDATION_FAILED")
    }

    const input = parsed.data
    const normalized = normalizeDraft(input.authoredShowJson, this.policy)

    return this.mutate(p, "create", input.idempotencyKey, input, (db) => {
      const count = db.prepare("SELECT count(*) AS n FROM drafts").get()

      if (typeof count?.n !== "number" || count.n >= limits.drafts) {
        throw new ToolError("QUOTA_EXCEEDED")
      }

      const result = this.checked({
        ...normalized,
        draftId: randomBytes(18).toString("base64url"),
        revision: 1,
        ...(input.locale ? { locale: input.locale } : {}),
      })
      db.prepare(
        "INSERT INTO drafts(id,owner,revision,authored,summary,locale) VALUES(?,?,?,?,?,?)",
      ).run(
        result.draftId,
        p.accountId,
        result.revision,
        result.authoredShowJson,
        canonicalJson(result.summary),
        result.locale ?? null,
      )

      return result
    })
  }
  replace(p: FirstPartySessionPrincipal, raw: Replace): DraftRecord {
    this.auth.assertActive(p)
    const parsed = inputs.update_game_draft.safeParse(raw)

    if (!parsed.success) {
      throw new ToolError("VALIDATION_FAILED")
    }

    const input = parsed.data
    const normalized = normalizeDraft(input.authoredShowJson, this.policy)

    return this.mutate(p, "replace", input.idempotencyKey, input, (db) => {
      const current = this.row(db, p, input.draftId)

      if (current.revision !== input.expectedRevision) {
        throw new ToolError("REVISION_CONFLICT", {
          currentRevision: current.revision,
        })
      }

      const preserved = normalizeStoredDraft(
        preserveSemanticState(
          current.authoredShowJson,
          normalized.authoredShowJson,
          this.policy,
        ),
        this.policy,
      )
      const result = this.checked({
        ...current,
        ...preserved,
        revision: current.revision + 1,
      })
      const changed = db
        .prepare(
          "UPDATE drafts SET revision=?,authored=?,summary=? WHERE owner=? AND id=? AND revision=?",
        )
        .run(
          result.revision,
          result.authoredShowJson,
          canonicalJson(result.summary),
          p.accountId,
          input.draftId,
          input.expectedRevision,
        )

      if (changed.changes !== 1) {
        throw new ToolError("REVISION_CONFLICT")
      }

      return result
    })
  }
  prepareSave(p: FirstPartySessionPrincipal, raw: Prepare): PendingSaveIntent {
    this.auth.assertActive(p)
    const parsed = inputs.save_game.safeParse(raw)

    if (!parsed.success) {
      throw new ToolError("VALIDATION_FAILED")
    }

    const input = parsed.data

    return this.mutate(p, "prepare-save", input.idempotencyKey, input, (db) => {
      const current = this.row(db, p, input.draftId)

      if (current.revision !== input.expectedRevision) {
        throw new ToolError("REVISION_CONFLICT", {
          currentRevision: current.revision,
        })
      }

      return pending.parse({
        state: "PENDING_C1",
        draftId: current.draftId,
        revision: current.revision,
        authoredDigest: hashJson(JSON.parse(current.authoredShowJson)),
      })
    })
  }
}
