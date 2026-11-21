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
  Dependencies,
  DraftRecord,
  DraftRepository,
  MutationIdentity,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../server/dependencies.ts"
import { normalizeDraft, normalizeStoredDraft } from "../server/authoring.ts"
import { preserveSemanticState } from "../server/semantic-state.ts"
import type { SemanticDraftPort } from "../server/semantic-drafts.ts"
import { createSemanticDraftPort } from "./oauth-semantic-drafts.ts"
import { checkedDraft } from "../server/drafts.ts"
import { canonicalJson, hashJson, utf8Bytes } from "../contracts/canonical.ts"
import { inputs } from "../contracts/tools.ts"
import { packageScopes } from "../contracts/package-authoring.ts"
import type { PackageAuthoringPort } from "../server/package-authoring.ts"
import { CONTRACT_VERSION, digest, opaqueId } from "../contracts/schemas.ts"
import { ToolError } from "../server/errors.ts"
import {
  assertFirstPartyBindings,
  type FirstPartyBindings,
  type FirstPartySessionPrincipal,
} from "./bindings.ts"
import {
  OAuthError,
  PERSISTENT_GRANT_EXPIRES_AT,
  pkceChallenge,
  randomOpaque,
  tokenDigest,
  type OAuthProtocol,
  type OAuthTokenResponse,
} from "./oauth-protocol.ts"
import {
  createExportBody,
  exportReceiptSchema,
  type FirstPartyExportPolicy,
  type ExportFormat,
} from "./oauth-export.ts"
import {
  createNativeSaveAdapter,
  type FirstPartyNativeSaveOptions,
} from "./oauth-native-save.ts"
import {
  createNativeCatalog,
  type FirstPartyCatalogOptions,
} from "./oauth-catalog.ts"

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

export type StoredOAuthGrant = z.infer<typeof grantSchema>

type StoredGrant = StoredOAuthGrant
const unavailable = () => new OAuthError("temporarily_unavailable")
const invalid = () => new OAuthError("invalid_grant")
const missing = (error: unknown) =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

/** Tenant-owned grant/code/rotating-refresh authority. Tokens/codes are stored
 * as SHA256 digests, with one encrypted short retry capsule per connection.
 * This owns no draft/native database or ambient account.
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
    return this.grantRow(db, { accountId, grantId })
  }
  private grantRow(
    db: DatabaseSync,
    {
      accountId,
      grantId,
      allowLegacyRenewal = false,
    }: {
      accountId: string
      grantId: string
      allowLegacyRenewal?: boolean
    },
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
      (!allowLegacyRenewal && result.data.expiresAt <= Date.now()) ||
      !(result.data.expiresAt === PERSISTENT_GRANT_EXPIRES_AT ||
      allowLegacyRenewal
        ? this.auth.delegatedConnectionActive(accountId, result.data.sid)
        : this.auth.delegatedSessionActive(accountId, result.data.sid))
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
      const expiresAt = PERSISTENT_GRANT_EXPIRES_AT
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
    // A refresh response is returned only after this transaction commits. Each
    // grant keeps one digest; an issuer-authentic prior token remains detectable
    // as replay through its sealed grant/client identity even after replacement.
    // This avoids exhausting a lifetime quota through ordinary token renewal.
    db.prepare("UPDATE grants SET expires_ms=? WHERE owner=? AND id=?").run(
      PERSISTENT_GRANT_EXPIRES_AT,
      grant.accountId,
      grant.grantId,
    )
    db.prepare("DELETE FROM refresh WHERE grant_id=?").run(grant.grantId)
    const refresh = this.protocol.refresh({
      version: 2,
      accountId: grant.accountId,
      grantId: grant.grantId,
      clientId: grant.clientId,
      nonce: randomOpaque(),
    })
    db.prepare(
      "INSERT INTO refresh(digest,grant_id,expires_ms,used) VALUES(?,?,?,0)",
    ).run(tokenDigest(refresh), grant.grantId, PERSISTENT_GRANT_EXPIRES_AT)

    return {
      ...this.protocol.access({
        ...grant,
        expiresAt: PERSISTENT_GRANT_EXPIRES_AT,
      }),
      refresh_token: refresh,
    }
  }
  private storedTokenRetry(db: DatabaseSync, grant: StoredGrant) {
    const row = db
      .prepare(
        "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind='oauth-token-retry' AND request_key='latest'",
      )
      .get(grant.grantId)

    if (!row) {
      return undefined
    }

    if (typeof row.outcome !== "string") {
      throw unavailable()
    }

    const retry = this.protocol.readTokenRetry(row.outcome)

    if (
      retry.accountId !== grant.accountId ||
      retry.grantId !== grant.grantId ||
      retry.clientId !== grant.clientId ||
      retry.resource !== this.protocol.config.resource ||
      retry.requestDigest !== row.digest ||
      retry.tokens.scope !== grant.scopes.join(" ") ||
      retry.expiresAt - retry.issuedAt !== 30_000 ||
      retry.accessExpiresAt > retry.issuedAt + 300_000
    ) {
      throw unavailable()
    }

    return retry
  }
  private tokenRetry(
    db: DatabaseSync,
    grant: StoredGrant,
    inputDigest: string,
  ): OAuthTokenResponse | undefined {
    const retry = this.storedTokenRetry(db, grant)

    if (!retry || retry.requestDigest !== inputDigest) {
      return undefined
    }

    const now = Date.now()

    if (
      retry.issuedAt > now ||
      retry.expiresAt <= now ||
      retry.accessExpiresAt <= now ||
      !db
        .prepare(
          "SELECT digest FROM refresh WHERE digest=? AND grant_id=? AND used=0 AND expires_ms=?",
        )
        .get(
          tokenDigest(retry.tokens.refresh_token),
          grant.grantId,
          PERSISTENT_GRANT_EXPIRES_AT,
        )
    ) {
      return undefined
    }

    return {
      ...retry.tokens,
      expires_in: Math.floor((retry.accessExpiresAt - now) / 1000),
    }
  }
  private rememberTokenRetry(
    db: DatabaseSync,
    grant: StoredGrant,
    {
      inputDigest,
      tokens,
      refreshed,
    }: {
      inputDigest: string
      tokens: OAuthTokenResponse
      refreshed: boolean
    },
  ) {
    const now = Date.now()
    const prior = this.storedTokenRetry(db, grant)
    const refreshCount = (prior?.refreshCount ?? 0) + (refreshed ? 1 : 0)
    const accessExpiresAt =
      z
        .object({ exp: z.number().int().positive() })
        .parse(
          JSON.parse(
            Buffer.from(
              tokens.access_token.split(".")[1] ?? "",
              "base64url",
            ).toString("utf8"),
          ) as unknown,
        ).exp * 1000
    const outcome = this.protocol.tokenRetry({
      version: 1,
      accountId: grant.accountId,
      grantId: grant.grantId,
      clientId: grant.clientId,
      resource: this.protocol.config.resource,
      requestDigest: inputDigest,
      refreshCount,
      issuedAt: now,
      expiresAt: now + 30_000,
      accessExpiresAt,
      tokens,
    })
    db.prepare(
      "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,'oauth-token-retry','latest',?,?) ON CONFLICT(grant_id,kind,request_key) DO UPDATE SET digest=excluded.digest,outcome=excluded.outcome",
    ).run(grant.grantId, inputDigest, outcome)
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
    const inputDigest = hashJson({ grantType: "authorization_code", ...input })
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
        const retry = this.tokenRetry(db, grant, inputDigest)

        if (retry) {
          this.row(db, code.accountId, code.grantId)

          return { denied: false as const, tokens: retry }
        }

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
      this.rememberTokenRetry(db, grant, {
        inputDigest,
        tokens: result,
        refreshed: false,
      })
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
    // Legacy expiry is inspected only after proving possession of the exact
    // stored unused credential and its still-active native revocation anchor.
    const token = this.protocol.readRefresh(input.refresh_token, false)
    if (
      token.clientId !== input.client_id ||
      input.resource !== this.protocol.config.resource
    )
      throw invalid()

    const inputDigest = hashJson({ grantType: "refresh_token", ...input })
    const result = this.transaction(token.accountId, false, (db) => {
      const grant = this.grantRow(db, {
        accountId: token.accountId,
        grantId: token.grantId,
        allowLegacyRenewal: true,
      })
      if (grant.clientId !== token.clientId) throw invalid()
      const row = db
        .prepare("SELECT * FROM refresh WHERE digest=? AND grant_id=?")
        .get(tokenDigest(input.refresh_token), grant.grantId)
      const retry = this.tokenRetry(db, grant, inputDigest)

      if (retry) {
        this.row(db, token.accountId, token.grantId)

        return { denied: false as const, tokens: retry }
      }
      if (
        (row && row.used !== 0) ||
        (!row && grant.expiresAt === PERSISTENT_GRANT_EXPIRES_AT)
      ) {
        db.prepare(
          "UPDATE grants SET state='revoked' WHERE owner=? AND id=?",
        ).run(token.accountId, token.grantId)
        this.audit(db, grant.grantId, "refresh-replay-revoked")
        return { denied: true as const }
      }

      if (
        !row ||
        typeof row.expires_ms !== "number" ||
        ("version" in token
          ? grant.expiresAt !== PERSISTENT_GRANT_EXPIRES_AT ||
            row.expires_ms !== PERSISTENT_GRANT_EXPIRES_AT
          : Math.floor(row.expires_ms / 1000) !== token.expiresAt)
      ) {
        throw invalid()
      }

      const tokens = this.tokens(db, grant)
      this.rememberTokenRetry(db, grant, {
        inputDigest,
        tokens,
        refreshed: true,
      })
      // Routine refresh telemetry stays in the bounded current summary above.
      // Preserve historical/security audit rows and record a legacy upgrade once.

      if (!("version" in token)) {
        this.audit(db, grant.grantId, "connection-upgraded")
      }

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
      token = this.protocol.readRefresh(encoded, false)
    } catch {
      return
    }
    if (token.clientId !== clientId) return
    this.transaction(token.accountId, false, (db) => {
      // Any issuer-authentic refresh credential for this exact connection can
      // revoke it, including an old rotated token. No token plaintext is stored.
      const row = db
        .prepare("SELECT id FROM grants WHERE owner=? AND id=? AND client_id=?")
        .get(token.accountId, token.grantId, clientId)
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
  packages(
    adapter: PackageAuthoringPort,
    assertIssued: (p: VerifiedPrincipal) => void,
  ): PackageAuthoringPort {
    return Object.freeze<PackageAuthoringPort>({
      call: async (principal, name, input) => {
        let db: DatabaseSync | undefined = undefined
        const authority = () => {
          assertIssued(principal)

          if (!db) {
            throw invalid()
          }

          const grant = this.row(db, principal.accountId, principal.grantId)

          if (
            principal.issuer !== this.protocol.config.issuer ||
            principal.audience !== this.protocol.config.resource ||
            principal.subject !== grant.subject ||
            principal.clientId !== grant.clientId ||
            packageScopes[name].some(
              (scope) =>
                !principal.scopes.includes(scope) ||
                !grant.scopes.includes(scope),
            )
          ) {
            throw new ToolError("SCOPE_REQUIRED")
          }
        }

        try {
          try {
            assertIssued(principal)
            db = this.open(principal.accountId, false)
            authority()
            const result = await adapter.call(principal, name, input)
            authority()

            return result
          } finally {
            db?.close()
          }
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
      },
    })
  }
  catalog(
    options: FirstPartyCatalogOptions,
    assertIssued: (p: VerifiedPrincipal) => void,
  ) {
    return createNativeCatalog(
      {
        protocol: this.protocol,
        read: (p, action) => {
          let db: DatabaseSync | undefined = undefined
          const authority = () => {
            assertIssued(p)

            if (!db) {
              throw invalid()
            }

            const grant = this.row(db, p.accountId, p.grantId)

            if (
              p.issuer !== this.protocol.config.issuer ||
              p.audience !== this.protocol.config.resource ||
              p.subject !== grant.subject ||
              p.clientId !== grant.clientId ||
              !p.scopes.includes("tadazz.catalog.read") ||
              !grant.scopes.includes("tadazz.catalog.read")
            ) {
              throw new ToolError("SCOPE_REQUIRED")
            }
          }

          try {
            assertIssued(p)
            db = this.open(p.accountId, false)
            authority()
            const result = action()
            authority()

            return result
          } catch (error) {
            if (error instanceof ToolError) {
              throw error
            }

            throw new ToolError(
              error instanceof OAuthError && error.code === "invalid_grant"
                ? "SCOPE_REQUIRED"
                : "DEPENDENCY_UNAVAILABLE",
            )
          } finally {
            try {
              db?.close()
            } catch {
              // eslint-disable-next-line no-unsafe-finally -- An uncertain SQLite close must prevent successful data disclosure.
              throw new ToolError("DEPENDENCY_UNAVAILABLE")
            }
          }
        },
      },
      options,
    )
  }
  nativeSave(
    options: FirstPartyNativeSaveOptions,
    assertIssued: (p: VerifiedPrincipal) => void,
  ) {
    return createNativeSaveAdapter(
      {
        auth: this.auth,
        protocol: this.protocol,
        assertIssued,
        grant: (db, owner, grantId) => this.row(db, owner, grantId),
        atomic: (owner, action) => this.transaction(owner, false, action),
        read: (owner, action) => {
          let db: DatabaseSync | undefined = undefined

          try {
            db = this.open(owner, false)

            if (!db) {
              throw invalid()
            }

            return action(db)
          } finally {
            try {
              db?.close()
            } catch {
              // eslint-disable-next-line no-unsafe-finally -- An uncertain SQLite close must prevent successful data disclosure.
              throw unavailable()
            }
          }
        },
        // eslint-disable-next-line max-params -- Preserve the existing ledger audit port's transaction and mutation binding.
        audit: (db, grantId, kind, mutation) =>
          this.audit(db, grantId, kind, mutation),
      },
      options,
    )
  }
  private checkedExport(
    raw: unknown,
    accountId: string,
    grantId: string,
    requestKey: string,
    policy: FirstPartyExportPolicy,
  ) {
    const receipt = exportReceiptSchema.parse(raw)
    const draft = checkedDraft(receipt.draft, { authoring: policy.authoring })
    const data = receipt.data
    const issuer = new URL(this.protocol.config.issuer)
    const prefix = issuer.pathname.replace(/\/$/u, "") + "/downloads/"
    const url = new URL(data.downloadUrl)
    if (
      url.origin !== issuer.origin ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !url.pathname.startsWith(prefix)
    )
      throw unavailable()
    const ticket = this.protocol.readDownloadTicket(
      url.pathname.slice(prefix.length),
      false,
    )
    if (
      ticket.accountId !== accountId ||
      ticket.grantId !== grantId ||
      ticket.requestKey !== requestKey ||
      ticket.exportId !== data.exportId ||
      ticket.draftId !== draft.draftId ||
      ticket.revision !== draft.revision ||
      data.draftId !== draft.draftId ||
      data.revision !== draft.revision ||
      data.format !== ticket.format ||
      ticket.authoredSha256 !== tokenDigest(draft.authoredShowJson) ||
      ticket.sha256 !== data.sha256 ||
      data.sha256 !== tokenDigest(receipt.body) ||
      data.bytes !== utf8Bytes(receipt.body) ||
      data.expiresAt !== new Date(ticket.expiresAt).toISOString() ||
      (data.format === "tada-json" && receipt.body !== draft.authoredShowJson)
    )
      throw unavailable()
    return { ...receipt, draft, ticket }
  }

  private exportRights(
    grant: StoredGrant,
    draft: DraftRecord,
    format: ExportFormat,
    policy: FirstPartyExportPolicy,
  ) {
    const context = Object.freeze({
      accountId: grant.accountId,
      grantId: grant.grantId,
      clientId: grant.clientId,
    })
    if (
      !grant.scopes.includes("tadazz.drafts.read") ||
      !grant.scopes.includes("tadazz.exports.read") ||
      policy.canExport(context, draft, format) !== true
    )
      throw new ToolError("EXPORT_UNAVAILABLE")
  }

  /** Same tenant operations ledger; no schema/migration, native allocation or new consent. */
  exports(
    policy: FirstPartyExportPolicy,
    assertIssued: (p: VerifiedPrincipal) => void,
  ): NonNullable<Dependencies["exports"]> {
    return {
      createAuthorizedDownload: async (p, selected, format, mutation) => {
        try {
          assertIssued(p)
          const parsed = inputs.export_game.safeParse({
            contractVersion: CONTRACT_VERSION,
            ...selected,
            format,
            idempotencyKey: mutation.idempotencyKey,
          })
          if (
            !parsed.success ||
            !digest.safeParse(mutation.inputDigest).success ||
            hashJson(parsed.data) !== mutation.inputDigest ||
            !z.string().min(1).max(128).safeParse(mutation.correlationId)
              .success
          )
            throw new ToolError("VALIDATION_FAILED")
          return this.transaction(p.accountId, false, (db) => {
            const authority = () => {
              assertIssued(p)
              const grant = this.row(db, p.accountId, p.grantId)
              if (
                p.issuer !== this.protocol.config.issuer ||
                p.audience !== this.protocol.config.resource ||
                p.subject !== grant.subject ||
                p.clientId !== grant.clientId ||
                p.expiresAt <= Date.now() ||
                !["tadazz.drafts.read", "tadazz.exports.read"].every(
                  (scope) =>
                    p.scopes.includes(scope) && grant.scopes.includes(scope),
                )
              )
                throw new ToolError("SCOPE_REQUIRED")
              return grant
            }
            let grant = authority()
            const prior = db
              .prepare(
                "SELECT digest,outcome FROM operations WHERE grant_id=? AND kind='export' AND request_key=?",
              )
              .get(p.grantId, mutation.idempotencyKey)
            if (prior) {
              if (prior.digest !== mutation.inputDigest)
                throw new ToolError("REQUEST_KEY_REUSED")
              if (typeof prior.outcome !== "string") throw unavailable()
              const receipt = this.checkedExport(
                JSON.parse(prior.outcome),
                p.accountId,
                p.grantId,
                mutation.idempotencyKey,
                policy,
              )
              if (
                receipt.data.draftId !== selected.draftId ||
                receipt.data.revision !== selected.expectedRevision ||
                receipt.data.format !== format
              )
                throw unavailable()
              this.exportRights(grant, receipt.draft, format, policy)
              authority()
              return receipt.data
            }
            const count = db
              .prepare("SELECT count(*) AS n FROM operations")
              .get()?.n
            if (typeof count !== "number" || count >= 5000)
              throw new ToolError("QUOTA_EXCEEDED")
            const row = db
              .prepare(
                "SELECT id,revision,authored,summary,locale FROM drafts WHERE owner=? AND id=?",
              )
              .get(p.accountId, selected.draftId)
            if (!row || typeof row.summary !== "string")
              throw new ToolError("NOT_FOUND")
            const draft = checkedDraft(
              {
                draftId: row.id,
                revision: row.revision,
                authoredShowJson: row.authored,
                summary: JSON.parse(row.summary),
                ...(row.locale === null ? {} : { locale: row.locale }),
              },
              { authoring: policy.authoring },
            )
            if (draft.revision !== selected.expectedRevision)
              throw new ToolError("REVISION_CONFLICT", {
                currentRevision: draft.revision,
              })
            this.exportRights(grant, draft, format, policy)
            const body = createExportBody(draft, format)
            const exportId = randomOpaque()
            const expiresAt = Math.min(
              Date.now() + 60_000,
              p.expiresAt,
              grant.expiresAt,
            )
            if (expiresAt <= Date.now()) throw new ToolError("SCOPE_REQUIRED")
            const sha256 = tokenDigest(body)
            const ticket = this.protocol.downloadTicket({
              accountId: p.accountId,
              grantId: p.grantId,
              requestKey: mutation.idempotencyKey,
              exportId,
              draftId: draft.draftId,
              revision: draft.revision,
              format,
              authoredSha256: tokenDigest(draft.authoredShowJson),
              sha256,
              expiresAt,
            })
            const issuer = new URL(this.protocol.config.issuer)
            const data = {
              exportId,
              draftId: draft.draftId,
              revision: draft.revision,
              format,
              downloadUrl: new URL(
                issuer.pathname.replace(/\/$/u, "") + "/downloads/" + ticket,
                issuer.origin,
              ).href,
              expiresAt: new Date(expiresAt).toISOString(),
              sha256,
              bytes: utf8Bytes(body),
            }
            const receipt = this.checkedExport(
              { version: 1, data, draft, body },
              p.accountId,
              p.grantId,
              mutation.idempotencyKey,
              policy,
            )
            grant = authority()
            this.exportRights(grant, draft, format, policy)
            db.prepare(
              "INSERT INTO operations(grant_id,kind,request_key,digest,outcome) VALUES(?,'export',?,?,?)",
            ).run(
              p.grantId,
              mutation.idempotencyKey,
              mutation.inputDigest,
              canonicalJson({ version: 1, data: receipt.data, draft, body }),
            )
            this.audit(db, p.grantId, "export-created", mutation)
            authority()
            return receipt.data
          })
        } catch (error) {
          if (error instanceof ToolError) throw error
          throw new ToolError(
            error instanceof OAuthError && error.code === "invalid_grant"
              ? "SCOPE_REQUIRED"
              : "EXPORT_UNAVAILABLE",
          )
        }
      },
    }
  }

  /** A short-lived encrypted capability identifies one immutable export outcome.
   * Every delivery still checks actual account/session/grant and current rights.
   */
  download(encoded: string, policy: FirstPartyExportPolicy) {
    const ticket = this.protocol.readDownloadTicket(encoded)
    let db: DatabaseSync | undefined
    try {
      db = this.open(ticket.accountId, false)
      if (!db) throw invalid()
      const grant = this.row(db, ticket.accountId, ticket.grantId)
      const row = db
        .prepare(
          "SELECT outcome FROM operations WHERE grant_id=? AND kind='export' AND request_key=?",
        )
        .get(ticket.grantId, ticket.requestKey)
      if (!row || typeof row.outcome !== "string") throw invalid()
      const receipt = this.checkedExport(
        JSON.parse(row.outcome),
        ticket.accountId,
        ticket.grantId,
        ticket.requestKey,
        policy,
      )
      if (
        receipt.data.downloadUrl !==
        new URL(
          new URL(this.protocol.config.issuer).pathname.replace(/\/$/u, "") +
            "/downloads/" +
            encoded,
          new URL(this.protocol.config.issuer).origin,
        ).href
      )
        throw invalid()
      this.exportRights(grant, receipt.draft, receipt.data.format, policy)
      this.row(db, ticket.accountId, ticket.grantId)
      this.protocol.readDownloadTicket(encoded)
      return { body: receipt.body, data: receipt.data }
    } finally {
      try {
        db?.close()
      } catch {
        throw unavailable()
      }
    }
  }

  drafts(
    policy: AuthoringPolicy,
    assertIssued: (p: VerifiedPrincipal) => void,
  ): DraftRepository & { semantic: SemanticDraftPort } {
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
    const write = (
      db: DatabaseSync,
      p: VerifiedPrincipal,
      change: { current: DraftRecord; next: NormalizedDraft },
    ): DraftRecord => {
      const { current, next } = change
      const result = checked({
        ...current,
        ...next,
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
          current.draftId,
          current.revision,
        )

      if (changed.changes !== 1) {
        throw new ToolError("REVISION_CONFLICT")
      }

      return result
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

          const preserved = normalizeStoredDraft(
            preserveSemanticState(
              current.authoredShowJson,
              normalized.authoredShowJson,
              policy,
            ),
            policy,
          )
          result = write(db, p, { current, next: preserved })
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
    const semantic = createSemanticDraftPort({
      authoring: policy,
      run: (p, scopes, callback) =>
        safe(() => {
          assertIssued(p)

          return this.transaction(p.accountId, false, (db) => {
            authority(db, p, scopes)
            const result = callback(db)
            authority(db, p, scopes)

            return result
          })
        }),
      read,
      write,
      audit: (db, p, entry) =>
        this.audit(db, p.grantId, entry.kind, entry.mutation),
    })
    return {
      semantic,
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
