import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { quizExtrasV2Schema } from "@razzia/extensions/core"
import { createNativeCreationPort } from "../../src/server/storage/creation-reservation"
import {
  createFirstPartyOAuth,
  type FirstPartyOAuthOptions,
} from "../../src/mcp-app/first-party/oauth.ts"
import {
  fixture,
  origin,
  policy,
  key,
  createInput,
  type Session,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"

function isNativeSaveRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireNativeSaveRecord(value: unknown): Record<string, unknown> {
  if (!isNativeSaveRecord(value)) {
    throw new Error("Invalid synthetic native-save evidence record")
  }

  return value
}

function requireNativeSaveString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing synthetic native-save evidence text")
  }

  return value
}

function requireNativeSaveNumber(value: unknown): number {
  if (typeof value !== "number") {
    throw new Error("Invalid synthetic native-save evidence number")
  }

  return value
}

function requireNativeSavePresent<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing synthetic native-save evidence value")
  }

  return value
}

function isNativeSaveStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => typeof entry === "string")
  )
}

type NativeSaveIssuerObservation = Pick<
  FirstPartyOAuthOptions,
  | "config"
  | "clients"
  | "keyId"
  | "signingPrivateKeyPem"
  | "configRoot"
  | "consentPageUrl"
> &
  Record<string, unknown>

function isNativeSaveIssuerObservation(
  value: unknown,
): value is NativeSaveIssuerObservation {
  if (!isNativeSaveRecord(value) || !isNativeSaveRecord(value.config)) {
    return false
  }

  const issuerConfig = value.config

  return (
    typeof issuerConfig.issuer === "string" &&
    typeof issuerConfig.resource === "string" &&
    typeof issuerConfig.resourceMetadataUrl === "string" &&
    (issuerConfig.firstPartyOrigins === undefined ||
      isNativeSaveStringList(issuerConfig.firstPartyOrigins)) &&
    Array.isArray(value.clients) &&
    value.clients.every(
      (client: unknown) =>
        isNativeSaveRecord(client) &&
        typeof client.clientId === "string" &&
        isNativeSaveStringList(client.redirectUris) &&
        isNativeSaveStringList(client.scopes),
    ) &&
    typeof value.keyId === "string" &&
    typeof value.signingPrivateKeyPem === "string" &&
    typeof value.configRoot === "string" &&
    typeof value.consentPageUrl === "string"
  )
}

interface NativeSaveDescriptorObservation extends Record<string, unknown> {
  root: string
  nonce: string
  owner: string
  syntheticSecret: string
  grantId: string
  token: string
  encryptionKey: string
  checkpoint: string
  reply: string
  input: Record<string, unknown> & { idempotencyKey: string }
  options: NativeSaveIssuerObservation
}

function isNativeSaveDescriptor(
  value: unknown,
): value is NativeSaveDescriptorObservation {
  return (
    isNativeSaveRecord(value) &&
    [
      "root",
      "nonce",
      "owner",
      "syntheticSecret",
      "grantId",
      "token",
      "encryptionKey",
      "checkpoint",
      "reply",
    ].every((field) => typeof value[field] === "string") &&
    isNativeSaveRecord(value.input) &&
    typeof value.input.idempotencyKey === "string" &&
    isNativeSaveIssuerObservation(value.options)
  )
}

function requireNativeSaveDescriptor(
  value: unknown,
): NativeSaveDescriptorObservation {
  if (!isNativeSaveDescriptor(value)) {
    throw new Error("Invalid synthetic native-save child descriptor")
  }

  return value
}

type InitializedFValue = Awaited<ReturnType<typeof fixture>>
let f: InitializedFValue | undefined = undefined
function requireInitializedF(): InitializedFValue {
  if (f === undefined) {
    throw new Error("Fixture state f was read before initialization")
  }

  return f
}
type InitializedIssuerValue = Awaited<ReturnType<typeof createFirstPartyOAuth>>
let issuer: InitializedIssuerValue | undefined = undefined
function requireInitializedIssuer(): InitializedIssuerValue {
  if (issuer === undefined) {
    throw new Error("Fixture state issuer was read before initialization")
  }

  return issuer
}
type InitializedRemoteValue = ReturnType<
  Awaited<ReturnType<typeof createFirstPartyOAuth>>["remote"]
>
let remote: InitializedRemoteValue | undefined = undefined
function requireInitializedRemote(): InitializedRemoteValue {
  if (remote === undefined) {
    throw new Error("Fixture state remote was read before initialization")
  }

  return remote
}
type InitializedNativeValue = typeof import("@razzia/socket/services/config")
let native: InitializedNativeValue | undefined = undefined
function requireInitializedNative(): InitializedNativeValue {
  if (native === undefined) {
    throw new Error("Fixture state native was read before initialization")
  }

  return native
}
const clientId = "synthetic-native-save-client"
const callback = "https://host.example.invalid/native/callback"
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
  firstPartyOrigins: [origin],
}
const scopes = [
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
]
let requestId = 0
const refreshTokens = new Map<string, string>()
type InitializedOptionsValue = FirstPartyOAuthOptions
let options: InitializedOptionsValue | undefined = undefined
function requireInitializedOptions(): InitializedOptionsValue {
  if (options === undefined) {
    throw new Error("Fixture state options was read before initialization")
  }

  return options
}
const childMode = process.argv[2] === "native-child"
let fixtureNonce = ""
const ledgerFile = (root: string, owner: string) =>
  path.join(root, "tenants", owner, "extensions/mcp-oauth/grants.sqlite")
const nativeCount = () =>
  fs
    .readdirSync(
      path.join(
        requireInitializedF().root,
        "tenants",
        requireInitializedF().sessions[0].owner,
        "quizz",
      ),
    )
    .filter((name) => name.endsWith(".json")).length

if (!childMode) {
  before(async () => {
    assert.equal(
      process.platform,
      "linux",
      "Native physical acceptance requires Linux fences",
    )
    f = await fixture()
    fixtureNonce = randomBytes(24).toString("base64url")
    fs.writeFileSync(
      path.join(requireInitializedF().root, ".f-native-save-fixture.json"),
      JSON.stringify({
        version: 1,
        kind: "F-native-save-cross-seam",
        nonce: fixtureNonce,
      }),
      { mode: 0o600, flag: "wx" },
    )
    assert.equal(
      fs.statfsSync(requireInitializedF().root).type,
      0xef53,
      "Use the genuine persistent ext4 fixture",
    )
    console.log(
      JSON.stringify({
        runtime: process.version,
        platform: process.platform,
        filesystemMagic: fs.statfsSync(requireInitializedF().root).type,
      }),
    )
    for (const session of requireInitializedF().sessions) {
      fs.mkdirSync(
        path.join(
          requireInitializedF().root,
          "tenants",
          session.owner,
          "quizz",
        ),
        {
          recursive: true,
        },
      )
    }
    native = await requireInitializedF().scope.withAccount(
      requireInitializedF().sessions[0].owner,
      () => import("@razzia/socket/services/config"),
    )
    const port = createNativeCreationPort({
      configuredRoot: () => requireInitializedF().root,
      accountsEnabled: requireInitializedF().scope.accountsEnabled,
      activeOwner: requireInitializedF().scope.activeAccount,
      getPath: requireInitializedNative().getPath,
      prepare: requireInitializedNative().prepareNativeQuizCreation,
      enableOperationBindings: true,
    })
    assert.ok(port.operations)
    const pair = generateKeyPairSync("ed25519")
    options = {
      config,
      configRoot: requireInitializedF().root,
      keyId: "synthetic-native-save-key",
      signingPrivateKeyPem: pair.privateKey.export({
        type: "pkcs8",
        format: "pem",
      }),
      ticketEncryptionKey: randomBytes(32),
      consentPageUrl: `${origin}/studio/oauth-consent`,
      clients: [{ clientId, redirectUris: [callback], scopes }],
      nativeSave: {
        authoring: policy,
        operations: port.operations,
        consentPageUrl: `${origin}/studio/native-save-consent`,
      },
    }
    issuer = await createFirstPartyOAuth(requireInitializedOptions())
    remote = requireInitializedIssuer().remote({
      allowedOrigins: [],
      dependencies: {
        authoring: policy,
        drafts: requireInitializedIssuer().draftRepository(policy),
        storage: requireInitializedIssuer().storage,
        rateLimit: () => Promise.resolve(true),
      },
    })
  })
  after(async () => {
    await remote?.close()

    // Preserve the exact synthetic native/ledger family for independent readback.
    // No user or peer fixture is removed, and no global native root is initialized.
    if (f) {
      for (const prefix of [
        requireInitializedF().root,
        ...requireInitializedF().sessions.map((s) =>
          path.join(requireInitializedF().root, "tenants", s.owner),
        ),
      ]) {
        const expected =
          prefix === requireInitializedF().root
            ? "synthetic-global-do-not-touch"
            : "synthetic-native-do-not-touch"
        assert.equal(
          fs.readFileSync(
            path.join(prefix, "native-sentinels/quiz.json"),
            "utf8",
          ),
          `${JSON.stringify({ sentinel: expected })}\n`,
        )
      }
      assert.deepEqual(
        fs.readdirSync(
          path.join(
            requireInitializedF().root,
            "tenants",
            requireInitializedF().sessions[1].owner,
            "quizz",
          ),
        ),
        [],
      )
      assert.equal(
        fs.existsSync(path.join(requireInitializedF().root, "quizz")),
        false,
      )
    }

    f?.db.close()

    if (f) {
      console.log(
        JSON.stringify({
          retainedSyntheticRoot: requireInitializedF().root,
          globalNativeQuizzExists: fs.existsSync(
            path.join(requireInitializedF().root, "quizz"),
          ),
        }),
      )
    }
  })
}

function api({
  route,
  body,
  session,
  extra = {},
}: {
  route: string
  body?: Record<string, string>
  session?: Session
  extra?: Record<string, string>
}) {
  const json = route.includes("/inspect") || route.includes("/approve")

  return requireInitializedIssuer().fetch(
    new Request(origin + route, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: `Bearer ${session.token}` } : {}),
        ...(body
          ? {
              "content-type": json
                ? "application/json"
                : "application/x-www-form-urlencoded",
            }
          : {}),
        ...(json ? { origin } : {}),
        ...extra,
      },
      ...(body
        ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) }
        : {}),
    }),
  )
}
async function linked(session = requireInitializedF().sessions[0]) {
  const verifier = randomBytes(32).toString("base64url")
  const { createHash } = await import("node:crypto")
  const started = await api({
    route: `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callback,
      resource: config.resource,
      scope: scopes.join(" "),
      state: key(),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
  })
  assert.equal(started.status, 302)
  const ticket = requireNativeSavePresent(
    new URL(
      requireNativeSavePresent(started.headers.get("location")),
    ).searchParams.get("oauth_request"),
  )

  const inspected = requireNativeSaveRecord(
    await (
      await api({ route: "/oauth/inspect", body: { ticket }, session })
    ).json(),
  )

  const approved = requireNativeSaveRecord(
    await (
      await api({
        route: "/oauth/approve",
        body: {
          ticket,
          decision: "allow",
          proof: requireNativeSaveString(inspected.proof),
        },
        session,
      })
    ).json(),
  )

  assert.ok(requireNativeSaveString(approved.redirectUrl))
  const response = await api({
    route: "/oauth/token",
    body: {
      grant_type: "authorization_code",
      client_id: clientId,
      code: requireNativeSavePresent(
        new URL(requireNativeSaveString(approved.redirectUrl)).searchParams.get(
          "code",
        ),
      ),
      code_verifier: verifier,
      redirect_uri: callback,
      resource: config.resource,
    },
  })
  assert.equal(response.status, 200)
  const tokens = requireNativeSaveRecord(await response.json())

  refreshTokens.set(
    requireNativeSaveString(tokens.access_token),
    requireNativeSaveString(tokens.refresh_token),
  )

  return requireNativeSaveString(tokens.access_token)
}
async function rpc(token: string, name: string, args: unknown) {
  const response = await requireInitializedRemote().fetch(
    new Request(config.resource, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: (requestId += 1),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.text()

  return requireNativeSaveRecord(
    requireNativeSaveRecord(
      (response.headers.get("content-type")?.startsWith("text/event-stream")
        ? requireNativeSaveRecord(
            JSON.parse(
              requireNativeSavePresent(
                body
                  .split("\n")
                  .filter((line) => line.startsWith("data: "))
                  .at(-1),
              ).slice(6),
            ),
          )
        : requireNativeSaveRecord(JSON.parse(body))
      ).result,
    ).structuredContent,
  )
}
async function pending(token: string, title = "Synthetic exact native save") {
  const created = await rpc(token, "create_game_draft", createInput(title))
  assert.equal(created.ok, true, JSON.stringify(created))
  const input = {
    contractVersion: "0.1.0",
    draftId: requireNativeSaveString(
      requireNativeSaveRecord(created.data).draftId,
    ),
    expectedRevision: 1,
    intent: "createNew",
    idempotencyKey: key(),
  }
  const result = await rpc(token, "save_game", input)
  assert.equal(result.ok, false)
  assert.equal(
    requireNativeSaveRecord(result.error).code,
    "CONSENT_REQUIRED",
    JSON.stringify(result),
  )
  assert.equal(
    requireNativeSaveString(
      requireNativeSaveRecord(result.error).consentRequestId,
    ).length,
    54,
  )

  return {
    input,
    consentRequestId: requireNativeSaveString(
      requireNativeSaveRecord(result.error).consentRequestId,
    ),
    consentUrl: requireNativeSaveString(
      requireNativeSaveRecord(result.error).consentUrl,
    ),
  }
}

async function inspectAndApprove(
  prepared: Awaited<ReturnType<typeof pending>>,
  session = requireInitializedF().sessions[0],
) {
  const inspected = await api({
    route: "/oauth/native-save/inspect",
    body: { consentRequestId: prepared.consentRequestId },
    session,
  })
  assert.equal(inspected.status, 200, await inspected.clone().text())
  const { data } = requireNativeSaveRecord(await inspected.json())
  const approved = await api({
    route: "/oauth/native-save/approve",
    body: {
      consentRequestId: prepared.consentRequestId,
      decision: "allow",
      proof: requireNativeSaveString(requireNativeSaveRecord(data).proof),
    },
    session,
  })
  assert.equal(approved.status, 200, await approved.clone().text())

  return data
}
function writeDurable(file: string, value: unknown) {
  const fd = fs.openSync(file, "wx", 0o600)

  try {
    fs.writeFileSync(fd, JSON.stringify(value))
    fs.fsyncSync(fd)
  } finally {
    fs.closeSync(fd)
  }
}
function savedRow({
  root,
  owner,
  grantId,
  requestKey,
}: {
  root: string
  owner: string
  grantId: string
  requestKey: string
}) {
  const db = new DatabaseSync(ledgerFile(root, owner), { readOnly: true })

  try {
    return requireNativeSaveRecord(
      JSON.parse(
        requireNativeSaveString(
          requireNativeSavePresent(
            db
              .prepare(
                "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
              )
              .get(grantId, requestKey),
          ).outcome,
        ),
      ),
    )
  } finally {
    db.close()
  }
}
async function runChild() {
  const [, , , phase] = process.argv
  const [, , , , descriptorPath] = process.argv

  if (
    !["before-native", "after-native", "after-f-outcome", "replay"].includes(
      phase,
    )
  ) {
    throw new Error("Unknown synthetic child phase")
  }

  const d = requireNativeSaveDescriptor(
    JSON.parse(fs.readFileSync(descriptorPath, "utf8")),
  )

  if (
    path.dirname(d.root) !== "/home/david/tadazz-phase1-20261116" ||
    !/^tadazz-m3a-synthetic-[A-Za-z0-9]+$/.test(path.basename(d.root)) ||
    path.dirname(descriptorPath) !== d.root
  ) {
    throw new Error("Refusing foreign fixture")
  }

  const marker = requireNativeSaveRecord(
    JSON.parse(
      fs.readFileSync(path.join(d.root, ".f-native-save-fixture.json"), "utf8"),
    ),
  )

  if (marker.kind !== "F-native-save-cross-seam" || marker.nonce !== d.nonce) {
    throw new Error("Foreign marker")
  }

  process.env.CONFIG_PATH = d.root
  process.env.JWT_SECRET = d.syntheticSecret
  process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
  const scope = await import("@razzia/socket/services/account-scope")
  native = await scope.withAccount(
    d.owner,
    () => import("@razzia/socket/services/config"),
  )
  const port = createNativeCreationPort({
    configuredRoot: () => d.root,
    accountsEnabled: scope.accountsEnabled,
    activeOwner: scope.activeAccount,
    getPath: requireInitializedNative().getPath,
    prepare: requireInitializedNative().prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
  const { operations } = port
  assert.ok(operations)
  const checkpoint = (result?: unknown): never => {
    const record = savedRow({
      root: d.root,
      owner: d.owner,
      grantId: d.grantId,
      requestKey: d.input.idempotencyKey,
    })
    writeDurable(d.checkpoint, {
      phase,
      pid: process.pid,
      state: record.state,
      operationId: record.operationId,
      outcome: record.outcome,
      result,
    })
    process.kill(process.pid, "SIGKILL")
    throw new Error("SIGKILL did not stop the synthetic child")
  }

  if (phase === "after-f-outcome") {
    const original = Object.getOwnPropertyDescriptor(
      DatabaseSync.prototype,
      "exec",
    )?.value as ((this: DatabaseSync, sql: string) => void) | undefined
    assert.ok(typeof original === "function")
    DatabaseSync.prototype.exec = function exec(sql: string) {
      const result = original.call(this, sql)

      if (sql === "COMMIT") {
        const main = this.prepare("PRAGMA database_list")
          .all()
          .find((row) => row.name === "main")

        if (main?.file === ledgerFile(d.root, d.owner)) {
          const row = this.prepare(
            "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
          ).get(d.grantId, d.input.idempotencyKey)

          if (
            row &&
            requireNativeSaveRecord(
              JSON.parse(requireNativeSaveString(row.outcome)),
            ).state === "saved"
          ) {
            checkpoint()
          }
        }
      }

      return result
    }
  }

  const observed: typeof operations = {
    lookup: (binding) => operations.lookup(binding),
    create: (...args) => {
      if (phase === "before-native") {
        checkpoint()
      }

      const result = operations.create(...args)

      if (phase === "after-native") {
        checkpoint(result)
      }

      return result
    },
  }
  const { nativeSave: _native, ...rest } = d.options
  issuer = await createFirstPartyOAuth({
    ...rest,
    ticketEncryptionKey: Buffer.from(d.encryptionKey, "base64"),
    nativeSave: {
      authoring: policy,
      operations: observed,
      consentPageUrl: `${origin}/studio/native-save-consent`,
    },
  })
  remote = requireInitializedIssuer().remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: requireInitializedIssuer().draftRepository(policy),
      storage: requireInitializedIssuer().storage,
      rateLimit: () => Promise.resolve(true),
    },
  })
  const result = await rpc(d.token, "save_game", d.input)
  writeDurable(d.reply, { pid: process.pid, result })
  await requireInitializedRemote().close()
  const accountDb = await import("@razzia/socket/services/account-db")
  accountDb.closeAccountDb()
}

if (childMode) {
  await runChild()
} else {
  test("real F manager consent publishes through actual B bound native C1 and reopens the same native game", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const inspectedResponse = await api({
      route: "/oauth/native-save/inspect",
      body: { consentRequestId: prepared.consentRequestId },
      session: requireInitializedF().sessions[0],
    })
    assert.equal(
      inspectedResponse.status,
      200,
      await inspectedResponse.clone().text(),
    )
    const inspected = requireNativeSaveRecord(
      await inspectedResponse.json(),
    ).data
    assert.equal(requireNativeSaveRecord(inspected).state, "pending")
    assert.equal(
      requireNativeSaveRecord(inspected).accountId,
      requireInitializedF().sessions[0].owner,
    )
    assert.equal(
      requireNativeSaveRecord(
        JSON.parse(
          requireNativeSaveString(
            requireNativeSaveRecord(inspected).authoredShowJson,
          ),
        ),
      ).title,
      "Synthetic exact native save",
    )
    const approved = await api({
      route: "/oauth/native-save/approve",
      body: {
        consentRequestId: prepared.consentRequestId,
        decision: "allow",
        proof: requireNativeSaveString(
          requireNativeSaveRecord(inspected).proof,
        ),
      },
      session: requireInitializedF().sessions[0],
    })
    assert.equal(approved.status, 200, await approved.clone().text())
    assert.equal(
      requireNativeSaveRecord(
        requireNativeSaveRecord(await approved.json()).data,
      ).state,
      "approved",
    )
    const saved = await rpc(token, "save_game", prepared.input)
    assert.equal(saved.ok, true, JSON.stringify(saved))
    assert.match(
      requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId),
      /^[A-Za-z0-9_-]{21}$/,
    )
    assert.equal(
      requireNativeSaveRecord(saved.data).studioUrl,
      `${origin}/manager/quizz/${requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId)}`,
    )
    const actual = await requireInitializedF().as(
      requireInitializedF().sessions[0],
      () =>
        requireInitializedNative().getQuizzById(
          requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId),
        ),
    )
    assert.equal(
      actual.id,
      requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId),
    )
    assert.equal(actual.subject, "Synthetic exact native save")
    assert.equal(actual.questions.length, 5)
    const extras = quizExtrasV2Schema.parse(
      requireNativeSaveRecord(
        JSON.parse(
          fs.readFileSync(
            path.join(
              requireInitializedF().root,
              "tenants",
              requireInitializedF().sessions[0].owner,
              "extensions/quizzes",
              `${requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId)}.json`,
            ),
            "utf8",
          ),
        ),
      ),
    )
    assert.equal(
      requireNativeSaveString(extras.quizId),
      requireNativeSaveString(requireNativeSaveRecord(saved.data).quizId),
    )
    assert.equal(new Set(extras.questionIds).size, 5)
    const principal = await requireInitializedIssuer().verifyAccessToken(token)
    assert.deepEqual(
      extras.questionIds,
      requireNativeSaveRecord(
        requireNativeSaveRecord(
          JSON.parse(
            requireNativeSaveString(
              savedRow({
                root: requireInitializedF().root,
                owner: requireInitializedF().sessions[0].owner,
                grantId: principal.grantId,
                requestKey: prepared.input.idempotencyKey,
              }).nativeSnapshot,
            ),
          ),
        ).extras,
      ).questionIds,
    )
    assert.deepEqual(
      (await rpc(token, "save_game", prepared.input)).data,
      saved.data,
    )
    assert.equal(
      fs.existsSync(path.join(requireInitializedF().root, "quizz")),
      false,
    )
  })

  test("native consent rejects MCP tokens, another account/session, wrong Origin and copied proof", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const nativeCountBefore2 = nativeCount()
    const again = await rpc(token, "save_game", prepared.input)
    assert.equal(
      requireNativeSaveRecord(again.error).consentRequestId,
      prepared.consentRequestId,
    )
    assert.equal(
      requireNativeSaveRecord(
        (
          await rpc(token, "save_game", {
            ...prepared.input,
            expectedRevision: 2,
          })
        ).error,
      ).code,
      "REQUEST_KEY_REUSED",
    )
    assert.notEqual(
      (
        await api({
          route: "/oauth/native-save/inspect",
          body: { consentRequestId: prepared.consentRequestId },
          session: { ...requireInitializedF().sessions[0], token },
        })
      ).status,
      200,
    )
    assert.notEqual(
      (
        await api({
          route: "/oauth/native-save/inspect",
          body: { consentRequestId: prepared.consentRequestId },
          session: requireInitializedF().sessions[1],
        })
      ).status,
      200,
    )
    assert.notEqual(
      (
        await api({
          route: "/oauth/native-save/inspect",
          body: { consentRequestId: prepared.consentRequestId },
          session: requireInitializedF().sessions[0],
          extra: { origin: "https://foreign.invalid" },
        })
      ).status,
      200,
    )
    const inspected = requireNativeSaveRecord(
      await (
        await api({
          route: "/oauth/native-save/inspect",
          body: { consentRequestId: prepared.consentRequestId },
          session: requireInitializedF().sessions[0],
        })
      ).json(),
    ).data
    const newer = await requireInitializedF().tokens.mintToken(
      requireInitializedF().sessions[0].owner,
      "manager",
    )
    const claims = await requireInitializedF().tokens.verifyToken(newer.token)
    for (const [session, proof] of [
      [requireInitializedF().sessions[0], "0".repeat(64)],
      [
        {
          token: newer.token,
          owner: requireInitializedF().sessions[0].owner,
          sid: requireNativeSavePresent(claims.sid),
        },
        requireNativeSaveString(requireNativeSaveRecord(inspected).proof),
      ],
    ] as const) {
      assert.notEqual(
        (
          await api({
            route: "/oauth/native-save/approve",
            body: {
              consentRequestId: prepared.consentRequestId,
              decision: "allow",
              proof,
            },
            session,
          })
        ).status,
        200,
      )
    }
    assert.equal(nativeCount(), nativeCountBefore2)
  })

  test("draft edits after inspect or approval never silently upgrade the selected native snapshot", async () => {
    for (const approveFirst of [false, true]) {
      const token = await linked()
      const prepared = await pending(token, "Original approved snapshot")
      const inspected = requireNativeSaveRecord(
        await (
          await api({
            route: "/oauth/native-save/inspect",
            body: { consentRequestId: prepared.consentRequestId },
            session: requireInitializedF().sessions[0],
          })
        ).json(),
      ).data

      if (approveFirst) {
        assert.equal(
          (
            await api({
              route: "/oauth/native-save/approve",
              body: {
                consentRequestId: prepared.consentRequestId,
                decision: "allow",
                proof: requireNativeSaveString(
                  requireNativeSaveRecord(inspected).proof,
                ),
              },
              session: requireInitializedF().sessions[0],
            })
          ).status,
          200,
        )
      }

      const nativeCountBefore3 = nativeCount()
      assert.equal(
        (
          await rpc(token, "update_game_draft", {
            contractVersion: "0.1.0",
            draftId: prepared.input.draftId,
            expectedRevision: 1,
            authoredShowJson: requireNativeSaveString(
              createInput("Changed after inspection").authoredShowJson,
            ),
            idempotencyKey: key(),
          })
        ).ok,
        true,
      )

      if (approveFirst) {
        assert.equal(
          requireNativeSaveRecord(
            (await rpc(token, "save_game", prepared.input)).error,
          ).code,
          "REVISION_CONFLICT",
        )
      } else {
        const response = await api({
          route: "/oauth/native-save/approve",
          body: {
            consentRequestId: prepared.consentRequestId,
            decision: "allow",
            proof: requireNativeSaveString(
              requireNativeSaveRecord(inspected).proof,
            ),
          },
          session: requireInitializedF().sessions[0],
        })
        assert.equal(response.status, 409)
        assert.equal(
          requireNativeSaveRecord(
            requireNativeSaveRecord(await response.json()).error,
          ).code,
          "REVISION_CONFLICT",
        )
      }

      assert.equal(nativeCount(), nativeCountBefore3)
    }
  })

  test("revoking the approving native session denies a new physical save", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const minted = await requireInitializedF().tokens.mintToken(
      requireInitializedF().sessions[0].owner,
      "manager",
    )
    const claims = await requireInitializedF().tokens.verifyToken(minted.token)
    const session = {
      token: minted.token,
      owner: requireInitializedF().sessions[0].owner,
      sid: requireNativeSavePresent(claims.sid),
    }
    await inspectAndApprove(prepared, session)
    const nativeCountBefore4 = nativeCount()
    requireInitializedF().accounts.revokeAccountSession(session.sid)
    assert.equal(
      requireNativeSaveRecord(
        (await rpc(token, "save_game", prepared.input)).error,
      ).code,
      "CONSENT_REQUIRED",
    )
    assert.equal(
      requireNativeSaveRecord(
        requireNativeSaveRecord(
          await (
            await api({
              route: "/oauth/native-save/inspect",
              body: { consentRequestId: prepared.consentRequestId },
              session: requireInitializedF().sessions[0],
            })
          ).json(),
        ).data,
      ).state,
      "expired",
    )
    assert.equal(nativeCount(), nativeCountBefore4)
  })

  test("default-off, disabled account scope and revoked OAuth grant cannot publish a native game", async () => {
    const { nativeSave: _save, ...disabledOptions } =
      requireInitializedOptions()
    const disabledIssuer = await createFirstPartyOAuth(disabledOptions)
    assert.equal(disabledIssuer.storage, undefined)
    const noRoute = await disabledIssuer.fetch(
      new Request(`${origin}/oauth/native-save/inspect`, {
        method: "POST",
        headers: {
          host: new URL(origin).host,
          origin,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    )
    assert.equal(noRoute.status, 404)
    const token = await linked()
    const prepared = await pending(token)
    await inspectAndApprove(prepared)
    const nativeCountBefore5 = nativeCount()
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"

    try {
      await assert.rejects(requireInitializedIssuer().verifyAccessToken(token))
    } finally {
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    }

    assert.equal(nativeCount(), nativeCountBefore5)
    assert.equal(
      (
        await api({
          route: "/oauth/revoke",
          body: {
            client_id: clientId,
            token: requireNativeSavePresent(refreshTokens.get(token)),
          },
        })
      ).status,
      200,
    )
    await assert.rejects(requireInitializedIssuer().verifyAccessToken(token))
    assert.notEqual(
      (
        await api({
          route: "/oauth/native-save/approve",
          body: {
            consentRequestId: prepared.consentRequestId,
            decision: "allow",
            proof: "0".repeat(64),
          },
          session: requireInitializedF().sessions[0],
        })
      ).status,
      200,
    )
    assert.equal(nativeCount(), nativeCountBefore5)
  })

  test("simultaneous same-key saves return one actual native result and reject altered stored intent", async () => {
    const token = await linked()
    const prepared = await pending(token)
    await inspectAndApprove(prepared)
    const nativeCountBefore6 = nativeCount()
    const replies = await Promise.all([
      rpc(token, "save_game", prepared.input),
      rpc(token, "save_game", prepared.input),
    ])
    assert.equal(replies[0].ok, true, JSON.stringify(replies[0]))
    assert.deepEqual(replies[1].data, replies[0].data)
    assert.equal(nativeCount(), nativeCountBefore6 + 1)
    const other = await pending(token, "Immutable pending body")
    const principal = await requireInitializedIssuer().verifyAccessToken(token)
    const db = new DatabaseSync(
      ledgerFile(
        requireInitializedF().root,
        requireInitializedF().sessions[0].owner,
      ),
    )
    const query =
      "UPDATE operations SET outcome=? WHERE grant_id=? AND kind='save' AND request_key=?"
    const row = requireNativeSavePresent(
      db
        .prepare(
          "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
        )
        .get(principal.grantId, other.input.idempotencyKey),
    )

    const changed = requireNativeSaveRecord(
      JSON.parse(requireNativeSaveString(row.outcome)),
    )
    changed.expiresAt = requireNativeSaveNumber(changed.expiresAt) + 300000
    db.prepare(query).run(
      JSON.stringify(changed),
      principal.grantId,
      other.input.idempotencyKey,
    )
    db.close()
    const nativeCountAfter2 = nativeCount()
    assert.equal(
      requireNativeSaveRecord(
        (await rpc(token, "save_game", other.input)).error,
      ).code,
      "DEPENDENCY_UNAVAILABLE",
    )
    assert.equal(nativeCount(), nativeCountAfter2)
  })

  ;(["before-native", "after-native", "after-f-outcome"] as const).forEach(
    (phase) => {
      test(`fresh real F/C1 retry after genuine SIGKILL ${phase} retains one operation and target`, async () => {
        const token = await linked()
        const prepared = await pending(token, `Crash snapshot ${phase}`)
        await inspectAndApprove(prepared)
        const principal =
          await requireInitializedIssuer().verifyAccessToken(token)
        const nativeCountBefore7 = nativeCount()
        const name = `actor-${phase}-${key()}`
        const descriptor = path.join(requireInitializedF().root, `${name}.json`)
        const checkpoint = path.join(
          requireInitializedF().root,
          `${name}.checkpoint.json`,
        )
        const reply = path.join(
          requireInitializedF().root,
          `${name}.reply.json`,
        )
        const { nativeSave: _native, ...publicOptions } =
          requireInitializedOptions()
        writeDurable(descriptor, {
          root: requireInitializedF().root,
          nonce: fixtureNonce,
          owner: requireInitializedF().sessions[0].owner,
          syntheticSecret: requireInitializedF().syntheticSecret,
          grantId: principal.grantId,
          token,
          input: prepared.input,
          options: publicOptions,
          encryptionKey: Buffer.from(
            requireInitializedOptions().ticketEncryptionKey,
          ).toString("base64"),
          checkpoint,
          reply,
        })
        const bundle = fileURLToPath(import.meta.url)
        const lost = spawnSync(
          process.execPath,
          [bundle, "native-child", phase, descriptor],
          { encoding: "utf8", timeout: 20000 },
        )
        assert.equal(lost.signal, "SIGKILL", lost.stdout + lost.stderr)
        assert.equal(fs.existsSync(reply), false)
        const observed = requireNativeSaveRecord(
          JSON.parse(fs.readFileSync(checkpoint, "utf8")),
        )
        assert.equal(observed.phase, phase)
        assert.equal(
          observed.state,
          phase === "after-f-outcome" ? "saved" : "publishing",
        )

        if (phase === "after-native") {
          assert.equal(
            (
              await rpc(token, "update_game_draft", {
                contractVersion: "0.1.0",
                draftId: prepared.input.draftId,
                expectedRevision: 1,
                authoredShowJson: requireNativeSaveString(
                  createInput("Later current draft").authoredShowJson,
                ),
                idempotencyKey: key(),
              })
            ).ok,
            true,
          )
        }

        const replay = spawnSync(
          process.execPath,
          [bundle, "native-child", "replay", descriptor],
          { encoding: "utf8", timeout: 20000 },
        )
        assert.equal(replay.status, 0, replay.stdout + replay.stderr)
        const completed = requireNativeSaveRecord(
          JSON.parse(fs.readFileSync(reply, "utf8")),
        )

        assert.equal(
          requireNativeSaveRecord(completed.result).ok,
          true,
          JSON.stringify(completed),
        )
        assert.equal(nativeCount(), nativeCountBefore7 + 1)

        if (observed.result) {
          assert.equal(
            requireNativeSaveString(
              requireNativeSaveRecord(
                requireNativeSaveRecord(completed.result).data,
              ).quizId,
            ),
            requireNativeSaveString(
              requireNativeSaveRecord(observed.result).quizId,
            ),
          )
        }

        if (observed.outcome) {
          assert.deepEqual(
            requireNativeSaveRecord(completed.result).data,
            observed.outcome,
          )
        }

        const loaded = await requireInitializedF().as(
          requireInitializedF().sessions[0],
          () =>
            requireInitializedNative().getQuizzById(
              requireNativeSaveString(
                requireNativeSaveRecord(
                  requireNativeSaveRecord(completed.result).data,
                ).quizId,
              ),
            ),
        )
        assert.equal(loaded.subject, `Crash snapshot ${phase}`)

        if (phase === "after-f-outcome") {
          await requireInitializedF().as(
            requireInitializedF().sessions[0],
            () =>
              requireInitializedNative().deleteQuizz(
                requireNativeSaveString(
                  requireNativeSaveRecord(
                    requireNativeSaveRecord(completed.result).data,
                  ).quizId,
                ),
              ),
          )
          fs.unlinkSync(
            path.join(
              requireInitializedF().root,
              "tenants",
              requireInitializedF().sessions[0].owner,
              "extensions/quizzes",
              `${requireNativeSaveString(requireNativeSaveRecord(requireNativeSaveRecord(completed.result).data).quizId)}.json`,
            ),
          )
          const afterDelete = nativeCount()
          assert.deepEqual(
            (await rpc(token, "save_game", prepared.input)).data,
            requireNativeSaveRecord(completed.result).data,
          )
          assert.equal(nativeCount(), afterDelete)
        }

        writeDurable(
          path.join(requireInitializedF().root, `${name}.verified.json`),
          {
            phase,
            killedPid: observed.pid,
            signal: lost.signal,
            replayPid: completed.pid,
            replayExit: replay.status,
            result: requireNativeSaveRecord(completed.result).data,
            nativeCountBefore: nativeCountBefore7,
            nativeCountAfter: nativeCount(),
            finalState: savedRow({
              root: requireInitializedF().root,
              owner: requireInitializedF().sessions[0].owner,
              grantId: principal.grantId,
              requestKey: prepared.input.idempotencyKey,
            }).state,
          },
        )
      })
    },
  )

  test("an uncertain private ledger journal is preserved and cannot authorize another native save", async () => {
    const token = await linked()
    const prepared = await pending(token)
    await inspectAndApprove(prepared)
    const file = ledgerFile(
      requireInitializedF().root,
      requireInitializedF().sessions[0].owner,
    )
    const journal = `${file}-journal`
    const bytes = fs.readFileSync(file)
    const marker = "synthetic-unresolved-native-save-journal"
    fs.writeFileSync(journal, marker, { flag: "wx", mode: 0o600 })
    const nativeCountBefore8 = nativeCount()
    const response = await requireInitializedRemote().fetch(
      new Request(config.resource, {
        method: "POST",
        headers: {
          host: new URL(origin).host,
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: (requestId += 1),
          method: "tools/call",
          params: { name: "save_game", arguments: prepared.input },
        }),
      }),
    )
    assert.notEqual(response.status, 200)
    assert.equal(fs.readFileSync(journal, "utf8"), marker)
    assert.deepEqual(fs.readFileSync(file), bytes)
    assert.equal(nativeCount(), nativeCountBefore8)
  })
}
