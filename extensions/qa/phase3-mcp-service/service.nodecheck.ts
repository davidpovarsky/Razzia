import assert from "node:assert/strict"
import { createHash, generateKeyPairSync, randomBytes } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { after, before, test } from "node:test"
import i18next from "i18next"
import { Client, StreamableHTTPClientTransport } from "./mcp-client.ts"
import { createOAuthConsentClient } from "../../src/components/oauth-consent/client.ts"
import {
  createNativeSaveConsentClient,
  NativeSaveConsentError,
  nativeSaveRequestIdFromPath,
} from "../../src/components/native-save-consent/client.ts"
import { getNativeShowLibrary } from "../../src/core/show-library/native-library.ts"
import { showThemeText } from "../../src/core/show-themes/definition.ts"
import { getPreviewIdentityId } from "../../src/core/show-library/identity.ts"
import { withNativePresentationV2 } from "../../src/core/show-library/composition-document-v2.ts"
import { PREVIEW_CANDIDATE_META_V2 } from "../../src/mcp-app/contracts/preview-candidate-v2.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { PREVIEW_RESOURCE } from "../../src/mcp-app/contracts/schemas.ts"
import {
  createFirstPartyNativeSaveOperations,
  createPrincipalRateLimiter,
  createProtectedMcpService,
  isProtectedMcpServiceEnabled,
  type ProtectedMcpService,
  type ProtectedMcpServiceOptions,
} from "../../src/mcp-app/first-party/index.ts"
import { createPreviewCandidatePortV2 } from "../../src/mcp-app/server/preview-candidate-v2.ts"
import type { NativeCreationOperationPort } from "../../src/server/storage/creation-operation-types.ts"
import {
  createInput,
  fixture,
  key,
  origin,
  policy,
  type Session,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import en from "../../src/locales/en/extensions.json" with { type: "json" }
import fr from "../../src/locales/fr/extensions.json" with { type: "json" }
import de from "../../src/locales/de/extensions.json" with { type: "json" }
import es from "../../src/locales/es/extensions.json" with { type: "json" }
import it from "../../src/locales/it/extensions.json" with { type: "json" }
import ja from "../../src/locales/ja/extensions.json" with { type: "json" }
import tr from "../../src/locales/tr/extensions.json" with { type: "json" }
import vi from "../../src/locales/vi/extensions.json" with { type: "json" }

let currentFixture: Awaited<ReturnType<typeof fixture>> | null = null
let defaultOptions: Omit<ProtectedMcpServiceOptions, "enabled"> | null = null

function getFixture() {
  assert.ok(currentFixture)

  return currentFixture
}

function getBaseOptions() {
  assert.ok(defaultOptions)

  return defaultOptions
}

function firstPartyRequestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return `${origin}${input}`
  }

  if (input instanceof URL) {
    return input.href
  }

  return input.url
}
const translator = i18next.createInstance()
const resources = { en, fr, de, es, it, ja, tr, vi }
const clientId = "phase3-synthetic-host-client"
const redirectUri = "https://host.example.invalid/oauth/callback"
const browserOrigin = "https://chat.example.invalid"
const scopes = [
  "tadazz.catalog.read",
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.library.write",
  "tadazz.exports.read",
]
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
  firstPartyOrigins: [origin],
}
const activeServices: ProtectedMcpService[] = []

function createSyntheticTestNativePort(): NativeCreationOperationPort {
  const records = new Map<
    string,
    { authorizationDigest: string; quizId: string; baseDigest: string }
  >()

  return {
    lookup(binding) {
      const existing = records.get(binding.operationId)

      if (!existing) {
        return { status: "absent" }
      }

      if (existing.authorizationDigest !== binding.authorizationDigest) {
        throw new Error("Synthetic native operation conflict")
      }

      return {
        status: "committed",
        result: {
          quizId: existing.quizId,
          revision: 1,
          baseDigest: existing.baseDigest,
        },
      }
    },
    create(binding, input) {
      const existing = records.get(binding.operationId)

      if (existing) {
        if (existing.authorizationDigest !== binding.authorizationDigest) {
          throw new Error("Synthetic native operation conflict")
        }

        return {
          quizId: existing.quizId,
          revision: 1,
          baseDigest: existing.baseDigest,
        }
      }

      const quizId = randomBytes(16).toString("base64url").slice(0, 21)
      const baseDigest = hashJson(input)
      records.set(binding.operationId, {
        authorizationDigest: binding.authorizationDigest,
        quizId,
        baseDigest,
      })

      return { quizId, revision: 1, baseDigest }
    },
  }
}

before(async () => {
  const createdFixture = await fixture()
  currentFixture = createdFixture
  await translator.init({
    resources: Object.fromEntries(
      Object.entries(resources).map(([lang, extensions]) => [
        lang,
        { extensions },
      ]),
    ),
    lng: "en",
    fallbackLng: "en",
    defaultNS: "extensions",
    initAsync: false,
    interpolation: { escapeValue: false },
  })
  const pair = generateKeyPairSync("ed25519")
  defaultOptions = {
    config,
    configRoot: createdFixture.root,
    consentPageUrl: `${origin}/studio/oauth-consent`,
    keyId: "phase3-synthetic-oauth-key",
    signingPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8",
      format: "pem",
    }),
    ticketEncryptionKey: randomBytes(32),
    clients: [{ clientId, redirectUris: [redirectUri], scopes }],
    allowedOrigins: [browserOrigin],
    authoring: policy,
    rateLimit: createPrincipalRateLimiter(),
  }
})

after(async () => {
  await Promise.allSettled(activeServices.map((service) => service.close()))
  currentFixture?.close()
})

async function buildService(
  overrides: Partial<ProtectedMcpServiceOptions> = {},
) {
  const service = await createProtectedMcpService({
    ...getBaseOptions(),
    enabled: true,
    ...overrides,
  })
  activeServices.push(service)

  return service
}

async function authorizeAndToken(
  service: ProtectedMcpService,
  session: Session,
  requestedScopes = scopes,
) {
  const verifier = randomBytes(32).toString("base64url")
  const state = randomBytes(24).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const authorizeUrl = `${origin}/oauth/authorize?${new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    resource: config.resource,
    scope: requestedScopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  })}`
  const started = await service.fetch(
    new Request(authorizeUrl, { headers: { host: new URL(origin).host } }),
  )
  assert.equal(started.status, 302)
  const location = new URL(started.headers.get("location") ?? "")
  assert.equal(
    `${location.origin}${location.pathname}`,
    `${origin}/studio/oauth-consent`,
  )
  const ticket = location.searchParams.get("oauth_request") ?? ""
  assert.ok(ticket.length >= 40)

  const consentClient = createOAuthConsentClient({
    issuerBasePath: "/oauth",
    getNativeToken: () => session.token,
    request: (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set("host", new URL(origin).host)
      headers.set("origin", origin)

      return service.fetch(
        new Request(firstPartyRequestUrl(input), { ...init, headers }),
      )
    },
  })
  const inspected = await consentClient.inspect(ticket)
  assert.equal(inspected.clientId, clientId)
  assert.deepEqual(inspected.scopes, requestedScopes)
  const redirect = new URL(await consentClient.approve(ticket, inspected))
  assert.equal(`${redirect.origin}${redirect.pathname}`, redirectUri)
  assert.equal(redirect.searchParams.get("state"), state)
  assert.equal(redirect.searchParams.get("iss"), config.issuer)
  const code = redirect.searchParams.get("code") ?? ""
  assert.ok(code.length >= 40)

  const exchanged = await service.fetch(
    new Request(`${origin}/oauth/token`, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        resource: config.resource,
      }).toString(),
    }),
  )
  assert.equal(exchanged.status, 200)
  const tokens = (await exchanged.json()) as {
    access_token: string
    refresh_token: string
    token_type: string
  }
  assert.equal(tokens.token_type, "Bearer")

  return tokens
}

async function connectMcp(service: ProtectedMcpService, token: string) {
  const client = new Client({ name: "phase3-mcp-qa", version: "1.0.0" })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      authProvider: { token: () => Promise.resolve(token) },
      fetch: (input, init) => {
        const request = new Request(input, init)
        request.headers.set("host", new URL(config.resource).host)

        return service.fetch(request)
      },
    }),
  )

  return client
}

test("composition stays default-off and fails closed when disabled", async () => {
  const f = getFixture()
  const baseOptions = getBaseOptions()
  assert.equal(isProtectedMcpServiceEnabled({}), false)
  assert.equal(
    isProtectedMcpServiceEnabled({ TADAZZ_MCP_SERVICE_ENABLED: "false" }),
    false,
  )
  assert.equal(
    isProtectedMcpServiceEnabled({ TADAZZ_MCP_SERVICE_ENABLED: "true" }),
    true,
  )

  const disabled = await createProtectedMcpService({
    ...baseOptions,
    enabled: false,
    configRoot: join(f.root, "nonexistent-disabled-root"),
  })
  assert.equal(disabled.enabled, false)
  assert.deepEqual(disabled.supportedScopes, [])

  for (const [url, method] of [
    [config.resourceMetadataUrl, "GET"],
    [`${origin}/.well-known/oauth-authorization-server/oauth`, "GET"],
    [`${origin}/oauth/jwks.json`, "GET"],
    [`${origin}/oauth/token`, "POST"],
    [`${origin}/oauth/native-save/inspect`, "POST"],
    [config.resource, "POST"],
  ] as const) {
    const response = await disabled.fetch(
      new Request(url, {
        method,
        headers: { host: new URL(origin).host },
      }),
    )
    assert.equal(response.status, 404)
    assert.equal(response.headers.get("cache-control"), "no-store")
    assert.equal(
      response.headers.get("content-security-policy"),
      "frame-ancestors 'none'",
    )
  }

  await disabled.drain()
  await disabled.close()
})

test("rejects route collisions and missing rate limiter when enabled", async () => {
  const baseOptions = getBaseOptions()
  await assert.rejects(
    createProtectedMcpService({
      ...baseOptions,
      enabled: true,
      config: {
        issuer: `${origin}/oauth`,
        resource: `${origin}/oauth/token`,
        resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/oauth/token`,
      },
    }),
    /route/i,
  )

  await assert.rejects(
    createProtectedMcpService({
      ...baseOptions,
      enabled: true,
      rateLimit:
        undefined as unknown as ProtectedMcpServiceOptions["rateLimit"],
    }),
    /rate/i,
  )
})

test("routes OAuth metadata, PKCE, remote SDK tools, catalog, export and native-save consent end-to-end", async () => {
  const f = getFixture()
  const realNativeOps = await createFirstPartyNativeSaveOperations(f.root)
  assert.equal(typeof realNativeOps.lookup, "function")
  assert.equal(typeof realNativeOps.create, "function")

  const service = await buildService({
    catalog: {
      locale: () => "en",
      translate: (name, lang) => translator.t(name, { lng: lang }),
    },
    exportPolicy: {
      authoring: policy,
      canExport: () => true,
    },
    nativeSave: {
      consentPageUrl: `${origin}/studio/native-save-consent`,
      operations: createSyntheticTestNativePort(),
    },
  })

  const asMeta = await service.fetch(
    new Request(`${origin}/.well-known/oauth-authorization-server/oauth`, {
      headers: { host: new URL(origin).host },
    }),
  )
  assert.equal(asMeta.status, 200)
  assert.equal(
    ((await asMeta.json()) as { issuer: string }).issuer,
    config.issuer,
  )

  const prMeta = await service.fetch(
    new Request(config.resourceMetadataUrl, {
      headers: { host: new URL(origin).host },
    }),
  )
  assert.equal(prMeta.status, 200)
  const prJson = (await prMeta.json()) as {
    resource: string
    authorization_servers: string[]
  }
  assert.equal(prJson.resource, config.resource)
  assert.deepEqual(prJson.authorization_servers, [config.issuer])

  const unauthMcp = await service.fetch(
    new Request(config.resource, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  )
  assert.equal(unauthMcp.status, 401)
  assert.match(
    unauthMcp.headers.get("www-authenticate") ?? "",
    /resource_metadata=/u,
  )

  const tokensA = await authorizeAndToken(service, f.sessions[0])
  const tokensB = await authorizeAndToken(service, f.sessions[1])
  const clientA = await connectMcp(service, tokensA.access_token)
  const clientB = await connectMcp(service, tokensB.access_token)

  try {
    const listedTools = await clientA.listTools()
    assert.equal(listedTools.tools.length, 8)

    const themes = (
      await clientA.callTool({
        name: "list_themes",
        arguments: { contractVersion: "0.1.0" },
      })
    ).structuredContent as {
      ok: boolean
      data: {
        items: Array<{
          themeId: string
          title: string
          previewAvailable: boolean
          exportPermitted: boolean
        }>
      }
    }
    assert.equal(themes.ok, true)
    assert.deepEqual(
      themes.data.items.map((item) => item.title),
      getNativeShowLibrary().families.map((family) =>
        showThemeText(
          family.definition,
          family.definition.nameKey,
          "en",
          (name) => translator.t(name, { lng: "en" }),
        ),
      ),
    )
    assert.ok(themes.data.items.every((item) => !item.previewAvailable))

    const templates = (
      await clientA.callTool({
        name: "list_game_templates",
        arguments: { contractVersion: "0.1.0" },
      })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(templates.ok, false)
    assert.equal(templates.error.code, "DEPENDENCY_UNAVAILABLE")

    const created = (
      await clientA.callTool({
        name: "create_game_draft",
        arguments: createInput("Phase 3 composed show"),
      })
    ).structuredContent as {
      ok: boolean
      data: { draftId: string; revision: number }
    }
    assert.equal(created.ok, true)
    assert.equal(created.data.revision, 1)

    const foreignRead = (
      await clientB.callTool({
        name: "get_game_draft",
        arguments: {
          contractVersion: "0.1.0",
          draftId: created.data.draftId,
        },
      })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(foreignRead.ok, false)
    assert.equal(foreignRead.error.code, "NOT_FOUND")

    const updated = (
      await clientA.callTool({
        name: "update_game_draft",
        arguments: {
          contractVersion: "0.1.0",
          draftId: created.data.draftId,
          expectedRevision: 1,
          authoredShowJson: createInput("Phase 3 edited Q3").authoredShowJson,
          idempotencyKey: key(),
        },
      })
    ).structuredContent as { ok: boolean; data: { revision: number } }
    assert.equal(updated.ok, true)
    assert.equal(updated.data.revision, 2)

    const previewMissing = (
      await clientA.callTool({
        name: "preview_game",
        arguments: {
          contractVersion: "0.1.0",
          draftId: created.data.draftId,
          expectedRevision: 2,
        },
      })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(previewMissing.ok, false)
    assert.equal(previewMissing.error.code, "PREVIEW_UNAVAILABLE")

    const exported = (
      await clientA.callTool({
        name: "export_game",
        arguments: {
          contractVersion: "0.1.0",
          draftId: created.data.draftId,
          expectedRevision: 2,
          format: "tada-json",
          idempotencyKey: key(),
        },
      })
    ).structuredContent as {
      ok: boolean
      data: { downloadUrl: string; sha256: string; bytes: number }
    }
    assert.equal(exported.ok, true)
    const downloaded = await service.fetch(
      new Request(exported.data.downloadUrl, {
        headers: { host: new URL(origin).host },
      }),
    )
    assert.equal(downloaded.status, 200)
    assert.equal(downloaded.headers.get("cache-control"), "no-store")
    const downloadBody = await downloaded.text()
    assert.equal(
      createHash("sha256").update(downloadBody).digest("hex"),
      exported.data.sha256,
    )
    assert.equal(
      (JSON.parse(downloadBody) as { title: string }).title,
      "Phase 3 edited Q3",
    )

    const saveKey = key()
    const saveArgs = {
      contractVersion: "0.1.0",
      draftId: created.data.draftId,
      expectedRevision: 2,
      intent: "createNew",
      idempotencyKey: saveKey,
    }
    const pendingSave = (
      await clientA.callTool({ name: "save_game", arguments: saveArgs })
    ).structuredContent as {
      ok: boolean
      error: {
        code: string
        consentRequestId: string
        consentUrl: string
      }
    }
    assert.equal(pendingSave.ok, false)
    assert.equal(pendingSave.error.code, "CONSENT_REQUIRED")
    const consentUrl = new URL(pendingSave.error.consentUrl)
    const extractedId = nativeSaveRequestIdFromPath(
      consentUrl.pathname,
      consentUrl.search,
      consentUrl.hash,
    )
    assert.equal(extractedId, pendingSave.error.consentRequestId)
    assert.ok(extractedId)

    const foreignSaveClient = createNativeSaveConsentClient({
      issuerBasePath: "/oauth",
      accountId: f.sessions[1].owner,
      getNativeToken: () => f.sessions[1].token,
      request: (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("host", new URL(origin).host)
        headers.set("origin", origin)

        return service.fetch(
          new Request(firstPartyRequestUrl(input), { ...init, headers }),
        )
      },
    })
    await assert.rejects(
      foreignSaveClient.inspect(extractedId),
      (err) => err instanceof NativeSaveConsentError,
    )

    const ownerSaveClient = createNativeSaveConsentClient({
      issuerBasePath: "/oauth",
      accountId: f.sessions[0].owner,
      getNativeToken: () => f.sessions[0].token,
      request: (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("host", new URL(origin).host)
        headers.set("origin", origin)

        return service.fetch(
          new Request(firstPartyRequestUrl(input), { ...init, headers }),
        )
      },
    })
    const saveInspection = await ownerSaveClient.inspect(extractedId)
    assert.equal(saveInspection.state, "pending")
    assert.equal(saveInspection.draftId, created.data.draftId)
    assert.equal(saveInspection.revision, 2)
    const saveApproval = await ownerSaveClient.approve(
      extractedId,
      saveInspection,
    )
    assert.equal(saveApproval.state, "approved")

    const saved = (
      await clientA.callTool({ name: "save_game", arguments: saveArgs })
    ).structuredContent as {
      ok: boolean
      data: { quizId: string; studioUrl: string; savedRevision: number }
    }
    assert.equal(saved.ok, true)
    assert.equal(saved.data.savedRevision, 1)
    assert.equal(
      saved.data.studioUrl,
      `${origin}/manager/quizz/${saved.data.quizId}`,
    )

    const replayedSave = (
      await clientA.callTool({ name: "save_game", arguments: saveArgs })
    ).structuredContent as { ok: boolean; data: unknown }
    assert.equal(replayedSave.ok, true)
    assert.deepEqual(replayedSave.data, saved.data)

    const keyReused = (
      await clientA.callTool({
        name: "save_game",
        arguments: { ...saveArgs, expectedRevision: 3 },
      })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(keyReused.ok, false)
    assert.equal(keyReused.error.code, "REQUEST_KEY_REUSED")
  } finally {
    await clientA.close()
    await clientB.close()
  }
})

test("real C1 createNativeCreationPort on Windows fails closed after native-save approval without fake commit", async () => {
  const f = getFixture()
  const ops = await createFirstPartyNativeSaveOperations(f.root)
  const service = await buildService({
    nativeSave: {
      consentPageUrl: `${origin}/studio/native-save-consent`,
      operations: ops,
    },
  })
  const tokens = await authorizeAndToken(service, f.sessions[0])
  const client = await connectMcp(service, tokens.access_token)

  try {
    const created = (
      await client.callTool({
        name: "create_game_draft",
        arguments: createInput("Real C1 fence check"),
      })
    ).structuredContent as { ok: boolean; data: { draftId: string } }
    assert.equal(created.ok, true)

    const saveArgs = {
      contractVersion: "0.1.0",
      draftId: created.data.draftId,
      expectedRevision: 1,
      intent: "createNew",
      idempotencyKey: key(),
    }
    const pending = (
      await client.callTool({ name: "save_game", arguments: saveArgs })
    ).structuredContent as {
      ok: boolean
      error: { code: string; consentRequestId: string }
    }
    assert.equal(pending.error.code, "CONSENT_REQUIRED")

    const saveClient = createNativeSaveConsentClient({
      issuerBasePath: "/oauth",
      accountId: f.sessions[0].owner,
      getNativeToken: () => f.sessions[0].token,
      request: (input, init) => {
        const headers = new Headers(init?.headers)
        headers.set("host", new URL(origin).host)
        headers.set("origin", origin)

        return service.fetch(
          new Request(firstPartyRequestUrl(input), { ...init, headers }),
        )
      },
    })
    const inspected = await saveClient.inspect(pending.error.consentRequestId)
    await saveClient.approve(pending.error.consentRequestId, inspected)

    const outcome = (
      await client.callTool({ name: "save_game", arguments: saveArgs })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(outcome.ok, false)
    assert.equal(outcome.error.code, "DEPENDENCY_UNAVAILABLE")
    assert.equal(existsSync(join(f.root, "quizz")), false)
  } finally {
    await client.close()
  }
})

test("wires V2 preview candidate factory using the issuer's real draftRepository without enabling V1 executable acceptance", async () => {
  const f = getFixture()
  const html =
    '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="stage"></div></body></html>'
  const service = await buildService({
    previewCandidateV2: (drafts) =>
      createPreviewCandidatePortV2(drafts, {
        select: (_principal, draft, locale) =>
          Promise.resolve({
            context: {
              mode: "demo",
              role: "spectator",
              locale: (locale ?? draft.locale ?? "en") as "en",
              reducedMotion: true,
              join: "unavailable-demo",
              actions: "synthetic-only",
            },
            document: withNativePresentationV2(
              {
                format: "tadazz-show-composition",
                schemaVersion: 1,
                selection: {
                  id: "tadazz-classic",
                  version: "1.0.0",
                  overrides: {},
                },
                composition: {
                  schemaVersion: 1,
                  id: "phase3-preview-comp",
                  version: "1.0.0",
                  baseTheme: { id: "tadazz-classic", version: "1.0.0" },
                  registry: { id: "candidate-registry", version: "1.0.0" },
                  sections: {},
                  roles: {},
                  scopes: [],
                },
                scopes: [],
              },
              {
                format: "tadazz-native-presentation-settings",
                schemaVersion: 1,
                defaults: {},
                roles: {},
                cards: [],
              },
            ),
            project(prepared) {
              const card = prepared.draft.show.cards.find(
                (
                  item,
                ): item is Extract<typeof item, { kind: "quiz" | "survey" }> =>
                  item.kind === "quiz" || item.kind === "survey",
              )
              assert.ok(card)
              const qid = getPreviewIdentityId(
                prepared.draft.input.identityMap,
                "questions",
                card.key,
              )
              const clock = {
                epoch: 1,
                sequence: 1,
                elapsedMs: 1000,
                deadlineMs: 20000,
                paused: true,
              }

              return Promise.resolve({
                binding: {
                  draft: prepared.draft,
                  plan: prepared.plan,
                  currentQuestionId: qid,
                  phase: "voting",
                  clock,
                },
                snapshot: {
                  portVersion: 3,
                  identityRuleVersion: 2,
                  source: "deterministic-fixture",
                  phase: "voting",
                  clock,
                  canAnswer: false,
                  question: {
                    id: qid,
                    text: card.question,
                    questionType: card.questionType,
                    playMode: card.kind,
                    choices: card.answers.map((answer, index) => ({
                      id: `${qid}.choice.${index + 1}`,
                      label: answer.text,
                    })),
                    solutionAnswerIds: [],
                  },
                },
              })
            },
          }),
        canPreview: () => true,
      }),
    previewUiResource: {
      html,
      sha256: createHash("sha256").update(html).digest("hex"),
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
      canServe: () => true,
    },
  })

  const tokens = await authorizeAndToken(service, f.sessions[0])
  const client = await connectMcp(service, tokens.access_token)

  try {
    const created = (
      await client.callTool({
        name: "create_game_draft",
        arguments: createInput("Preview V2 composed"),
      })
    ).structuredContent as { ok: boolean; data: { draftId: string } }
    assert.equal(created.ok, true)

    const preview = await client.callTool({
      name: "preview_game",
      arguments: {
        contractVersion: "0.1.0",
        draftId: created.data.draftId,
        expectedRevision: 1,
        locale: "en",
      },
    })
    assert.equal(preview.isError, true)
    const structured = preview.structuredContent as {
      ok: boolean
      error: { code: string }
    }
    assert.equal(structured.error.code, "PREVIEW_UNAVAILABLE")
    const candidate = preview._meta?.[PREVIEW_CANDIDATE_META_V2] as {
      executableAcceptance: boolean
      draftId: string
    }
    assert.equal(candidate.executableAcceptance, false)
    assert.equal(candidate.draftId, created.data.draftId)

    const uiRes = await client.readResource({ uri: PREVIEW_RESOURCE })
    assert.equal((uiRes.contents[0] as { text: string }).text, html)
  } finally {
    await client.close()
  }
})

test("rejects wrong Host, Origin, forwarded headers, unmatched paths, optional default-off endpoints, and revoked sessions", async () => {
  const f = getFixture()
  const service = await buildService()

  for (const [url, method, extraHeaders, expected] of [
    [config.resource, "POST", { host: "evil.example.invalid" }, 403],
    [`${origin}/oauth/token`, "POST", { host: "evil.example.invalid" }, 403],
    [config.resource, "POST", { origin: "https://evil.example.invalid" }, 403],
    [
      `${origin}/oauth/token`,
      "POST",
      { origin: "https://evil.example.invalid" },
      403,
    ],
    [
      config.resource,
      "POST",
      { "x-forwarded-host": "evil.example.invalid" },
      400,
    ],
    [`${origin}/oauth/token`, "POST", { forwarded: "host=evil.invalid" }, 400],
    [config.resource, "GET", {}, 401],
    [`${origin}/unmatched/route`, "GET", {}, 404],
    [`${origin}/oauth/native-save/inspect`, "POST", {}, 404],
    [`${origin}/oauth/downloads/fake-ticket-value`, "GET", {}, 404],
  ] as const) {
    const reqHeaders = new Headers({ host: new URL(origin).host })

    if (method === "POST") {
      reqHeaders.set("content-type", "application/json")
    }

    for (const [headerName, headerValue] of Object.entries(extraHeaders)) {
      reqHeaders.set(headerName, headerValue)
    }

    const response = await service.fetch(
      new Request(url, {
        method,
        headers: reqHeaders,
        ...(method === "POST" ? { body: "{}" } : {}),
      }),
    )
    assert.equal(
      response.status,
      expected,
      `Expected ${expected} for ${method} ${url}`,
    )
  }

  const corsPreflight = await service.fetch(
    new Request(config.resource, {
      method: "OPTIONS",
      headers: {
        host: new URL(origin).host,
        origin: browserOrigin,
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization, content-type",
      },
    }),
  )
  assert.equal(corsPreflight.status, 204)
  assert.equal(
    corsPreflight.headers.get("access-control-allow-origin"),
    browserOrigin,
  )

  const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager")
  const claims = await f.tokens.verifyToken(minted.token)
  assert.ok(claims.sid)
  const session: Session = {
    owner: f.sessions[0].owner,
    sid: claims.sid,
    token: minted.token,
  }
  const tokens = await authorizeAndToken(service, session)
  const methodNotAllowed = await service.fetch(
    new Request(config.resource, {
      method: "GET",
      headers: {
        host: new URL(origin).host,
        authorization: `Bearer ${tokens.access_token}`,
      },
    }),
  )
  assert.equal(methodNotAllowed.status, 405)
  assert.equal(methodNotAllowed.headers.get("allow"), "POST, OPTIONS")

  const client = await connectMcp(service, tokens.access_token)

  try {
    const first = (
      await client.callTool({
        name: "create_game_draft",
        arguments: createInput("Before revoke"),
      })
    ).structuredContent as { ok: boolean }
    assert.equal(first.ok, true)

    f.accounts.revokeAccountSession(session.sid)
    const denied = await service.fetch(
      new Request(config.resource, {
        method: "POST",
        headers: {
          host: new URL(origin).host,
          authorization: `Bearer ${tokens.access_token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
      }),
    )
    assert.equal(denied.status, 401)
  } finally {
    await client.close()
  }

  if (process.platform !== "win32") {
    const dbPath = join(
      f.root,
      "tenants",
      f.sessions[0].owner,
      "extensions/mcp-oauth/grants.sqlite",
    )
    assert.equal(statSync(dbPath).mode & 0o777, 0o600)
    assert.equal(readFileSync(dbPath).length > 0, true)
  }
})

test("enforces bounded principal rate limits, unified 32-slot admission, drain and terminal close", async () => {
  const f = getFixture()
  const boundedLimiter = createPrincipalRateLimiter({
    readsPerMinute: 1,
    mutationsPerMinute: 1,
    maxEntries: 1,
  })
  const principalA = {
    issuer: config.issuer,
    audience: config.resource,
    accountId: f.sessions[0].owner,
    subject: f.sessions[0].owner,
    clientId,
    grantId: "g-a",
    scopes: ["tadazz.catalog.read"],
    expiresAt: Date.now() + 60_000,
    active: true as const,
    accountsEnabled: true as const,
  }
  const principalB = {
    ...principalA,
    accountId: f.sessions[1].owner,
    grantId: "g-b",
  }
  assert.equal(await boundedLimiter(principalA, "list_themes"), true)
  assert.equal(await boundedLimiter(principalA, "list_themes"), false)
  assert.equal(await boundedLimiter(principalB, "list_themes"), true)
  assert.equal(await boundedLimiter(principalA, "list_themes"), true)

  const limiter = createPrincipalRateLimiter({
    readsPerMinute: 2,
    mutationsPerMinute: 1,
    maxEntries: 64,
  })
  const serviceA = await buildService({ rateLimit: limiter })
  const tokensA = await authorizeAndToken(serviceA, f.sessions[0])
  const clientA = await connectMcp(serviceA, tokensA.access_token)

  try {
    const c1 = (
      await clientA.callTool({
        name: "create_game_draft",
        arguments: createInput("Rate limit 1"),
      })
    ).structuredContent as { ok: boolean }
    assert.equal(c1.ok, true)

    const c2 = (
      await clientA.callTool({
        name: "create_game_draft",
        arguments: createInput("Rate limit 2"),
      })
    ).structuredContent as { ok: boolean; error: { code: string } }
    assert.equal(c2.ok, false)
    assert.equal(c2.error.code, "RATE_LIMITED")
  } finally {
    await clientA.close()
  }

  const gate: {
    releaseSlow: () => void
    notifyAllEntered: () => void
  } = {
    releaseSlow: () => undefined,
    notifyAllEntered: () => undefined,
  }
  let entered = 0
  const allEntered = new Promise<void>((resolve) => {
    gate.notifyAllEntered = resolve
  })
  const held = new Promise<void>((resolve) => {
    gate.releaseSlow = resolve
  })

  const boundedService = await buildService({
    rateLimit: async () => {
      entered += 1

      if (entered === 32) {
        gate.notifyAllEntered()
      }

      await held

      return true
    },
  })
  const tokens = await authorizeAndToken(boundedService, f.sessions[0])
  const controllers = Array.from({ length: 32 }, () => new AbortController())
  const pending = controllers.map((controller, index) =>
    boundedService.fetch(
      new Request(config.resource, {
        method: "POST",
        signal: controller.signal,
        headers: {
          host: new URL(origin).host,
          authorization: `Bearer ${tokens.access_token}`,
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: index + 1,
          method: "tools/call",
          params: {
            name: "list_themes",
            arguments: { contractVersion: "0.1.0" },
          },
        }),
      }),
    ),
  )

  await allEntered
  const overflow = await boundedService.fetch(
    new Request(`${origin}/.well-known/oauth-authorization-server/oauth`, {
      headers: { host: new URL(origin).host },
    }),
  )
  assert.equal(overflow.status, 429)

  let drained = false
  const draining = boundedService.drain().then(() => {
    drained = true
  })
  await new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
  assert.equal(drained, false)

  gate.releaseSlow()
  const settled = await Promise.all(pending)
  assert.ok(settled.every((res) => res.status === 200))
  await draining
  assert.equal(drained, true)

  await boundedService.close()
  const afterClose = await boundedService.fetch(
    new Request(`${origin}/.well-known/oauth-authorization-server/oauth`, {
      headers: { host: new URL(origin).host },
    }),
  )
  assert.equal(afterClose.status, 503)
})
