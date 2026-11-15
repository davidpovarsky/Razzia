import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
} from "node:fs"
import { join, parse, resolve, sep } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { z } from "zod"
import type { ActiveOAuthGrant } from "../server/access-token.ts"
import type {
  AuthoringPolicy,
  DraftRecord,
  DraftRepository,
  MutationIdentity,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import { normalizeDraft } from "../server/authoring.ts"
import { checkedDraft } from "../server/drafts.ts"
import { canonicalJson, hashJson } from "../contracts/canonical.ts"
import { CONTRACT_VERSION, digest, opaqueId } from "../contracts/schemas.ts"
import { ToolError } from "../server/errors.ts"
import {
  assertFirstPartyBindings,
  type FirstPartyBindings,
  type FirstPartySessionPrincipal,
} from "./bindings.ts"
import {
  OAuthError,
  pkceChallenge,
  randomOpaque,
  tokenDigest,
  type OAuthProtocol,
} from "./oauth-protocol.ts"

const TABLES = {
  metadata:
    "CREATE TABLE metadata(owner TEXT PRIMARY KEY,version INTEGER NOT NULL CHECK(version=1))",
  grants:
    "CREATE TABLE grants(id TEXT PRIMARY KEY,owner TEXT NOT NULL,subject TEXT NOT NULL,client_id TEXT NOT NULL,sid TEXT NOT NULL,scope TEXT NOT NULL,expires_ms INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('active','revoked')))",
  codes:
    "CREATE TABLE codes(digest TEXT PRIMARY KEY,grant_id TEXT NOT NULL,challenge TEXT NOT NULL,redirect TEXT NOT NULL,resource TEXT NOT NULL,expires_ms INTEGER NOT NULL,used INTEGER NOT NULL CHECK(used IN (0,1)))",
  refresh:
    "CREATE TABLE refresh(digest TEXT PRIMARY KEY,grant_id TEXT NOT NULL,expires_ms INTEGER NOT NULL,used INTEGER NOT NULL CHECK(used IN (0,1)))",
  consents:
    "CREATE TABLE consents(digest TEXT PRIMARY KEY,grant_id TEXT NOT NULL)",
  drafts:
    "CREATE TABLE drafts(id TEXT PRIMARY KEY,owner TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),authored TEXT NOT NULL,summary TEXT NOT NULL,locale TEXT)",
  operations:
    "CREATE TABLE operations(grant_id TEXT NOT NULL,kind TEXT NOT NULL,request_key TEXT NOT NULL,digest TEXT NOT NULL,outcome TEXT NOT NULL,PRIMARY KEY(grant_id,kind,request_key))",
  audit:
    "CREATE TABLE audit(seq INTEGER PRIMARY KEY,grant_id TEXT NOT NULL,kind TEXT NOT NULL,request_key TEXT,correlation_id TEXT,input_digest TEXT,created_ms INTEGER NOT NULL)",
} as const
const grantSchema = z.strictObject({
  grantId: z.string().regex(/^[A-Za-z0-9_-]{32}$/u),
  accountId: z.uuid(),
  subject: z.uuid(),
  clientId: z.string().min(1).max(256),
  sid: z.uuid(),
  scopes: z.array(z.string().min(1).max(100)).min(1).max(20),
  expiresAt: z.number().int().positive(),
  active: z.literal(true),
})
type StoredGrant = z.infer<typeof grantSchema>
const unavailable = () => new OAuthError("temporarily_unavailable")
const invalid = () => new OAuthError("invalid_grant")
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/** Tenant-owned grant/code/rotating-refresh authority. Tokens/codes are stored
 * only as SHA256 digests. This owns no draft/native database or ambient account.
 * Existing first-party account/session authority is checked at every decision.
 */
export class FirstPartyOAuthGrants {
  constructor(
    private readonly auth: FirstPartyBindings,
    private readonly protocol: OAuthProtocol,
  ) {
    assertFirstPartyBindings(auth)
  }
  private ancestry(path: string, createFrom?: string) {
    let current = parse(path).root
    for (const part of path.slice(current.length).split(sep).filter(Boolean)) {
      current = join(current, part)
      try {
        const stat = lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable()
      } catch (error) {
        if (!missing(error)) throw unavailable()
        if (!createFrom) return false
        if (current !== createFrom && !current.startsWith(createFrom + sep))
          throw unavailable()
        mkdirSync(current, { mode: 0o700 })
        const stat = lstatSync(current)
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable()
      }
    }
    return true
  }
  private open(accountId: string, mutation: boolean, create = false) {
    this.auth.configured()
    if (!z.uuid().safeParse(accountId).success) throw invalid()
    const root = resolve(this.auth.root)
    if (root === parse(root).root || !this.ancestry(root)) throw unavailable()
    const dir = join(root, "tenants", accountId, "extensions", "mcp-oauth")
    if (!this.ancestry(dir, create ? join(root, "tenants") : undefined))
      return undefined
    const file = join(dir, "grants.sqlite")
    for (const suffix of ["-journal", "-wal", "-shm"]) {
      try {
        lstatSync(file + suffix)
        throw unavailable()
      } catch (error) {
        if (!missing(error)) throw error
      }
    }
    let created = false
    try {
      const stat = lstatSync(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
        throw unavailable()
      const fd = openSync(
        file,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
      )
      try {
        const opened = fstatSync(fd)
        const header = Buffer.alloc(100)
        if (
          opened.dev !== stat.dev ||
          opened.ino !== stat.ino ||
          readSync(fd, header, 0, 100, 0) !== 100 ||
          header.subarray(0, 16).toString("binary") !== "SQLite format 3\0" ||
          header[18] !== 1 ||
          header[19] !== 1
        )
          throw unavailable()
      } finally {
        closeSync(fd)
      }
    } catch (error) {
      if (!missing(error)) throw error
      if (!create) return undefined
      const fd = openSync(
        file,
        constants.O_CREAT |
          constants.O_EXCL |
          constants.O_WRONLY |
          (constants.O_NOFOLLOW ?? 0),
        0o600,
      )
      closeSync(fd)
      created = true
    }
    const db = new DatabaseSync(file, { readOnly: !mutation, timeout: 1000 })
    try {
      db.exec("PRAGMA trusted_schema=OFF")
      if (created) {
        db.exec(
          "PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE",
        )
        db.exec(Object.values(TABLES).join(";\n") + ";")
        db.prepare("INSERT INTO metadata(owner,version) VALUES(?,1)").run(
          accountId,
        )
        db.exec("PRAGMA user_version=1; COMMIT")
      }
      if (!mutation) db.exec("PRAGMA query_only=ON")
      const actual = db
        .prepare(
          "SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY name COLLATE BINARY LIMIT 20",
        )
        .all()
        .map((row) => [row.type, row.name, row.tbl_name, row.sql])
      const expected: unknown[][] = Object.entries(TABLES).map(
        ([name, sql]) => ["table", name, name, sql],
      )
      for (const table of Object.keys(TABLES).filter(
        (name) => name !== "audit",
      ))
        expected.push([
          "index",
          "sqlite_autoindex_" + table + "_1",
          table,
          null,
        ])
      expected.sort((a, b) =>
        String(a[1]) < String(b[1]) ? -1 : String(a[1]) > String(b[1]) ? 1 : 0,
      )
      if (
        JSON.stringify(actual) !== JSON.stringify(expected) ||
        db.prepare("PRAGMA user_version").get()?.user_version !== 1 ||
        db.prepare("PRAGMA journal_mode").get()?.journal_mode !== "delete" ||
        db.prepare("PRAGMA quick_check(1)").get()?.quick_check !== "ok"
      )
        throw unavailable()
      const metadata = db.prepare("SELECT owner,version FROM metadata").all()
      if (
        metadata.length !== 1 ||
        metadata[0]?.owner !== accountId ||
        metadata[0]?.version !== 1
      )
        throw unavailable()
      return db
    } catch (error) {
      db.close()
      throw error
    }
  }
  private row(
    db: DatabaseSync,
    accountId: string,
    grantId: string,
  ): StoredGrant {
    const raw = db
      .prepare("SELECT * FROM grants WHERE owner=? AND id=?")
      .get(accountId, grantId)
    if (!raw || raw.state !== "active" || typeof raw.scope !== "string")
      throw invalid()
    const result = grantSchema.safeParse({
      grantId: raw.id,
      accountId: raw.owner,
      subject: raw.subject,
      clientId: raw.client_id,
      sid: raw.sid,
      scopes: JSON.parse(raw.scope),
      expiresAt: raw.expires_ms,
      active: true,
    })
    if (
      !result.success ||
      result.data.subject !== accountId ||
      result.data.expiresAt <= Date.now() ||
      !this.auth.delegatedSessionActive(accountId, result.data.sid)
    )
      throw invalid()
    const allowed = this.protocol.client(result.data.clientId).scopes
    if (result.data.scopes.some((scope) => !allowed.includes(scope)))
      throw invalid()
    return result.data
  }
  private audit(
    db: DatabaseSync,
    grantId: string,
    kind: string,
    mutation?: MutationIdentity,
  ) {
    db.prepare(
      "INSERT INTO audit(grant_id,kind,request_key,correlation_id,input_digest,created_ms) VALUES(?,?,?,?,?,?)",
    ).run(
      grantId,
      kind,
      mutation?.idempotencyKey ?? null,
      mutation?.correlationId ?? null,
      mutation?.inputDigest ?? null,
      Date.now(),
    )
  }
  private transaction<T>(
    accountId: string,
    create: boolean,
    run: (db: DatabaseSync) => T,
  ) {
    let db: DatabaseSync | undefined
    let active = false
    try {
      db = this.open(accountId, true, create)
      if (!db) throw invalid()
      db.exec("PRAGMA synchronous=FULL; BEGIN IMMEDIATE")
      active = true
      const result = run(db)
      db.exec("COMMIT")
      active = false
      return result
    } catch (error) {
      if (active)
        try {
          db?.exec("ROLLBACK")
        } catch {
          /* Preserve the original uncertain failure. */
        }
      throw error instanceof OAuthError || error instanceof ToolError
        ? error
        : unavailable()
    } finally {
      try {
        db?.close()
      } catch {
        throw unavailable()
      }
    }
  }
  /** Call only from the real same-origin, CSRF-checked first-party consent POST.
   * The principal capability must have been issued by the real manager binding.
   * Token scopes consent is distinct from exact-revision native-save consent.
   */
  approve(p: FirstPartySessionPrincipal, encodedTicket: string) {
    this.auth.assertActive(p)
    const ticket = this.protocol.readTicket(encodedTicket)
    const result = this.transaction(p.accountId, true, (db) => {
      this.auth.assertActive(p)
      const count = db.prepare("SELECT count(*) AS n FROM grants").get()?.n
      if (typeof count !== "number" || count >= 1000) throw unavailable()
      const digest = tokenDigest(encodedTicket)
      if (
        db.prepare("SELECT grant_id FROM consents WHERE digest=?").get(digest)
      )
        throw invalid()
      const grantId = randomOpaque()
      const expiresAt = Math.min(p.expiresAt, Date.now() + 24 * 60 * 60 * 1000)
      db.prepare(
        "INSERT INTO grants(id,owner,subject,client_id,sid,scope,expires_ms,state) VALUES(?,?,?,?,?,?,?,'active')",
      ).run(
        grantId,
        p.accountId,
        p.subject,
        ticket.client_id,
        p.sid,
        JSON.stringify(ticket.scope.split(" ")),
        expiresAt,
      )
      const code = this.protocol.code({
        accountId: p.accountId,
        grantId,
        clientId: ticket.client_id,
        nonce: randomOpaque(),
        expiresAt: Math.min(
          Math.floor(expiresAt / 1000),
          Math.floor(Date.now() / 1000) + 120,
        ),
      })
      db.prepare(
        "INSERT INTO codes(digest,grant_id,challenge,redirect,resource,expires_ms,used) VALUES(?,?,?,?,?,?,0)",
      ).run(
        tokenDigest(code),
        grantId,
        ticket.code_challenge,
        ticket.redirect_uri,
        ticket.resource,
        Math.min(expiresAt, Date.now() + 120_000),
      )
      db.prepare("INSERT INTO consents(digest,grant_id) VALUES(?,?)").run(
        digest,
        grantId,
      )
      this.audit(db, grantId, "grant-approved")
      this.auth.assertActive(p)
      return {
        redirectUrl: this.protocol.authorizationResponse(ticket, code),
        grantId,
      }
    })
    this.auth.assertActive(p)
    return result
  }
  private tokens(db: DatabaseSync, grant: StoredGrant) {
    const count = db.prepare("SELECT count(*) AS n FROM refresh").get()?.n
    if (typeof count !== "number" || count >= 5000) throw unavailable()
    const refresh = this.protocol.refresh({
      accountId: grant.accountId,
      grantId: grant.grantId,
      clientId: grant.clientId,
      nonce: randomOpaque(),
      expiresAt: Math.floor(grant.expiresAt / 1000),
    })
    db.prepare(
      "INSERT INTO refresh(digest,grant_id,expires_ms,used) VALUES(?,?,?,0)",
    ).run(tokenDigest(refresh), grant.grantId, grant.expiresAt)
    return { ...this.protocol.access(grant), refresh_token: refresh }
  }
  exchange(input: {
    client_id: string
    code: string
    code_verifier: string
    redirect_uri: string
    resource: string
  }) {
    const code = this.protocol.readCode(input.code)
    if (
      code.clientId !== input.client_id ||
      input.resource !== this.protocol.config.resource ||
      !this.protocol
        .client(input.client_id)
        .redirectUris.includes(input.redirect_uri)
    )
      throw invalid()
    const challenge = pkceChallenge(input.code_verifier)
    const outcome = this.transaction(code.accountId, false, (db) => {
      const grant = this.row(db, code.accountId, code.grantId)
      if (grant.clientId !== code.clientId) throw invalid()
      const row = db
        .prepare("SELECT * FROM codes WHERE digest=? AND grant_id=?")
        .get(tokenDigest(input.code), grant.grantId)
      if (
        !row ||
        typeof row.expires_ms !== "number" ||
        row.expires_ms <= Date.now() ||
        row.challenge !== challenge ||
        row.redirect !== input.redirect_uri ||
        row.resource !== input.resource
      )
        throw invalid()
      if (row.used !== 0) {
        db.prepare(
          "UPDATE grants SET state='revoked' WHERE owner=? AND id=?",
        ).run(code.accountId, code.grantId)
        this.audit(db, grant.grantId, "code-replay-revoked")
        return { denied: true as const }
      }
      db.prepare("UPDATE codes SET used=1 WHERE digest=? AND used=0").run(
        tokenDigest(input.code),
      )
      const result = this.tokens(db, grant)
      this.audit(db, grant.grantId, "code-exchanged")
      this.row(db, code.accountId, code.grantId)
      return { denied: false as const, tokens: result }
    })
    if (outcome.denied) throw invalid()
    return outcome.tokens
  }
  rotate(input: {
    client_id: string
    refresh_token: string
    resource: string
  }) {
    const token = this.protocol.readRefresh(input.refresh_token)
    if (
      token.clientId !== input.client_id ||
      input.resource !== this.protocol.config.resource
    )
      throw invalid()
    const result = this.transaction(token.accountId, false, (db) => {
      const grant = this.row(db, token.accountId, token.grantId)
      if (grant.clientId !== token.clientId) throw invalid()
      const row = db
        .prepare("SELECT * FROM refresh WHERE digest=? AND grant_id=?")
        .get(tokenDigest(input.refresh_token), grant.grantId)
      if (
        !row ||
        typeof row.expires_ms !== "number" ||
        row.expires_ms <= Date.now()
      )
        throw invalid()
      if (row.used !== 0) {
        db.prepare(
          "UPDATE grants SET state='revoked' WHERE owner=? AND id=?",
        ).run(token.accountId, token.grantId)
        this.audit(db, grant.grantId, "refresh-replay-revoked")
        return { denied: true as const }
      }
      db.prepare("UPDATE refresh SET used=1 WHERE digest=? AND used=0").run(
        tokenDigest(input.refresh_token),
      )
      const tokens = this.tokens(db, grant)
      this.audit(db, grant.grantId, "refresh-rotated")
      this.row(db, token.accountId, token.grantId)
      return { denied: false as const, tokens }
    })
    if (result.denied) throw invalid()
    return result.tokens
  }
  activeGrant(
    accountId: string,
    grantId: string,
  ): ActiveOAuthGrant | undefined {
    let db: DatabaseSync | undefined
    try {
      db = this.open(accountId, false)
      if (!db) return undefined
      const grant = this.row(db, accountId, grantId)
      const { sid: _sid, ...publicGrant } = grant
      return Object.freeze({
        ...publicGrant,
        scopes: Object.freeze([...grant.scopes]),
      })
    } catch (error) {
      if (error instanceof OAuthError && error.code === "invalid_grant")
        return undefined
      throw unavailable()
    } finally {
      try {
        db?.close()
      } catch {
        throw unavailable()
      }
    }
  }
  revokeToken(clientId: string, encoded: string) {
    this.protocol.client(clientId)
    let token: ReturnType<OAuthProtocol["readRefresh"]>
    try {
      token = this.protocol.readRefresh(encoded)
    } catch {
      return
    }
    if (token.clientId !== clientId) return
    this.transaction(token.accountId, false, (db) => {
      const row = db
        .prepare("SELECT grant_id FROM refresh WHERE digest=? AND grant_id=?")
        .get(tokenDigest(encoded), token.grantId)
      if (!row) return
      db.prepare(
        "UPDATE grants SET state='revoked' WHERE owner=? AND id=? AND client_id=?",
      ).run(token.accountId, token.grantId, clientId)
      this.audit(db, token.grantId, "client-token-revoked")
    })
  }
  revoke(p: FirstPartySessionPrincipal, grantId: string) {
    this.auth.assertActive(p)
    this.transaction(p.accountId, false, (db) => {
      this.auth.assertActive(p)
      db.prepare(
        "UPDATE grants SET state='revoked' WHERE owner=? AND id=?",
      ).run(p.accountId, grantId)
      this.audit(db, grantId, "first-party-revoked")
      this.auth.assertActive(p)
    })
    this.auth.assertActive(p)
  }
  drafts(
    policy: AuthoringPolicy,
    assertIssued: (p: VerifiedPrincipal) => void,
  ): DraftRepository {
    const checked = (value: unknown) =>
      checkedDraft(value, { authoring: policy })
    const authority = (
      db: DatabaseSync,
      p: VerifiedPrincipal,
      required: readonly string[],
    ) => {
      assertIssued(p)
      const grant = this.row(db, p.accountId, p.grantId)
      if (
        p.issuer !== this.protocol.config.issuer ||
        p.audience !== this.protocol.config.resource ||
        p.subject !== grant.subject ||
        p.clientId !== grant.clientId ||
        p.expiresAt <= Date.now() ||
        !required.every(
          (scope) => p.scopes.includes(scope) && grant.scopes.includes(scope),
        )
      )
        throw new ToolError("SCOPE_REQUIRED")
    }
    const read = (db: DatabaseSync, p: VerifiedPrincipal, id: string) => {
      opaqueId.parse(id)
      const row = db
        .prepare(
          "SELECT id,revision,authored,summary,locale FROM drafts WHERE owner=? AND id=?",
        )
        .get(p.accountId, id)
      if (!row || typeof row.summary !== "string")
        throw new ToolError("NOT_FOUND")
      return checked({
        draftId: row.id,
        revision: row.revision,
        authoredShowJson: row.authored,
        summary: JSON.parse(row.summary),
        ...(row.locale === null ? {} : { locale: row.locale }),
      })
    }
    const mutate = (
      p: VerifiedPrincipal,
      kind: "create" | "replace",
      draft: NormalizedDraft,
      mutation: MutationIdentity,
      selected?: { id: string; revision: number },
    ): DraftRecord => {
      assertIssued(p)
      const normalized = normalizeDraft(draft.authoredShowJson, policy)
      if (canonicalJson(normalized.summary) !== canonicalJson(draft.summary))
        throw new ToolError("VALIDATION_FAILED")
      opaqueId.parse(mutation.idempotencyKey)
      opaqueId.parse(mutation.correlationId)
      digest.parse(mutation.inputDigest)
      const expectedDigest = hashJson({
        contractVersion: CONTRACT_VERSION,
        authoredShowJson: normalized.authoredShowJson,
        idempotencyKey: mutation.idempotencyKey,
        ...(selected
          ? { draftId: selected.id, expectedRevision: selected.revision }
          : draft.locale
            ? { locale: draft.locale }
            : {}),
      })
      if (mutation.inputDigest !== expectedDigest)
        throw new ToolError("VALIDATION_FAILED")
      return this.transaction(p.accountId, false, (db) => {
        const required =
          kind === "create"
            ? ["tadazz.drafts.write"]
            : ["tadazz.drafts.read", "tadazz.drafts.write"]
        authority(db, p, required)
        const prior = db
          .prepare(
            "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind=? AND request_key=?",
          )
          .get(p.grantId, kind, mutation.idempotencyKey)
        if (prior) {
          if (prior.digest !== mutation.inputDigest)
            throw new ToolError("REQUEST_KEY_REUSED")
          if (typeof prior.outcome !== "string") throw unavailable()
          const replay = checked(JSON.parse(prior.outcome))
          authority(db, p, required)
          return replay
        }
        const count = db
          .prepare("SELECT count(*) AS n FROM operations")
          .get()?.n
        if (typeof count !== "number" || count >= 5000)
          throw new ToolError("QUOTA_EXCEEDED")
        let result: DraftRecord
        if (selected) {
          const current = read(db, p, selected.id)
          if (current.revision !== selected.revision)
            throw new ToolError("REVISION_CONFLICT", {
              currentRevision: current.revision,
            })
          result = checked({
            ...current,
            ...normalized,
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
              selected.id,
              selected.revision,
            )
          if (changed.changes !== 1) throw new ToolError("REVISION_CONFLICT")
        } else {
          const count = db.prepare("SELECT count(*) AS n FROM drafts").get()?.n
          if (typeof count !== "number" || count >= 100)
            throw new ToolError("QUOTA_EXCEEDED")
          result = checked({
            ...normalized,
            draftId: randomOpaque(),
            revision: 1,
            ...(draft.locale ? { locale: draft.locale } : {}),
          })
          db.prepare(
            "INSERT INTO drafts(id,owner,revision,authored,summary,locale) VALUES(?,?,?,?,?,?)",
          ).run(
            result.draftId,
            p.accountId,
            1,
            result.authoredShowJson,
            canonicalJson(result.summary),
            result.locale ?? null,
          )
        }
        db.prepare(
          "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,?,?,?,?)",
        ).run(
          p.grantId,
          kind,
          mutation.idempotencyKey,
          mutation.inputDigest,
          canonicalJson(result),
        )
        this.audit(db, p.grantId, "draft-" + kind, mutation)
        authority(db, p, required)
        return result
      })
    }
    const safe = <T>(run: () => T): T => {
      try {
        return run()
      } catch (error) {
        if (error instanceof ToolError) throw error
        throw new ToolError(
          error instanceof OAuthError && error.code === "invalid_grant"
            ? "SCOPE_REQUIRED"
            : "DEPENDENCY_UNAVAILABLE",
        )
      }
    }
    return {
      create: async (p, draft, mutation) =>
        safe(() => mutate(p, "create", draft, mutation)),
      replace: async (p, id, revision, draft, mutation) =>
        safe(() => mutate(p, "replace", draft, mutation, { id, revision })),
      get: async (p, id) =>
        safe(() => {
          assertIssued(p)
          let db: DatabaseSync | undefined
          try {
            db = this.open(p.accountId, false)
            if (!db) throw new ToolError("NOT_FOUND")
            authority(db, p, ["tadazz.drafts.read"])
            const result = read(db, p, id)
            authority(db, p, ["tadazz.drafts.read"])
            return result
          } finally {
            try {
              db?.close()
            } catch {
              throw unavailable()
            }
          }
        }),
    }
  }
}
