import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import fs from "node:fs"
import path from "node:path"
import { generateKeyPairSync, randomBytes } from "node:crypto"
import { createNativeCreationPort } from "@tadazz/native-c1-source"
import { createFirstPartyOAuth, type FirstPartyOAuthOptions } from "../../../../../extensions/src/mcp-app/first-party/oauth.ts"
import { fixture, origin, policy, key, createInput, type Session } from "../../../../../extensions/src/mcp-app/tests/first-party/fixtures.ts"

let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let remote: ReturnType<Awaited<ReturnType<typeof createFirstPartyOAuth>>["remote"]>
let native: typeof import("@razzia/socket/services/config")
const clientId = "synthetic-native-save-client"
const callback = "https://host.example.invalid/native/callback"
const config = { issuer: origin + "/oauth", resource: origin + "/mcp", resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp", firstPartyOrigins: [origin] }
const scopes = ["tadazz.drafts.read", "tadazz.drafts.write", "tadazz.library.write"]
let requestId = 0
let options: FirstPartyOAuthOptions

before(async () => {
  assert.equal(process.platform, "linux", "Native physical acceptance requires Linux fences")
  f = await fixture()
  for (const session of f.sessions) {
    fs.mkdirSync(path.join(f.root, "tenants", session.owner, "quizz"), { recursive: true })
  }
  native = await f.scope.withAccount(f.sessions[0].owner, () => import("@razzia/socket/services/config"))
  const port = createNativeCreationPort({ configuredRoot: () => f.root, accountsEnabled: f.scope.accountsEnabled,
    activeOwner: f.scope.activeAccount, getPath: native.getPath, prepare: native.prepareNativeQuizCreation, enableOperationBindings: true })
  assert.ok(port.operations)
  const pair = generateKeyPairSync("ed25519")
  options = { config, configRoot: f.root, keyId: "synthetic-native-save-key",
    signingPrivateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), ticketEncryptionKey: randomBytes(32),
    consentPageUrl: origin + "/studio/oauth-consent", clients: [{ clientId, redirectUris: [callback], scopes }],
    nativeSave: { authoring: policy, operations: port.operations, consentPageUrl: origin + "/studio/native-save-consent" } }
  issuer = await createFirstPartyOAuth(options)
  remote = issuer.remote({ allowedOrigins: [], dependencies: { authoring: policy, drafts: issuer.draftRepository(policy), storage: issuer.storage,
    rateLimit: async () => true } })
})
after(async () => {
  await remote?.close()
  // Preserve the exact synthetic native/ledger family for independent readback.
  // No user or peer fixture is removed, and no global native root is initialized.
  f?.db.close()
  if (f) console.log(JSON.stringify({ retainedSyntheticRoot: f.root, globalNativeQuizzExists: fs.existsSync(path.join(f.root, "quizz")) }))
})
function api(route: string, body?: Record<string, string>, session?: Session) {
  const json = route.includes("/inspect") || route.includes("/approve")
  return issuer.fetch(new Request(origin + route, { method: body ? "POST" : "GET", headers: {
    host: new URL(origin).host, ...(session ? { authorization: "Bearer " + session.token } : {}),
    ...(body ? { "content-type": json ? "application/json" : "application/x-www-form-urlencoded" } : {}), ...(json ? { origin } : {}) },
    ...(body ? { body: json ? JSON.stringify(body) : new URLSearchParams(body) } : {}) }))
}
async function linked(session = f.sessions[0]) {
  const verifier = randomBytes(32).toString("base64url")
  const { createHash } = await import("node:crypto")
  const started = await api("/oauth/authorize?" + new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: callback,
    resource: config.resource, scope: scopes.join(" "), state: key(), code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }))
  assert.equal(started.status, 302)
  const ticket = new URL(started.headers.get("location")!).searchParams.get("oauth_request")!
  const inspected = await (await api("/oauth/inspect", { ticket }, session)).json()
  const approved = await (await api("/oauth/approve", { ticket, decision: "allow", proof: inspected.proof }, session)).json()
  assert.ok(approved.redirectUrl)
  const response = await api("/oauth/token", { grant_type: "authorization_code", client_id: clientId, code: new URL(approved.redirectUrl).searchParams.get("code")!, code_verifier: verifier, redirect_uri: callback, resource: config.resource })
  assert.equal(response.status, 200)
  return (await response.json()).access_token as string
}
async function rpc(token: string, name: string, args: unknown) {
  const response = await remote.fetch(new Request(config.resource, { method: "POST", headers: { host: new URL(origin).host, authorization: "Bearer " + token,
    "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "tools/call", params: { name, arguments: args } }) }))
  assert.equal(response.status, 200)
  const body = await response.text()
  return (response.headers.get("content-type")?.startsWith("text/event-stream")
    ? JSON.parse(body.split("\n").filter(line => line.startsWith("data: ")).at(-1)!.slice(6)) : JSON.parse(body)).result.structuredContent
}
async function pending(token: string, title = "Synthetic exact native save") {
  const created = await rpc(token, "create_game_draft", createInput(title))
  assert.equal(created.ok, true, JSON.stringify(created))
  const input = { contractVersion: "0.1.0", draftId: created.data.draftId, expectedRevision: 1, intent: "createNew", idempotencyKey: key() }
  const result = await rpc(token, "save_game", input)
  assert.equal(result.ok, false)
  assert.equal(result.error.code, "CONSENT_REQUIRED", JSON.stringify(result))
  assert.equal(result.error.consentRequestId.length, 54)
  return { input, consentRequestId: result.error.consentRequestId as string, consentUrl: result.error.consentUrl as string }
}

test("real F manager consent publishes through actual B bound native C1 and reopens the same native game", async () => {
  const token = await linked()
  const prepared = await pending(token)
  const inspectedResponse = await api("/oauth/native-save/inspect", { consentRequestId: prepared.consentRequestId }, f.sessions[0])
  assert.equal(inspectedResponse.status, 200, await inspectedResponse.clone().text())
  const inspected = (await inspectedResponse.json()).data
  assert.equal(inspected.state, "pending")
  assert.equal(inspected.accountId, f.sessions[0].owner)
  assert.equal(JSON.parse(inspected.authoredShowJson).title, "Synthetic exact native save")
  const approved = await api("/oauth/native-save/approve", { consentRequestId: prepared.consentRequestId, decision: "allow", proof: inspected.proof }, f.sessions[0])
  assert.equal(approved.status, 200, await approved.clone().text())
  assert.equal((await approved.json()).data.state, "approved")
  const saved = await rpc(token, "save_game", prepared.input)
  assert.equal(saved.ok, true, JSON.stringify(saved))
  assert.match(saved.data.quizId, /^[A-Za-z0-9_-]{21}$/)
  assert.equal(saved.data.studioUrl, origin + "/manager/quizz/" + saved.data.quizId)
  const actual = await f.as(f.sessions[0], () => native.getQuizzById(saved.data.quizId))
  assert.equal(actual.id, saved.data.quizId)
  assert.equal(actual.subject, "Synthetic exact native save")
  assert.equal(actual.questions.length, 5)
  assert.equal(new Set(actual.questions.map(question => question.id)).size, 5)
  assert.deepEqual((await f.as(f.sessions[0], () => native.getQuizzById(saved.data.quizId))).questions.map(question => question.id), actual.questions.map(question => question.id))
  assert.deepEqual((await rpc(token, "save_game", prepared.input)).data, saved.data)
  assert.equal(fs.existsSync(path.join(f.root, "quizz")), false)
})
