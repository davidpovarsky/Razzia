import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it } from "node:test"
import { App } from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app.js"
import { AppBridge } from "../../src/mcp-app/node_modules/@modelcontextprotocol/ext-apps/dist/src/app-bridge.js"
import {
  ALL_MCP_SCOPES,
  buildCreateDraftInput,
  buildDraftShow,
  buildMcpOptions,
  createEphemeralOAuthKeys,
  createLoopbackTlsCertificate,
  createPinnedCaFetch,
  installResendVerificationTrap,
  reserveLoopbackPort,
} from "./harness.ts"

interface ToolOutcome {
  readonly ok: boolean
  readonly data?: Record<string, unknown>
  readonly error?: {
    readonly code: string
    readonly consentRequestId?: string
    readonly consentUrl?: string
  }
}

/** Official app protocol over an isolated message transport; OAuth stays in the host. */
async function connectAppSaveClient(
  client: ConstructorParameters<typeof AppBridge>[0],
) {
  const app = new App(
    { name: "native-consent-save-app-qa", version: "1.0.0" },
    {},
    { autoResize: false, webMcpBridge: false, strict: true },
  )
  const bridge = new AppBridge(
    client,
    { name: "native-consent-host-qa", version: "1.0.0" },
    { serverTools: {} },
  )
  type Transport = NonNullable<Parameters<App["connect"]>[0]>
  const appTransport: Transport = {
    start: async () => {},
    send: async (message) => {
      queueMicrotask(() => hostTransport.onmessage?.(structuredClone(message)))
    },
    close: async () => {
      appTransport.onclose?.()
    },
  }
  const hostTransport: Transport = {
    start: async () => {},
    send: async (message) => {
      queueMicrotask(() => appTransport.onmessage?.(structuredClone(message)))
    },
    close: async () => {
      hostTransport.onclose?.()
    },
  }
  await bridge.connect(hostTransport)
  await app.connect(appTransport)
  return { app, bridge }
}

async function listUserQuizzes(options: {
  readonly origin: string
  readonly fetchImpl: typeof globalThis.fetch
  readonly token: string
}): Promise<ReadonlyArray<{ readonly id: string }>> {
  const res = await options.fetchImpl(`${options.origin}/api/quizz`, {
    headers: { Authorization: `Bearer ${options.token}` },
  })

  assert.equal(res.status, 200)

  const payload: unknown = await res.json()
  assert(payload !== null && typeof payload === "object" && "quizz" in payload)
  assert(Array.isArray(payload.quizz))
  assert(
    payload.quizz.every(
      (entry: unknown) =>
        entry !== null &&
        typeof entry === "object" &&
        "id" in entry &&
        typeof entry.id === "string",
    ),
  )

  return payload.quizz as ReadonlyArray<{ readonly id: string }>
}

function assertNoLeakedSecrets(options: {
  readonly payload: unknown
  readonly nativeToken: string
  readonly jwtSecret: string
}): void {
  const text = JSON.stringify(options.payload)

  assert.equal(text.includes(options.nativeToken), false)
  assert.equal(text.includes(options.jwtSecret), false)
  assert.equal(text.includes("approvalMac"), false)
}

describe("native-host end-to-end consent integration", () => {
  it("runs real accounts, PKCE OAuth, official app save consent, security denials, and C1 gate", async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "tadazz-native-e2e-")))
    const jwtSecret = `test-e2e-jwt-${"s".repeat(48)}`
    const previousEnv = {
      CONFIG_PATH: process.env.CONFIG_PATH,
      TADAZZ_ACCOUNTS_ENABLED: process.env.TADAZZ_ACCOUNTS_ENABLED,
      JWT_SECRET: process.env.JWT_SECRET,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      TADAZZ_AUTH_EMAIL_FROM: process.env.TADAZZ_AUTH_EMAIL_FROM,
    }

    process.env.CONFIG_PATH = root
    process.env.TADAZZ_ACCOUNTS_ENABLED = "true"
    process.env.JWT_SECRET = jwtSecret
    process.env.RESEND_API_KEY = "test-not-a-real-api-key"
    process.env.TADAZZ_AUTH_EMAIL_FROM = "Tadazz Test <auth@example.invalid>"

    const mailTrap = installResendVerificationTrap()
    const tls = createLoopbackTlsCertificate()
    const keys = createEphemeralOAuthKeys()
    const tlsFetch = createPinnedCaFetch(tls.cert)

    try {
      const [nativeHostMod, consentClientMod, mcpClientMod, oauthFlowMod] =
        await Promise.all([
          import("../../src/mcp-app/native-host/index.ts"),
          import("../../src/components/native-save-consent/client.ts"),
          import("../phase3-mcp-service/mcp-client.ts"),
          import("./oauth-flow.ts"),
        ])
      const port = await reserveLoopbackPort()
      const origin = `https://127.0.0.1:${port}`
      const host = await nativeHostMod.createNativeConsentHost({
        enabled: true,
        configRoot: root,
        initializeNativeRuntime: true,
        mcp: buildMcpOptions({ origin, keys }),
        webFallback: (request) => {
          const { pathname } = new URL(request.url)

          return new Response(
            `<!doctype html><html><body>${pathname}</body></html>`,
            {
              status: 200,
              headers: { "Content-Type": "text/html; charset=utf-8" },
            },
          )
        },
      })
      const httpServer = await nativeHostMod.listenNativeConsentHost(host, {
        host: "127.0.0.1",
        port,
        tls,
        attachSocketServer: true,
      })

      try {
        const accountA = await oauthFlowMod.registerAndLoginAccount({
          origin,
          fetchImpl: tlsFetch,
          email: "alice-e2e@example.invalid",
          password: "Passphrase-Alice-1234",
          codes: mailTrap.codes,
        })
        const accountB = await oauthFlowMod.registerAndLoginAccount({
          origin,
          fetchImpl: tlsFetch,
          email: "bob-e2e@example.invalid",
          password: "Passphrase-Bob-1234",
          codes: mailTrap.codes,
        })
        const grantLimited = await oauthFlowMod.authorizePkceGrant({
          origin,
          fetchImpl: tlsFetch,
          nativeToken: accountA.token,
          scopes: ["tadazz.drafts.write", "tadazz.drafts.read"],
        })
        const grantFullA = await oauthFlowMod.authorizePkceGrant({
          origin,
          fetchImpl: tlsFetch,
          nativeToken: accountA.token,
          scopes: ALL_MCP_SCOPES,
        })
        // Give B a real active OAuth ledger too; a cold/unavailable store is not
        // evidence that an otherwise-authorized B cannot inspect A's consent.
        const grantFullB = await oauthFlowMod.authorizePkceGrant({
          origin,
          fetchImpl: tlsFetch,
          nativeToken: accountB.token,
          scopes: ALL_MCP_SCOPES,
        })
        assert(grantFullB.accessToken.length > 0)

        const connectMcp = async (accessToken: string) => {
          const client = new mcpClientMod.Client({
            name: "phase3-native-consent-e2e",
            version: "1.0.0",
          })
          const transport = new mcpClientMod.StreamableHTTPClientTransport(
            new URL(`${origin}/mcp`),
            {
              authProvider: { token: () => Promise.resolve(accessToken) },
              fetch: tlsFetch,
            },
          )

          await client.connect(transport)

          return { client, transport }
        }

        const limitedConn = await connectMcp(grantLimited.accessToken)

        try {
          const createdLimited = (
            await limitedConn.client.callTool({
              name: "create_game_draft",
              arguments: buildCreateDraftInput("Limited Scope Draft"),
            })
          ).structuredContent as ToolOutcome

          assert.equal(createdLimited.ok, true)

          const deniedSave = (
            await limitedConn.client.callTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: createdLimited.data?.draftId,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: randomBytes(18).toString("base64url"),
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(deniedSave.ok, false)
          assert.equal(deniedSave.error?.code, "SCOPE_REQUIRED")
        } finally {
          await limitedConn.transport.close()
        }

        const connA = await connectMcp(grantFullA.accessToken)
        const { app, bridge } = await connectAppSaveClient(connA.client)

        try {
          const draft1 = (
            await connA.client.callTool({
              name: "create_game_draft",
              arguments: buildCreateDraftInput("Primary Consent Show"),
            })
          ).structuredContent as ToolOutcome

          assert.equal(draft1.ok, true)

          const draftId1 = draft1.data?.draftId as string
          const key1 = randomBytes(18).toString("base64url")
          const challenge1 = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftId1,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: key1,
              },
            })
          ).structuredContent as ToolOutcome

          assertNoLeakedSecrets({
            payload: challenge1,
            nativeToken: accountA.token,
            jwtSecret,
          })
          assert.equal(challenge1.ok, false)
          assert.ok(challenge1.error)
          assert.equal(challenge1.error.code, "CONSENT_REQUIRED")

          const requestId1 = challenge1.error.consentRequestId ?? ""
          const pendingReplay = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftId1,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: key1,
              },
            })
          ).structuredContent as ToolOutcome
          assert.equal(pendingReplay.ok, false)
          assert.equal(pendingReplay.error?.code, "CONSENT_REQUIRED")
          assert.equal(pendingReplay.error?.consentRequestId, requestId1)
          assert.equal(
            pendingReplay.error?.consentUrl,
            challenge1.error.consentUrl,
          )

          assert.equal(requestId1.length, 54)
          assert.equal(
            challenge1.error.consentUrl,
            `${origin}/studio/native-save-consent/${requestId1}`,
          )
          assert.equal(
            consentClientMod.nativeSaveRequestIdFromPath(
              `/studio/native-save-consent/${requestId1}`,
              "?tamper=1",
              "",
            ),
            null,
          )
          assert.equal(
            consentClientMod.nativeSaveRequestIdFromPath(
              `/studio/native-save-consent/${requestId1}`,
              "",
              "#frag",
            ),
            null,
          )
          assert.equal(
            (
              await listUserQuizzes({
                origin,
                fetchImpl: tlsFetch,
                token: accountA.token,
              })
            ).length,
            0,
          )

          const headConsent = await tlsFetch(
            `${origin}/studio/native-save-consent/${requestId1}`,
            { method: "HEAD" },
          )

          assert.equal(headConsent.status, 200)
          assert.equal(await headConsent.text(), "")
          assert.equal(headConsent.headers.get("x-frame-options"), "DENY")
          assert.equal(headConsent.headers.get("cache-control"), "no-store")
          assert.equal(
            headConsent.headers.get("referrer-policy"),
            "no-referrer",
          )
          assert.match(
            headConsent.headers.get("content-security-policy") ?? "",
            /frame-ancestors\s+'none'/u,
          )

          const bobInspect = await tlsFetch(
            `${origin}/oauth/native-save/inspect`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accountB.token}`,
                Origin: origin,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ consentRequestId: requestId1 }),
            },
          )

          // The accepted ledger deliberately maps a foreign grant lookup to
          // DEPENDENCY_UNAVAILABLE, avoiding a cross-tenant existence oracle.
          assert.equal(bobInspect.status, 503)

          const bobBody = await bobInspect.text()
          assert.equal(
            (JSON.parse(bobBody) as { error: { code: string } }).error.code,
            "DEPENDENCY_UNAVAILABLE",
          )

          assert.equal(bobBody.includes("Primary Consent Show"), false)

          const missingOriginInspect = await tlsFetch(
            `${origin}/oauth/native-save/inspect`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accountA.token}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ consentRequestId: requestId1 }),
            },
          )

          assert.equal(missingOriginInspect.status, 403)

          const relativeTlsFetch: typeof globalThis.fetch = (input, init) => {
            const target =
              typeof input === "string" && input.startsWith("/")
                ? `${origin}${input}`
                : input

            const headers = new Headers(init?.headers)
            headers.set("Origin", origin)

            return tlsFetch(target, { ...init, headers })
          }
          const consentClientA = consentClientMod.createNativeSaveConsentClient(
            {
              issuerBasePath: "/oauth",
              accountId: accountA.accountId,
              getNativeToken: () => accountA.token,
              request: relativeTlsFetch,
            },
          )
          const inspection1 = await consentClientA.inspect(requestId1)

          assertNoLeakedSecrets({
            payload: inspection1,
            nativeToken: accountA.token,
            jwtSecret,
          })
          assert.equal(inspection1.state, "pending")
          assert.equal(inspection1.summary.title, "Primary Consent Show")
          assert.equal(inspection1.revision, 1)

          const approval1 = await consentClientA.approve(
            requestId1,
            inspection1,
          )

          assertNoLeakedSecrets({
            payload: approval1,
            nativeToken: accountA.token,
            jwtSecret,
          })
          assert.equal(approval1.state, "approved")
          assert.equal(
            (
              await listUserQuizzes({
                origin,
                fetchImpl: tlsFetch,
                token: accountA.token,
              })
            ).length,
            0,
          )

          const draftCancel = (
            await connA.client.callTool({
              name: "create_game_draft",
              arguments: buildCreateDraftInput("Canceled Draft"),
            })
          ).structuredContent as ToolOutcome
          const keyCancel = randomBytes(18).toString("base64url")
          const challengeCancel = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftCancel.data?.draftId,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: keyCancel,
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(challengeCancel.error?.code, "CONSENT_REQUIRED")

          const retryWithoutApprove = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftCancel.data?.draftId,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: keyCancel,
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(retryWithoutApprove.ok, false)
          assert.equal(retryWithoutApprove.error?.code, "CONSENT_REQUIRED")

          const draftDrift = (
            await connA.client.callTool({
              name: "create_game_draft",
              arguments: buildCreateDraftInput("Revision Drift Draft"),
            })
          ).structuredContent as ToolOutcome
          const draftDriftId = draftDrift.data?.draftId as string
          const keyDrift = randomBytes(18).toString("base64url")
          const challengeDrift = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftDriftId,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: keyDrift,
              },
            })
          ).structuredContent as ToolOutcome
          const requestDriftId = challengeDrift.error?.consentRequestId ?? ""
          const driftInspection = await consentClientA.inspect(requestDriftId)

          await consentClientA.approve(requestDriftId, driftInspection)

          const updatedDrift = (
            await connA.client.callTool({
              name: "update_game_draft",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftDriftId,
                expectedRevision: 1,
                authoredShowJson: JSON.stringify(
                  buildDraftShow("Updated Drift Title"),
                ),
                idempotencyKey: randomBytes(18).toString("base64url"),
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(updatedDrift.ok, true)
          assert.equal(updatedDrift.data?.revision, 2)

          const retryDrift = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftDriftId,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: keyDrift,
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(retryDrift.ok, false)
          // C1 lookup precedes the mutable draft check. Windows cannot admit
          // that POSIX lookup; only Linux qualifies the actual revision gate.
          assert.equal(
            retryDrift.error?.code,
            process.platform === "linux"
              ? "REVISION_CONFLICT"
              : "DEPENDENCY_UNAVAILABLE",
          )

          const reusedKey = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftDriftId,
                expectedRevision: 2,
                intent: "createNew",
                idempotencyKey: key1,
              },
            })
          ).structuredContent as ToolOutcome

          assert.equal(reusedKey.ok, false)
          assert.equal(reusedKey.error?.code, "REQUEST_KEY_REUSED")

          const finalSave = (
            await app.callServerTool({
              name: "save_game",
              arguments: {
                contractVersion: "0.1.0",
                draftId: draftId1,
                expectedRevision: 1,
                intent: "createNew",
                idempotencyKey: key1,
              },
            })
          ).structuredContent as ToolOutcome

          assertNoLeakedSecrets({
            payload: finalSave,
            nativeToken: accountA.token,
            jwtSecret,
          })

          if (process.platform === "linux") {
            assert.equal(finalSave.ok, true, JSON.stringify(finalSave))

            const savedQuizId = finalSave.data?.quizId as string

            assert.match(savedQuizId, /^[A-Za-z0-9_-]{21}$/u)

            const quizzesA = await listUserQuizzes({
              origin,
              fetchImpl: tlsFetch,
              token: accountA.token,
            })

            assert.deepEqual(
              quizzesA.map((entry) => entry.id),
              [savedQuizId],
            )

            const getA = await tlsFetch(`${origin}/api/quizz/${savedQuizId}`, {
              headers: { Authorization: `Bearer ${accountA.token}` },
            })
            const getB = await tlsFetch(`${origin}/api/quizz/${savedQuizId}`, {
              headers: { Authorization: `Bearer ${accountB.token}` },
            })

            assert.equal(getA.status, 200)
            assert.equal(getB.status, 404)

            const idempotentReplay = (
              await app.callServerTool({
                name: "save_game",
                arguments: {
                  contractVersion: "0.1.0",
                  draftId: draftId1,
                  expectedRevision: 1,
                  intent: "createNew",
                  idempotencyKey: key1,
                },
              })
            ).structuredContent as ToolOutcome

            assert.equal(idempotentReplay.ok, true)
            assert.equal(idempotentReplay.data?.quizId, savedQuizId)

            const freshKeyReplay = (
              await app.callServerTool({
                name: "save_game",
                arguments: {
                  contractVersion: "0.1.0",
                  draftId: draftId1,
                  expectedRevision: 1,
                  intent: "createNew",
                  idempotencyKey: randomBytes(18).toString("base64url"),
                },
              })
            ).structuredContent as ToolOutcome

            assert.equal(freshKeyReplay.ok, false)
            assert.equal(freshKeyReplay.error?.code, "CONSENT_REQUIRED")
          } else {
            assert.equal(finalSave.ok, false)
            assert.equal(finalSave.error?.code, "DEPENDENCY_UNAVAILABLE")
            assert.equal(
              (
                await listUserQuizzes({
                  origin,
                  fetchImpl: tlsFetch,
                  token: accountA.token,
                })
              ).length,
              0,
            )
          }
        } finally {
          await app.close()
          await bridge.close()
          await connA.transport.close()
        }
      } finally {
        await httpServer.close()
      }
    } finally {
      mailTrap.restore()

      if (previousEnv.CONFIG_PATH === undefined) {
        delete process.env.CONFIG_PATH
      } else {
        process.env.CONFIG_PATH = previousEnv.CONFIG_PATH
      }

      if (previousEnv.TADAZZ_ACCOUNTS_ENABLED === undefined) {
        delete process.env.TADAZZ_ACCOUNTS_ENABLED
      } else {
        process.env.TADAZZ_ACCOUNTS_ENABLED =
          previousEnv.TADAZZ_ACCOUNTS_ENABLED
      }

      if (previousEnv.JWT_SECRET === undefined) {
        delete process.env.JWT_SECRET
      } else {
        process.env.JWT_SECRET = previousEnv.JWT_SECRET
      }

      if (previousEnv.RESEND_API_KEY === undefined) {
        delete process.env.RESEND_API_KEY
      } else {
        process.env.RESEND_API_KEY = previousEnv.RESEND_API_KEY
      }

      if (previousEnv.TADAZZ_AUTH_EMAIL_FROM === undefined) {
        delete process.env.TADAZZ_AUTH_EMAIL_FROM
      } else {
        process.env.TADAZZ_AUTH_EMAIL_FROM = previousEnv.TADAZZ_AUTH_EMAIL_FROM
      }

      rmSync(root, { recursive: true, force: true })
    }
  })
})
