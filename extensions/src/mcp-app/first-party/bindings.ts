import { resolve, isAbsolute, join } from "node:path"
import { lstatSync } from "node:fs"
import type { DatabaseSync } from "node:sqlite"
import type { Context, Next } from "hono"
import type { ApiEnv } from "@razzia/socket/api/factory"
import { z } from "zod"
import { ToolError } from "../server/errors.ts"
import { assertRequestActive } from "./ingress.ts"

export interface FirstPartySessionPrincipal {
  readonly kind: "first-party-session"
  readonly accountId: string
  readonly subject: string
  readonly sid: string
  readonly expiresAt: number
}
const claimsSchema = z.object({
  sub: z.uuid(),
  sid: z.uuid(),
  role: z.literal("manager"),
  exp: z
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER / 1000),
})
const unavailable = () => new ToolError("ACCOUNT_UNAVAILABLE")
const trustedBindings = new WeakSet<object>()

/** No actual auth module is imported until configuration is explicitly ready.
 * This module never creates a host OAuth principal or reads/prints a key at build.
 * Tests MUST set synthetic env/root before calling this function. */
export async function loadFirstPartyBindings(configRoot: string) {
  if (!isAbsolute(configRoot)) throw unavailable()
  const root = resolve(configRoot)
  const secret = process.env.JWT_SECRET
  const ready = () => {
    if (
      process.env.TADAZZ_ACCOUNTS_ENABLED !== "true" ||
      !secret ||
      secret.length < 32 ||
      process.env.JWT_SECRET !== secret ||
      !process.env.CONFIG_PATH ||
      resolve(process.env.CONFIG_PATH) !== root
    )
      throw unavailable()
  }
  ready()
  const [middleware, scope, accounts, database, environment] =
    await Promise.all([
      import("@razzia/socket/api/middleware"),
      import("@razzia/socket/services/account-scope"),
      import("@razzia/socket/services/account-auth"),
      import("@razzia/socket/services/account-db"),
      import("@razzia/socket/env"),
    ])
  ready()
  // Refuse an already-cached fallback or different auth module instance.
  if (environment.jwtSecret !== secret) throw unavailable()
  const issued = new WeakSet<object>()
  let liveDb: DatabaseSync | undefined
  const expectedFile = join(root, "tadazz-accounts.sqlite")
  const checkDatabase = (db: DatabaseSync) => {
    try {
      const main = db
        .prepare("PRAGMA database_list")
        .all()
        .find((row) => row.name === "main")
      if (
        !main ||
        typeof main.file !== "string" ||
        resolve(main.file) !== expectedFile
      )
        throw unavailable()
      // Closed prepared handles fail here BEFORE actual request verification can
      // invoke the upstream getter and initialize a replacement during GET.
      db.prepare("PRAGMA schema_version").get()
    } catch {
      throw unavailable()
    }
  }
  const configured = () => {
    ready()
    if (!scope.accountsEnabled()) throw unavailable()
  }
  const prepareRuntime = () => {
    configured()
    if (liveDb) {
      checkDatabase(liveDb)
      return
    }
    try {
      const file = lstatSync(expectedFile)
      if (!file.isFile() || file.isSymbolicLink() || file.nlink !== 1)
        throw unavailable()
    } catch {
      throw unavailable()
    }
    // Explicit startup only, after the real account service has bootstrapped.
    // Never initialize an absent account DB or call this from an HTTP handler.
    const db = database.getAccountDb()
    checkDatabase(db)
    liveDb = db
  }
  const assertActive = (p: FirstPartySessionPrincipal) => {
    configured()
    if (
      !issued.has(p) ||
      scope.activeAccount() !== p.accountId ||
      p.subject !== p.accountId ||
      p.expiresAt <= Date.now()
    )
      throw new ToolError("SCOPE_REQUIRED")
    if (!liveDb) throw unavailable()
    checkDatabase(liveDb)
    if (
      !accounts.isAccountSessionValid(p.accountId, p.sid) ||
      !accounts.activeAccount(p.accountId)
    )
      throw new ToolError("SCOPE_REQUIRED")
  }
  const bindings = Object.freeze({
    root,
    configured,
    prepareRuntime,
    async requireManager(c: Context<ApiEnv>, next: Next) {
      assertRequestActive(c.req.raw.signal)
      configured()
      if (!liveDb) throw unavailable()
      checkDatabase(liveDb)
      const response = await middleware.requireManager(c, async () => {
        // Actual middleware's async JWT/session verification has settled.
        assertRequestActive(c.req.raw.signal)
        await next()
        assertRequestActive(c.req.raw.signal)
      })
      assertRequestActive(c.req.raw.signal)
      return response
    },
    async principal(c: Context<ApiEnv>): Promise<FirstPartySessionPrincipal> {
      assertRequestActive(c.req.raw.signal)
      configured()
      if (!scope.activeAccount()) throw new ToolError("SCOPE_REQUIRED")
      if (!liveDb) throw unavailable()
      checkDatabase(liveDb)
      // Actual cryptographic/session verifier again after the HTTP await boundary;
      // caller-created Context claims alone cannot issue an authority capability.
      const raw = await middleware.readClaims(c)
      // Keep awaiting real auth work even after abort, then deny before issue.
      assertRequestActive(c.req.raw.signal)
      configured()
      const parsed = claimsSchema.safeParse(raw)
      if (!parsed.success) throw new ToolError("SCOPE_REQUIRED")
      const p = Object.freeze({
        kind: "first-party-session" as const,
        accountId: parsed.data.sub,
        subject: parsed.data.sub,
        sid: parsed.data.sid,
        expiresAt: parsed.data.exp * 1000,
      })
      issued.add(p)
      assertActive(p)
      return p
    },
    assertActive,
  })
  trustedBindings.add(bindings)
  return bindings
}
export type FirstPartyBindings = Awaited<
  ReturnType<typeof loadFirstPartyBindings>
>
export function assertFirstPartyBindings(value: FirstPartyBindings) {
  if (!trustedBindings.has(value)) throw unavailable()
}
