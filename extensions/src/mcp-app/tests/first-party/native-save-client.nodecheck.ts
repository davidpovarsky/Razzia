import assert from "node:assert/strict"
import { before as beforeAll, after, test } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import {
  createNativeSaveConsentClient,
  nativeSaveRequestIdFromPath,
  NativeSaveConsentError,
} from "../../../components/native-save-consent/client"
import { createNativeCreationPort } from "../../../server/storage/creation-reservation"
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import {
  fixture,
  origin,
  policy,
  key,
  createInput,
  type Session,
} from "./fixtures.ts"

function isNativeClientObservationRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function requireNativeClientObservationRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isNativeClientObservationRecord(value)) {
    throw new Error("Invalid native client evidence record")
  }

  return value
}

function requireNativeClientObservationString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing native client evidence text")
  }

  return value
}

function requireNativeClientObservationPresent<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing native client evidence value")
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
type InitializedRemoteValue = ReturnType<InitializedIssuerValue["remote"]>
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
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
  firstPartyOrigins: [origin],
}
const clientId = "synthetic-native-save-real-E",
  callback = "https://host.example.invalid/native-client/callback"
const scopes = [
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
]
let sequence = 0
const publicReceipts: unknown[] = []
const count = () =>
  fs
    .readdirSync(
      path.join(
        requireInitializedF().root,
        "tenants",
        requireInitializedF().sessions[0].owner,
        "quizz",
      ),
    )
    .filter((n) => n.endsWith(".json")).length
beforeAll(async () => {
  assert.equal(process.platform, "linux")
  f = await fixture()
  assert.equal(
    path.dirname(requireInitializedF().root),
    "/home/david/tadazz-phase1-20261116",
  )
  assert.equal(fs.statfsSync(requireInitializedF().root).type, 0xef53)
  fs.writeFileSync(
    path.join(requireInitializedF().root, ".f-native-save-client-fixture.json"),
    JSON.stringify({
      version: 1,
      kind: "F-real-E-native-save-client",
      nonce: randomBytes(24).toString("base64url"),
    }),
    { flag: "wx", mode: 0o600 },
  )
  for (const s of requireInitializedF().sessions) {
    fs.mkdirSync(
      path.join(requireInitializedF().root, "tenants", s.owner, "quizz"),
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
  issuer = await createFirstPartyOAuth({
    config,
    configRoot: requireInitializedF().root,
    keyId: "synthetic-native-client-key",
    signingPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: `${origin}/studio/oauth-consent`,
    clients: [{ clientId, redirectUris: [callback], scopes }],
    nativeSave: {
      requireFirstPartyConsent: true,
      authoring: policy,
      operations: port.operations,
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
  console.log(
    JSON.stringify({
      runtime: process.version,
      platform: process.platform,
      filesystemMagic: fs.statfsSync(requireInitializedF().root).type,
    }),
  )
})
after(async () => {
  await remote?.close()

  if (f) {
    for (const prefix of [
      requireInitializedF().root,
      ...requireInitializedF().sessions.map((s) =>
        path.join(requireInitializedF().root, "tenants", s.owner),
      ),
    ]) {
      assert.equal(
        fs.readFileSync(
          path.join(prefix, "native-sentinels/quiz.json"),
          "utf8",
        ),
        `${JSON.stringify({
          sentinel:
            prefix === requireInitializedF().root
              ? "synthetic-global-do-not-touch"
              : "synthetic-native-do-not-touch",
        })}\n`,
      )
    }
    assert.equal(
      fs.existsSync(path.join(requireInitializedF().root, "quizz")),
      false,
    )
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
    fs.writeFileSync(
      path.join(
        requireInitializedF().root,
        "public-native-client-results.json",
      ),
      `${JSON.stringify(
        {
          runtime: process.version,
          platform: process.platform,
          filesystemMagic: fs.statfsSync(requireInitializedF().root).type,
          retainedRoot: requireInitializedF().root,
          nativeGames: count(),
          receipts: publicReceipts,
          sentinelsUnchanged: true,
          otherOwnerNativeDirectoryEmpty: true,
          globalNativeRootAbsent: true,
        },
        null,
        2,
      )}\n`,
      { flag: "wx", mode: 0o600 },
    )
    requireInitializedF().db.close()
    console.log(
      JSON.stringify({
        retainedSyntheticRoot: requireInitializedF().root,
        publicReceipt: "public-native-client-results.json",
      }),
    )
  }
})
async function api(
  route: string,
  body?: Record<string, string>,
  session?: Session,
) {
  const json = route === "/oauth/inspect" || route === "/oauth/approve"

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
      },
      ...(body
        ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) }
        : {}),
    }),
  )
}
async function linked() {
  const verifier = randomBytes(32).toString("base64url"),
    started = await api(
      `/oauth/authorize?${new URLSearchParams({
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
      })}`,
    )
  assert.equal(started.status, 302)
  const ticket = requireNativeClientObservationPresent(
    new URL(
      requireNativeClientObservationPresent(started.headers.get("location")),
    ).searchParams.get("oauth_request"),
  )

  const inspected = requireNativeClientObservationRecord(
    await (
      await api("/oauth/inspect", { ticket }, requireInitializedF().sessions[0])
    ).json(),
  )

  const approved = requireNativeClientObservationRecord(
    await (
      await api(
        "/oauth/approve",
        {
          ticket,
          decision: "allow",
          proof: requireNativeClientObservationString(inspected.proof),
        },
        requireInitializedF().sessions[0],
      )
    ).json(),
  )
  const token = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: config.resource,
    code: requireNativeClientObservationPresent(
      new URL(
        requireNativeClientObservationString(approved.redirectUrl),
      ).searchParams.get("code"),
    ),
    code_verifier: verifier,
  })
  assert.equal(token.status, 200)

  return requireNativeClientObservationString(
    requireNativeClientObservationRecord(await token.json()).access_token,
  )
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
        id: (sequence += 1),
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  )
  assert.equal(response.status, 200)
  const text = await response.text()

  return requireNativeClientObservationRecord(
    requireNativeClientObservationRecord(
      (response.headers.get("content-type")?.startsWith("text/event-stream")
        ? requireNativeClientObservationRecord(
            JSON.parse(
              requireNativeClientObservationPresent(
                text
                  .split("\n")
                  .filter((l) => l.startsWith("data: "))
                  .at(-1),
              ).slice(6),
            ),
          )
        : requireNativeClientObservationRecord(JSON.parse(text))
      ).result,
    ).structuredContent,
  )
}
async function pending(token: string, title: string) {
  const created = await rpc(token, "create_game_draft", createInput(title))
  assert.equal(created.ok, true)
  const input = {
      contractVersion: "0.1.0",
      draftId: requireNativeClientObservationString(
        requireNativeClientObservationRecord(created.data).draftId,
      ),
      expectedRevision: 1,
      intent: "createNew",
      idempotencyKey: key(),
    },
    result = await rpc(token, "save_game", input)
  assert.equal(
    requireNativeClientObservationRecord(result.error).code,
    "CONSENT_REQUIRED",
  )
  const url = new URL(
    requireNativeClientObservationString(
      requireNativeClientObservationRecord(result.error).consentUrl,
    ),
  )
  assert.equal(url.search, "")
  assert.equal(url.hash, "")
  const id = nativeSaveRequestIdFromPath(url.pathname, url.search, url.hash)
  assert.equal(
    id,
    requireNativeClientObservationRecord(result.error).consentRequestId,
  )

  return { input, id: requireNativeClientObservationPresent(id) }
}
// Actual E fetch client; only browser-added Host/Origin are supplied. No auth,
// DTO, issuer, grant/session/SQLite or native creation implementation is mocked.
function bridge(
  session = requireInitializedF().sessions[0],
  getToken = () => session.token as string | null,
  receive?: (response: Response) => Promise<Response>,
) {
  const calls: string[] = []
  const request: typeof fetch = async (input, init) => {
    assert.ok(
      input === "/oauth/native-save/inspect" ||
        input === "/oauth/native-save/approve",
    )
    assert.ok(init)
    assert.equal(init.credentials, "same-origin")
    assert.equal(init.cache, "no-store")
    assert.equal(init.redirect, "error")
    assert.equal(init.referrerPolicy, "no-referrer")
    const headers = new Headers(init.headers)
    headers.set("host", new URL(origin).host)
    headers.set("origin", origin)
    calls.push(input)
    const response = await requireInitializedIssuer().fetch(
      new Request(origin + input, { ...init, headers }),
    )
    assert.equal(response.headers.get("cache-control"), "no-store")

    return receive ? receive(response) : response
  }

  return {
    calls,
    client: createNativeSaveConsentClient({
      issuerBasePath: "/oauth",
      accountId: session.owner,
      getNativeToken: getToken,
      request,
    }),
  }
}

test("exact real E client inspects and approves without native allocation; original MCP key creates one real B target", async () => {
  const token = await linked(),
    prepared = await pending(token, "E client exact save"),
    before = count(),
    { client, calls } = bridge()
  const inspected = await client.inspect(prepared.id)
  assert.equal(inspected.state, "pending")
  assert.equal(inspected.accountId, requireInitializedF().sessions[0].owner)
  assert.equal(inspected.draftId, prepared.input.draftId)
  assert.equal(inspected.revision, 1)
  assert.equal(
    requireNativeClientObservationRecord(JSON.parse(inspected.authoredShowJson))
      .title,
    "E client exact save",
  )
  assert.ok(Object.isFrozen(inspected))
  assert.equal(count(), before)
  await assert.rejects(client.approve(prepared.id, { ...inspected }), /expired/)
  assert.equal(calls.length, 1)
  const approved = await client.approve(prepared.id, inspected)
  assert.equal(approved.state, "approved")
  assert.equal(count(), before)
  assert.deepEqual(calls, [
    "/oauth/native-save/inspect",
    "/oauth/native-save/approve",
  ])
  await assert.rejects(client.approve(prepared.id, inspected), /expired/)
  assert.equal(calls.length, 2)
  const saved = await rpc(token, "save_game", prepared.input)
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(count(), before + 1)
  const actual = await requireInitializedF().as(
    requireInitializedF().sessions[0],
    () =>
      requireInitializedNative().getQuizzById(
        requireNativeClientObservationString(
          requireNativeClientObservationRecord(saved.data).quizId,
        ),
      ),
  )
  assert.equal(
    actual.id,
    requireNativeClientObservationString(
      requireNativeClientObservationRecord(saved.data).quizId,
    ),
  )
  assert.equal(actual.subject, "E client exact save")
  assert.deepEqual(
    (await rpc(token, "save_game", prepared.input)).data,
    saved.data,
  )
  assert.equal(count(), before + 1)
  publicReceipts.push({
    case: "real E inspect/approve and original MCP save/replay",
    calls,
    nativeBefore: before,
    nativeAfter: count(),
    result: saved.data,
  })
})
test("real E client discards a genuine inspect response after native session changes in flight", async () => {
  const token = await linked(),
    prepared = await pending(token, "Discard delayed native inspection"),
    before = count()
  let current: string | null = requireInitializedF().sessions[0].token,
    release: (r: Response) => void = () => {
      throw new Error(
        "Promise resolver release was used before executor initialization",
      )
    },
    entered: () => void = () => {
      throw new Error(
        "Promise resolver entered was used before executor initialization",
      )
    },
    real: Response | undefined = undefined

  function requireRealResponse(): Response {
    if (real === undefined) {
      throw new Error("Local state real was read before initialization")
    }

    return real
  }

  const ready = new Promise<void>((r) => {
      entered = r
    }),
    held = new Promise<Response>((r) => {
      release = r
    })
  const { client, calls } = bridge(
    requireInitializedF().sessions[0],
    () => current,
    async (response) => {
      real = response
      entered()

      return held
    },
  )
  const inspecting = client.inspect(prepared.id)
  await ready
  current = requireInitializedF().sessions[1].token
  release(requireRealResponse())
  await assert.rejects(inspecting, /session-changed/)
  assert.equal(calls.length, 1)
  assert.equal(count(), before)
  const foreign = bridge(requireInitializedF().sessions[1])
  await assert.rejects(
    foreign.client.inspect(prepared.id),
    (e) => e instanceof NativeSaveConsentError,
  )
  assert.equal(count(), before)
  publicReceipts.push({
    case: "delayed genuine response/session switch and actual other-owner denial",
    calls,
    foreignCalls: foreign.calls,
    nativeBefore: before,
    nativeAfter: count(),
  })
})
test("draft edit after actual E inspection is rejected by real F approval; consumed proof is not retried", async () => {
  const token = await linked(),
    prepared = await pending(token, "E selected revision one"),
    before = count(),
    { client, calls } = bridge()
  const inspected = await client.inspect(prepared.id)
  const updated = await rpc(token, "update_game_draft", {
    contractVersion: "0.1.0",
    draftId: prepared.input.draftId,
    expectedRevision: 1,
    authoredShowJson: createInput("E later revision two").authoredShowJson,
    idempotencyKey: key(),
  })
  assert.equal(updated.ok, true)
  await assert.rejects(
    client.approve(prepared.id, inspected),
    /REVISION_CONFLICT/,
  )
  await assert.rejects(client.approve(prepared.id, inspected), /expired/)
  assert.equal(calls.length, 2)
  assert.equal(count(), before)
  publicReceipts.push({
    case: "real E/F stale revision denial/no approval retry",
    calls,
    nativeBefore: before,
    nativeAfter: count(),
  })
})
test("lost approval ACK from actual F commit is uncertain to E and never auto-retried; fresh inspection and original MCP key reconcile", async () => {
  const token = await linked(),
    prepared = await pending(token, "E lost approval response"),
    before = count()
  let lost = false
  const { client, calls } = bridge(
    requireInitializedF().sessions[0],
    () => requireInitializedF().sessions[0].token,
    async (response) => {
      if (calls.at(-1) === "/oauth/native-save/approve") {
        assert.equal(response.status, 200)
        assert.equal(
          requireNativeClientObservationRecord(
            requireNativeClientObservationRecord(await response.clone().json())
              .data,
          ).state,
          "approved",
        )
        lost = true
        throw new Error("synthetic-network-loss-after-real-approval")
      }

      return response
    },
  )
  const inspected = await client.inspect(prepared.id)
  await assert.rejects(
    client.approve(prepared.id, inspected),
    /synthetic-network-loss/,
  )
  assert.equal(lost, true)
  await assert.rejects(client.approve(prepared.id, inspected), /expired/)
  assert.equal(calls.length, 2)
  assert.equal(count(), before)
  const fresh = bridge()
  const reconciled = await fresh.client.inspect(prepared.id)
  assert.equal(reconciled.state, "approved")
  assert.equal(reconciled.proof, undefined)
  await assert.rejects(fresh.client.approve(prepared.id, reconciled), /expired/)
  assert.equal(fresh.calls.length, 1)
  const saved = await rpc(token, "save_game", prepared.input)
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.equal(count(), before + 1)
  assert.deepEqual(
    (await rpc(token, "save_game", prepared.input)).data,
    saved.data,
  )
  assert.equal(count(), before + 1)
  publicReceipts.push({
    case: "lost real F approval ACK/no automatic E retry/fresh inspect/original MCP key",
    calls,
    reconciledState: reconciled.state,
    nativeBefore: before,
    nativeAfter: count(),
    result: saved.data,
  })
})
test("revoked actual native session cannot approve through E and no game is allocated", async () => {
  const token = await linked(),
    prepared = await pending(token, "E revoked native approval"),
    before = count(),
    minted = await requireInitializedF().tokens.mintToken(
      requireInitializedF().sessions[0].owner,
      "manager",
    ),
    claims = await requireInitializedF().tokens.verifyToken(minted.token),
    { client, calls } = bridge({
      token: minted.token,
      owner: requireInitializedF().sessions[0].owner,
      sid: requireNativeClientObservationPresent(claims.sid),
    })
  const inspected = await client.inspect(prepared.id)
  requireInitializedF().accounts.revokeAccountSession(
    requireNativeClientObservationPresent(claims.sid),
  )
  await assert.rejects(
    client.approve(prepared.id, inspected),
    (e) => e instanceof NativeSaveConsentError,
  )
  await assert.rejects(client.approve(prepared.id, inspected), /expired/)
  assert.equal(calls.length, 2)
  assert.equal(
    requireNativeClientObservationRecord(
      (await rpc(token, "save_game", prepared.input)).error,
    ).code,
    "CONSENT_REQUIRED",
  )
  assert.equal(count(), before)
  publicReceipts.push({
    case: "actual native session revocation at E/F approval boundary",
    calls,
    nativeBefore: before,
    nativeAfter: count(),
  })
})
