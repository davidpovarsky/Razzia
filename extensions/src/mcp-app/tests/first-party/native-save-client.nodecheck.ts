import assert from "node:assert/strict"
import { before, after, test } from "node:test"
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

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let remote: ReturnType<typeof issuer.remote>
let native: typeof import("@razzia/socket/services/config")
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
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
    .readdirSync(path.join(f.root, "tenants", f.sessions[0].owner, "quizz"))
    .filter((n) => n.endsWith(".json")).length
before(async () => {
  assert.equal(process.platform, "linux")
  f = await fixture()
  assert.equal(
    path.dirname(f.root),
    "/home/david/tadazz-f-native-save-evidence-20261115",
  )
  assert.equal(fs.statfsSync(f.root).type, 0xef53)
  fs.writeFileSync(
    path.join(f.root, ".f-native-save-client-fixture.json"),
    JSON.stringify({
      version: 1,
      kind: "F-real-E-native-save-client",
      nonce: randomBytes(24).toString("base64url"),
    }),
    { flag: "wx", mode: 0o600 },
  )
  for (const s of f.sessions)
    fs.mkdirSync(path.join(f.root, "tenants", s.owner, "quizz"), {
      recursive: true,
    })
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
  issuer = await createFirstPartyOAuth({
    config,
    configRoot: f.root,
    keyId: "synthetic-native-client-key",
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
  console.log(
    JSON.stringify({
      runtime: process.version,
      platform: process.platform,
      filesystemMagic: fs.statfsSync(f.root).type,
    }),
  )
})
after(async () => {
  await remote?.close()
  if (f) {
    for (const prefix of [
      f.root,
      ...f.sessions.map((s) => path.join(f.root, "tenants", s.owner)),
    ])
      assert.equal(
        fs.readFileSync(
          path.join(prefix, "native-sentinels/quiz.json"),
          "utf8",
        ),
        JSON.stringify({
          sentinel:
            prefix === f.root
              ? "synthetic-global-do-not-touch"
              : "synthetic-native-do-not-touch",
        }) + "\n",
      )
    assert.equal(fs.existsSync(path.join(f.root, "quizz")), false)
    assert.deepEqual(
      fs.readdirSync(
        path.join(f.root, "tenants", f.sessions[1].owner, "quizz"),
      ),
      [],
    )
    fs.writeFileSync(
      path.join(f.root, "public-native-client-results.json"),
      JSON.stringify(
        {
          runtime: process.version,
          platform: process.platform,
          filesystemMagic: fs.statfsSync(f.root).type,
          retainedRoot: f.root,
          nativeGames: count(),
          receipts: publicReceipts,
          sentinelsUnchanged: true,
          otherOwnerNativeDirectoryEmpty: true,
          globalNativeRootAbsent: true,
        },
        null,
        2,
      ) + "\n",
      { flag: "wx", mode: 0o600 },
    )
    f.db.close()
    console.log(
      JSON.stringify({
        retainedSyntheticRoot: f.root,
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
    await api("/oauth/inspect", { ticket }, f.sessions[0])
  ).json()
  const approved = await (
    await api(
      "/oauth/approve",
      { ticket, decision: "allow", proof: inspected.proof },
      f.sessions[0],
    )
  ).json()
  const token = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: config.resource,
    code: new URL(approved.redirectUrl).searchParams.get("code")!,
    code_verifier: verifier,
  })
  assert.equal(token.status, 200)
  return (await token.json()).access_token as string
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
        id: ++sequence,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  )
  assert.equal(response.status, 200)
  const text = await response.text()
  return (
    response.headers.get("content-type")?.startsWith("text/event-stream")
      ? JSON.parse(
          text
            .split("\n")
            .filter((l) => l.startsWith("data: "))
            .at(-1)!
            .slice(6),
        )
      : JSON.parse(text)
  ).result.structuredContent
}
async function pending(token: string, title: string) {
  const created = await rpc(token, "create_game_draft", createInput(title))
  assert.equal(created.ok, true)
  const input = {
      contractVersion: "0.1.0",
      draftId: created.data.draftId,
      expectedRevision: 1,
      intent: "createNew",
      idempotencyKey: key(),
    },
    result = await rpc(token, "save_game", input)
  assert.equal(result.error.code, "CONSENT_REQUIRED")
  const url = new URL(result.error.consentUrl)
  assert.equal(url.search, "")
  assert.equal(url.hash, "")
  const id = nativeSaveRequestIdFromPath(url.pathname, url.search, url.hash)
  assert.equal(id, result.error.consentRequestId)
  return { input, id: id! }
}
/** Actual E fetch client; only browser-added Host/Origin are supplied. No auth,
 * DTO, issuer, grant/session/SQLite or native creation implementation is mocked. */
function bridge(
  session = f.sessions[0],
  getToken = () => session.token as string | null,
  receive?: (response: Response) => Promise<Response>,
) {
  const calls: string[] = []
  const request: typeof fetch = async (input, init) => {
    assert.ok(
      input === "/oauth/native-save/inspect" ||
        input === "/oauth/native-save/approve",
    )
    assert.equal(init?.credentials, "same-origin")
    assert.equal(init?.cache, "no-store")
    assert.equal(init?.redirect, "error")
    assert.equal(init?.referrerPolicy, "no-referrer")
    const headers = new Headers(init?.headers)
    headers.set("host", new URL(origin).host)
    headers.set("origin", origin)
    calls.push(String(input))
    const response = await issuer.fetch(
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
  assert.equal(inspected.accountId, f.sessions[0].owner)
  assert.equal(inspected.draftId, prepared.input.draftId)
  assert.equal(inspected.revision, 1)
  assert.equal(
    JSON.parse(inspected.authoredShowJson).title,
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
  const actual = await f.as(f.sessions[0], () =>
    native.getQuizzById(saved.data.quizId),
  )
  assert.equal(actual.id, saved.data.quizId)
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
  let current: string | null = f.sessions[0].token,
    release!: (r: Response) => void,
    entered!: () => void,
    real!: Response
  const ready = new Promise<void>((r) => (entered = r)),
    held = new Promise<Response>((r) => (release = r))
  const { client, calls } = bridge(
    f.sessions[0],
    () => current,
    async (response) => {
      real = response
      entered()
      return held
    },
  )
  const inspecting = client.inspect(prepared.id)
  await ready
  current = f.sessions[1].token
  release(real)
  await assert.rejects(inspecting, /session-changed/)
  assert.equal(calls.length, 1)
  assert.equal(count(), before)
  const foreign = bridge(f.sessions[1])
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
    f.sessions[0],
    () => f.sessions[0].token,
    async (response) => {
      if (calls.at(-1) === "/oauth/native-save/approve") {
        assert.equal(response.status, 200)
        assert.equal((await response.clone().json()).data.state, "approved")
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
    minted = await f.tokens.mintToken(f.sessions[0].owner, "manager"),
    claims = await f.tokens.verifyToken(minted.token),
    { client, calls } = bridge({
      token: minted.token,
      owner: f.sessions[0].owner,
      sid: claims.sid!,
    })
  const inspected = await client.inspect(prepared.id)
  f.accounts.revokeAccountSession(claims.sid!)
  await assert.rejects(
    client.approve(prepared.id, inspected),
    (e) => e instanceof NativeSaveConsentError,
  )
  await assert.rejects(client.approve(prepared.id, inspected), /expired/)
  assert.equal(calls.length, 2)
  assert.equal(
    (await rpc(token, "save_game", prepared.input)).error.code,
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
