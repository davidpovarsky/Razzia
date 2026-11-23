import { randomBytes, randomUUID, createHash } from "node:crypto"
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  lstatSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { basename, join, resolve, sep } from "node:path"
import { Hono } from "hono"
import type { ApiEnv } from "@razzia/socket/api/factory"
import {
  type FirstPartySessionPrincipal,
  loadFirstPartyBindings,
} from "../../first-party/bindings.ts"
import { createFirstPartyApp } from "../../first-party/http.ts"
import { FirstPartyDraftStore } from "../../first-party/store.ts"

export const origin = "https://studio.example.invalid"

export const policy = { allowedPublicAssetUrls: new Set<string>() }

export const key = () => randomBytes(18).toString("base64url")

export const show = (title = "Synthetic first-party draft") => ({
  format: "tada-show",
  version: 1,
  title,
  cards: [1, 2, 3, 4, 5].map((n) => ({
    key: `q${n}`,
    kind: "quiz",
    question: `Question ${n}`,
    timeSeconds: 20,
    answers: [{ text: "A" }, { text: "B" }],
    correctAnswers: [1],
  })),
  settings: [],
})

export const createInput = (title?: string) => ({
  contractVersion: "0.1.0" as const,
  authoredShowJson: JSON.stringify(show(title)),
  idempotencyKey: key(),
  locale: "en" as const,
})

export interface Session {
  token: string
  owner: string
  sid: string
}

let initialized = false

/**
 * Synthetic configuration is set BEFORE the first dynamic actual env/auth/DB
 * import. One fixture per Node test-file process; never use a real CONFIG_PATH.
 */

export async function fixture() {
  if (initialized) {
    throw new Error("Fixture requires a fresh test-file process")
  }

  initialized = true
  const root = mkdtempSync(join(tmpdir(), "tadazz-m3a-synthetic-"))
  const previous = {
    JWT_SECRET: process.env.JWT_SECRET,
    CONFIG_PATH: process.env.CONFIG_PATH,
    TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
  }
  const syntheticSecret =
    "synthetic-first-party-fixture-key-no-provider-credentials"
  process.env.JWT_SECRET = syntheticSecret
  process.env.CONFIG_PATH = root
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const database = await import("@razzia/socket/services/account-db")
  const accounts = await import("@razzia/socket/services/account-auth")
  const tokens = await import("@razzia/socket/services/auth")
  const scope = await import("@razzia/socket/services/account-scope")
  const db = database.getAccountDb()
  const owners = [randomUUID(), randomUUID()]
  const sessions: Session[] = []
  for (const [i, owner] of owners.entries()) {
    db.prepare(
      "INSERT INTO accounts(id,email,salt,hash,verified_at,created_at) VALUES(?,?,?,?,?,?)",
    ).run(
      owner,
      `synthetic-${i}@example.invalid`,
      "fixture-unused",
      "fixture-unused",
      Date.now(),
      Date.now(),
    )
    // oxlint-disable-next-line no-await-in-loop -- Keep owner order stable and mint this owner's session before verifying it.
    const result = await tokens.mintToken(owner, "manager")
    // oxlint-disable-next-line no-await-in-loop -- Verify the newly minted session before appending it and moving to the next owner.
    const claims = await tokens.verifyToken(result.token)

    if (!claims.sid) {
      throw new Error("Actual manager mint did not create sid")
    }

    sessions.push({ token: result.token, owner, sid: claims.sid })
    mkdirSync(join(root, "tenants", owner, "native-sentinels"), {
      recursive: true,
    })
    writeFileSync(
      join(root, "tenants", owner, "native-sentinels", "quiz.json"),
      '{"sentinel":"synthetic-native-do-not-touch"}\n',
    )
  }
  mkdirSync(join(root, "native-sentinels"))
  writeFileSync(
    join(root, "native-sentinels", "quiz.json"),
    '{"sentinel":"synthetic-global-do-not-touch"}\n',
  )
  const auth = await loadFirstPartyBindings(root)
  auth.prepareRuntime()
  const store = () => new FirstPartyDraftStore(auth, policy)
  async function as<T>(
    session: Session,
    operation: (p: FirstPartySessionPrincipal) => T | Promise<T>,
  ): Promise<T> {
    const app = new Hono<ApiEnv>()
    let value: T | undefined = undefined

    let error: unknown = undefined

    const admission = { called: false }
    app.use("*", auth.requireManager)
    app.get("/", async (c) => {
      try {
        const p = await auth.principal(c)
        value = await operation(p)
        admission.called = true

        return c.body(null, 204)
      } catch (caught) {
        error = caught

        return c.body(null, 500)
      }
    })
    const response = await app.request("https://fixture.example.invalid/", {
      headers: { authorization: `Bearer ${session.token}` },
    })

    if (error) {
      // oxlint-disable-next-line typescript/only-throw-error -- Preserve the exact operation failure captured by the request; wrapping would change assertion identity.
      throw error
    }

    if (!admission.called || response.status !== 204) {
      throw new Error("Actual fixture manager authorization rejected")
    }

    return value as T
  }
  const app = await createFirstPartyApp({
    origin,
    configRoot: root,
    authoring: policy,
  })
  function request({
    session,
    path,
    method = "GET",
    body,
    headers = {},
  }: {
    session: Session | undefined
    path: string
    method?: string
    body?: unknown
    headers?: Record<string, string>
  }) {
    return app.fetch(
      new Request(origin + path, {
        method,
        headers: {
          host: new URL(origin).host,
          ...(session ? { authorization: `Bearer ${session.token}` } : {}),
          ...(method === "GET"
            ? {}
            : { origin, "content-type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
  }
  const file = (owner: string) =>
    join(
      root,
      "tenants",
      owner,
      "extensions",
      "mcp-first-party",
      "drafts.sqlite",
    )

  return {
    root,
    auth,
    store,
    as,
    app,
    request,
    sessions: sessions as [Session, Session],
    file,
    db,
    tokens,
    scope,
    accounts,
    syntheticSecret,
    close() {
      database.closeAccountDb()
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) {
          if (!Reflect.deleteProperty(process.env, name)) {
            throw new TypeError(
              "Unable to restore an absent environment variable",
            )
          }
        } else {
          process.env[name] = value
        }
      }
      const absolute = resolve(root)

      if (
        !absolute.startsWith(resolve(tmpdir()) + sep) ||
        !basename(absolute).startsWith("tadazz-m3a-synthetic-")
      ) {
        throw new Error("Refusing fixture cleanup outside temporary root")
      }

      rmSync(absolute, { recursive: true, force: true })
    },
  }
}

/**
 * Snapshot private draft families and native sentinels; excludes the actual
 * account/session verifier's own WAL DB. Reads may affect OS access times.
 * Runner syscall tracing must independently check private-family write syscalls.
 */

export function snapshot(root: string) {
  const records: Record<
    string,
    { kind: string; mode: number; mtime: string; sha256?: string }
  > = {}
  function walk(path: string, relative: string) {
    const stat = lstatSync(path, { bigint: true })
    const getObservedKind = () => {
      if (stat.isDirectory()) {
        return "directory"
      }

      if (stat.isFile()) {
        return "file"
      }

      return "other"
    }

    records[relative] = {
      kind: getObservedKind(),
      mode: Number(stat.mode),
      mtime: String(stat.mtimeNs),
      ...(stat.isFile()
        ? {
            sha256: createHash("sha256")
              .update(readFileSync(path))
              .digest("hex"),
          }
        : {}),
    }

    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        walk(join(path, name), `${relative}/${name}`)
      }
    }
  }
  for (const name of ["tenants", "native-sentinels"]) {
    walk(join(root, name), name)
  }

  return records
}

function isObservedRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function requireObservedRecord(value: unknown): Record<string, unknown> {
  if (!isObservedRecord(value)) {
    throw new Error("Expected an object in the observed JSON response")
  }

  return value
}

export function requireObservedString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Expected a string in the observed JSON response")
  }

  return value
}
