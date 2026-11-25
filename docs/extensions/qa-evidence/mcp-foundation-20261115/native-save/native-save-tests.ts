import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { DatabaseSync } from "node:sqlite"
import { quizExtrasV2Schema } from "@razzia/extensions/core"
import { createNativeCreationPort } from "@tadazz/native-c1-source"
import {
  createFirstPartyOAuth,
  type FirstPartyOAuthOptions,
} from "../../../../../extensions/src/mcp-app/first-party/oauth.ts"
import {
  fixture,
  origin,
  policy,
  key,
  createInput,
  type Session,
} from "../../../../../extensions/src/mcp-app/tests/first-party/fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let remote: ReturnType<
  Awaited<ReturnType<typeof createFirstPartyOAuth>>["remote"]
>
let native: typeof import("@razzia/socket/services/config")
const clientId = "synthetic-native-save-client"
const callback = "https://host.example.invalid/native/callback"
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
  firstPartyOrigins: [origin],
}
const scopes = [
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
]
let requestId = 0
const refreshTokens = new Map<string, string>()
let options: FirstPartyOAuthOptions
const childMode = process.argv[2] === "native-child"
let fixtureNonce = ""
const ledgerFile = (root: string, owner: string) =>
  path.join(root, "tenants", owner, "extensions/mcp-oauth/grants.sqlite")
const nativeCount = () =>
  fs
    .readdirSync(path.join(f.root, "tenants", f.sessions[0].owner, "quizz"))
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
      path.join(f.root, ".f-native-save-fixture.json"),
      JSON.stringify({
        version: 1,
        kind: "F-native-save-cross-seam",
        nonce: fixtureNonce,
      }),
      { mode: 0o600, flag: "wx" },
    )
    assert.equal(
      fs.statfsSync(f.root).type,
      0xef53,
      "Use the genuine persistent ext4 fixture",
    )
    console.log(
      JSON.stringify({
        runtime: process.version,
        platform: process.platform,
        filesystemMagic: fs.statfsSync(f.root).type,
      }),
    )
    for (const session of f.sessions) {
      fs.mkdirSync(path.join(f.root, "tenants", session.owner, "quizz"), {
        recursive: true,
      })
    }
    native = await f.scope.withAccount(
      f.sessions[0].owner,
      () => import("@razzia/socket/services/config"),
    )
    const port = createNativeCreationPort({
      configuredRoot: () => f.root,
      accountsEnabled: f.scope.accountsEnabled,
      activeOwner: f.scope.activeAccount,
      getPath: native.getPath,
      prepare: native.prepareNativeQuizCreation,
      enableOperationBindings: true,
    })
    assert.ok(port.operations)
    const pair = generateKeyPairSync("ed25519")
    options = {
      config,
      configRoot: f.root,
      keyId: "synthetic-native-save-key",
      signingPrivateKeyPem: pair.privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString(),
      ticketEncryptionKey: randomBytes(32),
      consentPageUrl: origin + "/studio/oauth-consent",
      clients: [{ clientId, redirectUris: [callback], scopes }],
      nativeSave: {
        authoring: policy,
        operations: port.operations,
        consentPageUrl: origin + "/studio/native-save-consent",
      },
    }
    issuer = await createFirstPartyOAuth(options)
    remote = issuer.remote({
      allowedOrigins: [],
      dependencies: {
        authoring: policy,
        drafts: issuer.draftRepository(policy),
        storage: issuer.storage,
        rateLimit: async () => true,
      },
    })
  })
  after(async () => {
    await remote?.close()
    // Preserve the exact synthetic native/ledger family for independent readback.
    // No user or peer fixture is removed, and no global native root is initialized.
    if (f) {
      for (const prefix of [
        f.root,
        ...f.sessions.map((s) => path.join(f.root, "tenants", s.owner)),
      ]) {
        const expected =
          prefix === f.root
            ? "synthetic-global-do-not-touch"
            : "synthetic-native-do-not-touch"
        assert.equal(
          fs.readFileSync(
            path.join(prefix, "native-sentinels/quiz.json"),
            "utf8",
          ),
          JSON.stringify({ sentinel: expected }) + "\n",
        )
      }
      assert.deepEqual(
        fs.readdirSync(
          path.join(f.root, "tenants", f.sessions[1].owner, "quizz"),
        ),
        [],
      )
      assert.equal(fs.existsSync(path.join(f.root, "quizz")), false)
    }
    f?.db.close()
    if (f)
      console.log(
        JSON.stringify({
          retainedSyntheticRoot: f.root,
          globalNativeQuizzExists: fs.existsSync(path.join(f.root, "quizz")),
        }),
      )
  })
}
function api(
  route: string,
  body?: Record<string, string>,
  session?: Session,
  extra: Record<string, string> = {},
) {
  const json = route.includes("/inspect") || route.includes("/approve")
  return issuer.fetch(
    new Request(origin + route, {
      method: body ? "POST" : "GET",
      headers: {
        host: new URL(origin).host,
        ...(session ? { authorization: "Bearer " + session.token } : {}),
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
async function linked(session = f.sessions[0]) {
  const verifier = randomBytes(32).toString("base64url")
  const { createHash } = await import("node:crypto")
  const started = await api(
    "/oauth/authorize?" +
      new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: callback,
        resource: config.resource,
        scope: scopes.join(" "),
        state: key(),
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      }),
  )
  assert.equal(started.status, 302)
  const ticket = new URL(started.headers.get("location")!).searchParams.get(
    "oauth_request",
  )!
  const inspected = await (
    await api("/oauth/inspect", { ticket }, session)
  ).json()
  const approved = await (
    await api(
      "/oauth/approve",
      { ticket, decision: "allow", proof: inspected.proof },
      session,
    )
  ).json()
  assert.ok(approved.redirectUrl)
  const response = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    code: new URL(approved.redirectUrl).searchParams.get("code")!,
    code_verifier: verifier,
    redirect_uri: callback,
    resource: config.resource,
  })
  assert.equal(response.status, 200)
  const tokens = await response.json()
  refreshTokens.set(tokens.access_token, tokens.refresh_token)
  return tokens.access_token as string
}
async function rpc(token: string, name: string, args: unknown) {
  const response = await remote.fetch(
    new Request(config.resource, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        authorization: "Bearer " + token,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++requestId,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.text()
  return (
    response.headers.get("content-type")?.startsWith("text/event-stream")
      ? JSON.parse(
          body
            .split("\n")
            .filter((line) => line.startsWith("data: "))
            .at(-1)!
            .slice(6),
        )
      : JSON.parse(body)
  ).result.structuredContent
}
async function pending(token: string, title = "Synthetic exact native save") {
  const created = await rpc(token, "create_game_draft", createInput(title))
  assert.equal(created.ok, true, JSON.stringify(created))
  const input = {
    contractVersion: "0.1.0",
    draftId: created.data.draftId,
    expectedRevision: 1,
    intent: "createNew",
    idempotencyKey: key(),
  }
  const result = await rpc(token, "save_game", input)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, "CONSENT_REQUIRED", JSON.stringify(result))
  assert.equal(result.error.consentRequestId.length, 54)
  return {
    input,
    consentRequestId: result.error.consentRequestId as string,
    consentUrl: result.error.consentUrl as string,
  }
}

async function inspectAndApprove(
  prepared: Awaited<ReturnType<typeof pending>>,
  session = f.sessions[0],
) {
  const inspected = await api(
    "/oauth/native-save/inspect",
    { consentRequestId: prepared.consentRequestId },
    session,
  )
  assert.equal(inspected.status, 200, await inspected.clone().text())
  const data = (await inspected.json()).data
  const approved = await api(
    "/oauth/native-save/approve",
    {
      consentRequestId: prepared.consentRequestId,
      decision: "allow",
      proof: data.proof,
    },
    session,
  )
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
function savedRow(
  root: string,
  owner: string,
  grantId: string,
  requestKey: string,
) {
  const db = new DatabaseSync(ledgerFile(root, owner), { readOnly: true })
  try {
    return JSON.parse(
      db
        .prepare(
          "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
        )
        .get(grantId, requestKey)!.outcome as string,
    )
  } finally {
    db.close()
  }
}
async function runChild() {
  const phase = process.argv[3]
  const descriptorPath = process.argv[4]
  if (
    !["before-native", "after-native", "after-f-outcome", "replay"].includes(
      phase,
    )
  )
    throw new Error("Unknown synthetic child phase")
  const d = JSON.parse(fs.readFileSync(descriptorPath, "utf8"))
  if (
    path.dirname(d.root) !==
      "/home/david/tadazz-f-native-save-evidence-20261115" ||
    !/^tadazz-m3a-synthetic-[A-Za-z0-9]+$/.test(path.basename(d.root)) ||
    path.dirname(descriptorPath) !== d.root
  )
    throw new Error("Refusing foreign fixture")
  const marker = JSON.parse(
    fs.readFileSync(path.join(d.root, ".f-native-save-fixture.json"), "utf8"),
  )
  if (marker.kind !== "F-native-save-cross-seam" || marker.nonce !== d.nonce)
    throw new Error("Foreign marker")
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
    getPath: native.getPath,
    prepare: native.prepareNativeQuizCreation,
    enableOperationBindings: true,
  })
  const operations = port.operations
  assert.ok(operations)
  const checkpoint = (result?: unknown): never => {
    const record = savedRow(d.root, d.owner, d.grantId, d.input.idempotencyKey)
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
    const original = DatabaseSync.prototype.exec
    DatabaseSync.prototype.exec = function (sql: string) {
      const result = original.call(this, sql)
      if (sql === "COMMIT") {
        const main = this.prepare("PRAGMA database_list")
          .all()
          .find((row) => row.name === "main")
        if (main?.file === ledgerFile(d.root, d.owner)) {
          const row = this.prepare(
            "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
          ).get(d.grantId, d.input.idempotencyKey)
          if (row && JSON.parse(row.outcome as string).state === "saved")
            checkpoint()
        }
      }
      return result
    }
  }
  const observed: typeof operations = {
    lookup: (binding) => operations.lookup(binding),
    create: (...args) => {
      if (phase === "before-native") checkpoint()
      const result = operations.create(...args)
      if (phase === "after-native") checkpoint(result)
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
      consentPageUrl: origin + "/studio/native-save-consent",
    },
  })
  remote = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: issuer.draftRepository(policy),
      storage: issuer.storage,
      rateLimit: async () => true,
    },
  })
  const result = await rpc(d.token, "save_game", d.input)
  writeDurable(d.reply, { pid: process.pid, result })
  await remote.close()
  const accountDb = await import("@razzia/socket/services/account-db")
  accountDb.closeAccountDb()
}
if (childMode) await runChild()
else {
  test("real F manager consent publishes through actual B bound native C1 and reopens the same native game", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const inspectedResponse = await api(
      "/oauth/native-save/inspect",
      { consentRequestId: prepared.consentRequestId },
      f.sessions[0],
    )
    assert.equal(
      inspectedResponse.status,
      200,
      await inspectedResponse.clone().text(),
    )
    const inspected = (await inspectedResponse.json()).data
    assert.equal(inspected.state, "pending")
    assert.equal(inspected.accountId, f.sessions[0].owner)
    assert.equal(
      JSON.parse(inspected.authoredShowJson).title,
      "Synthetic exact native save",
    )
    const approved = await api(
      "/oauth/native-save/approve",
      {
        consentRequestId: prepared.consentRequestId,
        decision: "allow",
        proof: inspected.proof,
      },
      f.sessions[0],
    )
    assert.equal(approved.status, 200, await approved.clone().text())
    assert.equal((await approved.json()).data.state, "approved")
    const saved = await rpc(token, "save_game", prepared.input)
    assert.equal(saved.ok, true, JSON.stringify(saved))
    assert.match(saved.data.quizId, /^[A-Za-z0-9_-]{21}$/)
    assert.equal(
      saved.data.studioUrl,
      origin + "/manager/quizz/" + saved.data.quizId,
    )
    const actual = await f.as(f.sessions[0], () =>
      native.getQuizzById(saved.data.quizId),
    )
    assert.equal(actual.id, saved.data.quizId)
    assert.equal(actual.subject, "Synthetic exact native save")
    assert.equal(actual.questions.length, 5)
    const extras = quizExtrasV2Schema.parse(
      JSON.parse(
        fs.readFileSync(
          path.join(
            f.root,
            "tenants",
            f.sessions[0].owner,
            "extensions/quizzes",
            saved.data.quizId + ".json",
          ),
          "utf8",
        ),
      ),
    )
    assert.equal(extras.quizId, saved.data.quizId)
    assert.equal(new Set(extras.questionIds).size, 5)
    const principal = await issuer.verifyAccessToken(token)
    assert.deepEqual(
      extras.questionIds,
      JSON.parse(
        savedRow(
          f.root,
          f.sessions[0].owner,
          principal.grantId,
          prepared.input.idempotencyKey,
        ).nativeSnapshot,
      ).extras.questionIds,
    )
    assert.deepEqual(
      (await rpc(token, "save_game", prepared.input)).data,
      saved.data,
    )
    assert.equal(fs.existsSync(path.join(f.root, "quizz")), false)
  })

  test("native consent rejects MCP tokens, another account/session, wrong Origin and copied proof", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const before = nativeCount()
    const again = await rpc(token, "save_game", prepared.input)
    assert.equal(again.error.consentRequestId, prepared.consentRequestId)
    assert.equal(
      (
        await rpc(token, "save_game", {
          ...prepared.input,
          expectedRevision: 2,
        })
      ).error.code,
      "REQUEST_KEY_REUSED",
    )
    assert.notEqual(
      (
        await api(
          "/oauth/native-save/inspect",
          { consentRequestId: prepared.consentRequestId },
          { ...f.sessions[0], token },
        )
      ).status,
      200,
    )
    assert.notEqual(
      (
        await api(
          "/oauth/native-save/inspect",
          { consentRequestId: prepared.consentRequestId },
          f.sessions[1],
        )
      ).status,
      200,
    )
    assert.notEqual(
      (
        await api(
          "/oauth/native-save/inspect",
          { consentRequestId: prepared.consentRequestId },
          f.sessions[0],
          { origin: "https://foreign.invalid" },
        )
      ).status,
      200,
    )
    const inspected = (
      await (
        await api(
          "/oauth/native-save/inspect",
          { consentRequestId: prepared.consentRequestId },
          f.sessions[0],
        )
      ).json()
    ).data
    const newer = await f.tokens.mintToken(f.sessions[0].owner, "manager")
    const claims = await f.tokens.verifyToken(newer.token)
    for (const [session, proof] of [
      [f.sessions[0], "0".repeat(64)],
      [
        { token: newer.token, owner: f.sessions[0].owner, sid: claims.sid! },
        inspected.proof,
      ],
    ] as const) {
      assert.notEqual(
        (
          await api(
            "/oauth/native-save/approve",
            {
              consentRequestId: prepared.consentRequestId,
              decision: "allow",
              proof,
            },
            session,
          )
        ).status,
        200,
      )
    }
    assert.equal(nativeCount(), before)
  })

  test("draft edits after inspect or approval never silently upgrade the selected native snapshot", async () => {
    for (const approveFirst of [false, true]) {
      const token = await linked()
      const prepared = await pending(token, "Original approved snapshot")
      const inspected = (
        await (
          await api(
            "/oauth/native-save/inspect",
            { consentRequestId: prepared.consentRequestId },
            f.sessions[0],
          )
        ).json()
      ).data
      if (approveFirst)
        assert.equal(
          (
            await api(
              "/oauth/native-save/approve",
              {
                consentRequestId: prepared.consentRequestId,
                decision: "allow",
                proof: inspected.proof,
              },
              f.sessions[0],
            )
          ).status,
          200,
        )
      const before = nativeCount()
      assert.equal(
        (
          await rpc(token, "update_game_draft", {
            contractVersion: "0.1.0",
            draftId: prepared.input.draftId,
            expectedRevision: 1,
            authoredShowJson: createInput("Changed after inspection")
              .authoredShowJson,
            idempotencyKey: key(),
          })
        ).ok,
        true,
      )
      if (approveFirst)
        assert.equal(
          (await rpc(token, "save_game", prepared.input)).error.code,
          "REVISION_CONFLICT",
        )
      else {
        const response = await api(
          "/oauth/native-save/approve",
          {
            consentRequestId: prepared.consentRequestId,
            decision: "allow",
            proof: inspected.proof,
          },
          f.sessions[0],
        )
        assert.equal(response.status, 409)
        assert.equal((await response.json()).error.code, "REVISION_CONFLICT")
      }
      assert.equal(nativeCount(), before)
    }
  })

  test("revoking the approving native session denies a new physical save", async () => {
    const token = await linked()
    const prepared = await pending(token)
    const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager")
    const claims = await f.tokens.verifyToken(minted.token)
    const session = {
      token: minted.token,
      owner: f.sessions[0].owner,
      sid: claims.sid!,
    }
    await inspectAndApprove(prepared, session)
    const before = nativeCount()
    f.accounts.revokeAccountSession(session.sid)
    assert.equal(
      (await rpc(token, "save_game", prepared.input)).error.code,
      "CONSENT_REQUIRED",
    )
    assert.equal(
      (
        await (
          await api(
            "/oauth/native-save/inspect",
            { consentRequestId: prepared.consentRequestId },
            f.sessions[0],
          )
        ).json()
      ).data.state,
      "expired",
    )
    assert.equal(nativeCount(), before)
  })

  test("default-off, disabled account scope and revoked OAuth grant cannot publish a native game", async () => {
    const { nativeSave: _save, ...disabledOptions } = options
    const disabledIssuer = await createFirstPartyOAuth(disabledOptions)
    assert.equal(disabledIssuer.storage, undefined)
    const noRoute = await disabledIssuer.fetch(
      new Request(origin + "/oauth/native-save/inspect", {
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
    const before = nativeCount()
    process.env.TADAZZ_ACCOUNTS_ENABLED = "false"
    try {
      await assert.rejects(issuer.verifyAccessToken(token))
    } finally {
      process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    }
    assert.equal(nativeCount(), before)
    assert.equal(
      (
        await api("/oauth/revoke", {
          client_id: clientId,
          token: refreshTokens.get(token)!,
        })
      ).status,
      200,
    )
    await assert.rejects(issuer.verifyAccessToken(token))
    assert.notEqual(
      (
        await api(
          "/oauth/native-save/approve",
          {
            consentRequestId: prepared.consentRequestId,
            decision: "allow",
            proof: "0".repeat(64),
          },
          f.sessions[0],
        )
      ).status,
      200,
    )
    assert.equal(nativeCount(), before)
  })

  test("simultaneous same-key saves return one actual native result and reject altered stored intent", async () => {
    const token = await linked()
    const prepared = await pending(token)
    await inspectAndApprove(prepared)
    const before = nativeCount()
    const replies = await Promise.all([
      rpc(token, "save_game", prepared.input),
      rpc(token, "save_game", prepared.input),
    ])
    assert.equal(replies[0].ok, true, JSON.stringify(replies[0]))
    assert.deepEqual(replies[1].data, replies[0].data)
    assert.equal(nativeCount(), before + 1)
    const other = await pending(token, "Immutable pending body")
    const principal = await issuer.verifyAccessToken(token)
    const db = new DatabaseSync(ledgerFile(f.root, f.sessions[0].owner))
    const query =
      "UPDATE operations SET outcome=? WHERE grant_id=? AND kind='save' AND request_key=?"
    const row = db
      .prepare(
        "SELECT outcome FROM operations WHERE grant_id=? AND kind='save' AND request_key=?",
      )
      .get(principal.grantId, other.input.idempotencyKey)!
    const changed = JSON.parse(row.outcome as string)
    changed.expiresAt += 300000
    db.prepare(query).run(
      JSON.stringify(changed),
      principal.grantId,
      other.input.idempotencyKey,
    )
    db.close()
    const after = nativeCount()
    assert.equal(
      (await rpc(token, "save_game", other.input)).error.code,
      "DEPENDENCY_UNAVAILABLE",
    )
    assert.equal(nativeCount(), after)
  })

  for (const phase of [
    "before-native",
    "after-native",
    "after-f-outcome",
  ] as const) {
    test(`fresh real F/C1 retry after genuine SIGKILL ${phase} retains one operation and target`, async () => {
      const token = await linked()
      const prepared = await pending(token, "Crash snapshot " + phase)
      await inspectAndApprove(prepared)
      const principal = await issuer.verifyAccessToken(token)
      const before = nativeCount()
      const name = "actor-" + phase + "-" + key()
      const descriptor = path.join(f.root, name + ".json")
      const checkpoint = path.join(f.root, name + ".checkpoint.json")
      const reply = path.join(f.root, name + ".reply.json")
      const { nativeSave: _native, ...publicOptions } = options
      writeDurable(descriptor, {
        root: f.root,
        nonce: fixtureNonce,
        owner: f.sessions[0].owner,
        syntheticSecret: f.syntheticSecret,
        grantId: principal.grantId,
        token,
        input: prepared.input,
        options: publicOptions,
        encryptionKey: Buffer.from(options.ticketEncryptionKey).toString(
          "base64",
        ),
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
      const observed = JSON.parse(fs.readFileSync(checkpoint, "utf8"))
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
              authoredShowJson: createInput("Later current draft")
                .authoredShowJson,
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
      const completed = JSON.parse(fs.readFileSync(reply, "utf8"))
      assert.equal(completed.result.ok, true, JSON.stringify(completed))
      assert.equal(nativeCount(), before + 1)
      if (observed.result)
        assert.equal(completed.result.data.quizId, observed.result.quizId)
      if (observed.outcome)
        assert.deepEqual(completed.result.data, observed.outcome)
      const loaded = await f.as(f.sessions[0], () =>
        native.getQuizzById(completed.result.data.quizId),
      )
      assert.equal(loaded.subject, "Crash snapshot " + phase)
      if (phase === "after-f-outcome") {
        await f.as(f.sessions[0], () =>
          native.deleteQuizz(completed.result.data.quizId),
        )
        fs.unlinkSync(
          path.join(
            f.root,
            "tenants",
            f.sessions[0].owner,
            "extensions/quizzes",
            completed.result.data.quizId + ".json",
          ),
        )
        const afterDelete = nativeCount()
        assert.deepEqual(
          (await rpc(token, "save_game", prepared.input)).data,
          completed.result.data,
        )
        assert.equal(nativeCount(), afterDelete)
      }
      writeDurable(path.join(f.root, name + ".verified.json"), {
        phase,
        killedPid: observed.pid,
        signal: lost.signal,
        replayPid: completed.pid,
        replayExit: replay.status,
        result: completed.result.data,
        nativeCountBefore: before,
        nativeCountAfter: nativeCount(),
        finalState: savedRow(
          f.root,
          f.sessions[0].owner,
          principal.grantId,
          prepared.input.idempotencyKey,
        ).state,
      })
    })
  }

  test("an uncertain private ledger journal is preserved and cannot authorize another native save", async () => {
    const token = await linked()
    const prepared = await pending(token)
    await inspectAndApprove(prepared)
    const file = ledgerFile(f.root, f.sessions[0].owner)
    const journal = file + "-journal"
    const bytes = fs.readFileSync(file)
    const marker = "synthetic-unresolved-native-save-journal"
    fs.writeFileSync(journal, marker, { flag: "wx", mode: 0o600 })
    const before = nativeCount()
    const response = await remote.fetch(
      new Request(config.resource, {
        method: "POST",
        headers: {
          host: new URL(origin).host,
          authorization: "Bearer " + token,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++requestId,
          method: "tools/call",
          params: { name: "save_game", arguments: prepared.input },
        }),
      }),
    )
    assert.notEqual(response.status, 200)
    assert.equal(fs.readFileSync(journal, "utf8"), marker)
    assert.deepEqual(fs.readFileSync(file), bytes)
    assert.equal(nativeCount(), before)
  })
}
