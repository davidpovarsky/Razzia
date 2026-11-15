import assert from "node:assert/strict"
import { before, after, test } from "node:test"
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto"
import fs from "node:fs"
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client"
import { createFirstPartyOAuth } from "../../first-party/oauth.ts"
import { createPreviewCandidatePortV2 } from "../../server/preview-candidate-v2.ts"
import { preparePreviewUiResource } from "../../server/preview-resource.ts"
import { PREVIEW_CANDIDATE_META_V2 } from "../../contracts/preview-candidate-v2.ts"
import { PREVIEW_RESOURCE } from "../../contracts/schemas.ts"
import { hashJson } from "../../contracts/canonical.ts"
import { normalizeDraft } from "../../server/authoring.ts"
import { getPreviewIdentityId } from "../../../core/show-library/identity"
import { withNativePresentationV2 } from "../../../core/show-library/composition-document-v2"
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
let repository: ReturnType<typeof issuer.draftRepository>
let theme = "razzia-original",
  rights = true,
  serve = true,
  player = false,
  foreign = false
let effect: ((p: any, d: any) => Promise<void>) | undefined
let policyEffect: (() => void) | undefined
let policyCalls = 0
let serveError = false
const clientId = "synthetic-preview-consumer",
  callback = "https://host.example.invalid/preview/callback"
const config = {
  issuer: origin + "/oauth",
  resource: origin + "/mcp",
  resourceMetadataUrl: origin + "/.well-known/oauth-protected-resource/mcp",
  firstPartyOrigins: [origin],
}
const html =
  '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="candidate"></div></body></html>'
const publicResults: unknown[] = []
before(async () => {
  f = await fixture()
  const pair = generateKeyPairSync("ed25519")
  issuer = await createFirstPartyOAuth({
    config,
    configRoot: f.root,
    keyId: "synthetic-preview-key",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: origin + "/studio/oauth-consent",
    clients: [
      {
        clientId,
        redirectUris: [callback],
        scopes: ["tadazz.drafts.read", "tadazz.drafts.write"],
      },
    ],
  })
  repository = issuer.draftRepository(policy)
  const candidate = createPreviewCandidatePortV2(repository, {
    async select(p, draft, locale) {
      await effect?.(p, draft)
      return {
        context: {
          mode: "demo",
          role: player ? "player" : "spectator",
          locale: (locale ?? draft.locale ?? "en") as "en",
          reducedMotion: true,
          join: "unavailable-demo",
          actions: "synthetic-only",
        },
        document: withNativePresentationV2(
          {
            format: "tadazz-show-composition",
            schemaVersion: 1,
            selection: { id: theme, version: "1.0.0", overrides: {} },
            composition: {
              schemaVersion: 1,
              id: "qa-composition",
              version: "1.0.0",
              baseTheme: { id: theme, version: "1.0.0" },
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
        async project(prepared) {
          const card = prepared.draft.show.cards.find(
            (c) => c.kind === "quiz" || c.kind === "survey",
          )!
          if (card.kind !== "quiz" && card.kind !== "survey")
            throw Error("fixture card")
          const id = getPreviewIdentityId(
            prepared.draft.input.identityMap,
            "questions",
            card.key,
          )
          const clock = {
            epoch: 1,
            sequence: 1,
            elapsedMs: 5000,
            deadlineMs: 20000,
            paused: true,
          }
          return {
            binding: {
              draft: prepared.draft,
              plan: prepared.plan,
              currentQuestionId: id,
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
                id,
                text: foreign ? "Foreign question" : card.question,
                questionType: card.questionType,
                playMode: card.kind,
                choices: card.answers.map((a, i) => ({
                  id: `${id}.choice.${i + 1}`,
                  label: a.text,
                })),
                solutionAnswerIds: [],
              },
            },
          }
        },
      }
    },
    canPreview() {
      policyCalls++
      policyEffect?.()
      return rights
    },
  })
  remote = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: repository,
      previewCandidateV2: candidate,
      previewUiResource: {
        html,
        sha256: createHash("sha256").update(html).digest("hex"),
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        canServe: () => {
          if (serveError) throw new Error("PRIVATE_RESOURCE_PERMISSION_DETAIL")
          return serve
        },
      },
      rateLimit: async () => true,
    },
  })
})
after(async () => {
  await remote?.close()
  f?.db.close()
  if (process.env.TADAZZ_PREVIEW_QA_OUTPUT)
    fs.writeFileSync(
      process.env.TADAZZ_PREVIEW_QA_OUTPUT,
      JSON.stringify(
        { fixtureRoot: f.root, privateQaOnly: true, results: publicResults },
        null,
        2,
      ) + "\n",
      { flag: "wx" },
    )
})
async function api(
  path: string,
  body?: Record<string, string>,
  session?: Session,
) {
  const json = path.includes("/inspect") || path.includes("/approve")
  return issuer.fetch(
    new Request(origin + path, {
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
async function linked(
  session = f.sessions[0],
  scopes = ["tadazz.drafts.read", "tadazz.drafts.write"],
) {
  const verifier = randomBytes(32).toString("base64url")
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
async function connect(token: string, instance = remote) {
  const client = new Client({
    name: "actual-preview-http-consumer",
    version: "1",
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      authProvider: { token: async () => token },
      fetch: async (input, init) => {
        const request = new Request(input, init)
        request.headers.set("host", new URL(config.resource).host)
        return instance.fetch(request)
      },
    }),
  )
  return client
}
async function created(client: Client) {
  const result = await client.callTool({
    name: "create_game_draft",
    arguments: createInput("Exact candidate source"),
  })
  const data = (result.structuredContent as any).data
  assert.ok(data)
  return data
}
const preview = (client: Client, draft: any, locale = "en") =>
  client.callTool({
    name: "preview_game",
    arguments: {
      contractVersion: "0.1.0",
      draftId: draft.draftId,
      expectedRevision: draft.revision,
      locale,
    },
  })
const meta = (result: any) => result._meta?.[PREVIEW_CANDIDATE_META_V2]

test("official HTTP tool/resource exposes exact real D candidates while frozen V1 result remains unavailable", async () => {
  const c = await connect(await linked())
  try {
    const draft = await created(c)
    const tools = await c.listTools()
    assert.equal(
      (tools.tools.find((t) => t.name === "preview_game")!._meta?.ui as any)
        .resourceUri,
      PREVIEW_RESOURCE,
    )
    const resource = await c.readResource({ uri: PREVIEW_RESOURCE })
    assert.equal((resource.contents[0] as any).text, html)
    assert.deepEqual((resource.contents[0]._meta?.ui as any).csp, {
      connectDomains: [],
      resourceDomains: [],
      frameDomains: [],
    })
    for (const id of ["tadazz-classic", "razzia-original"]) {
      theme = id
      const result = await preview(
        c,
        draft,
        id === "razzia-original" ? "ja" : "en",
      )
      assert.equal(result.isError, true)
      assert.equal(
        (result.structuredContent as any).error.code,
        "PREVIEW_UNAVAILABLE",
      )
      const candidate = meta(result)
      assert.equal(candidate.executableAcceptance, false)
      assert.equal(candidate.input.themeBinding.theme.id, id)
      assert.equal(candidate.draftId, draft.draftId)
      assert.equal(candidate.revision, 1)
      assert.equal(hashJson(candidate.input), candidate.inputDigest)
      assert.equal(Object.keys(candidate.input.themeBinding.slots).length, 15)
      assert.equal(candidate.input.frame.question.text, "Question 1")
      assert.equal(candidate.input.frame.clock.paused, true)
      assert.equal(candidate.input.frame.results, undefined)
      assert.equal(
        JSON.stringify(candidate).includes("solutionAnswerIds"),
        false,
      )
      publicResults.push({
        selection: {
          contractVersion: "0.1.0",
          draftId: draft.draftId,
          expectedRevision: 1,
          locale: candidate.input.locale,
        },
        result,
      })
    }
  } finally {
    await c.close()
  }
})
test("other owner, stale revision and insufficient scope cannot obtain candidate metadata", async () => {
  const c = await connect(await linked())
  const other = await connect(await linked(f.sessions[1]))
  const noRead = await connect(
    await linked(f.sessions[0], ["tadazz.drafts.write"]),
  )
  try {
    const d = await created(c)
    for (const result of [
      await preview(other, d),
      await preview(c, { ...d, revision: 2 }),
      await preview(noRead, d),
    ]) {
      assert.equal(result.isError, true)
      assert.equal(meta(result), undefined)
    }
  } finally {
    await c.close()
    await other.close()
    await noRead.close()
  }
})
test("data policy denial, player role and false current question fail closed without payload", async () => {
  const c = await connect(await linked())
  try {
    const d = await created(c)
    for (const key of ["rights", "player", "foreign"]) {
      rights = key !== "rights"
      player = key === "player"
      foreign = key === "foreign"
      const result = await preview(c, d)
      assert.equal(result.isError, true)
      assert.equal(meta(result), undefined)
    }
  } finally {
    rights = true
    player = false
    foreign = false
    await c.close()
  }
})
test("a draft edit during host selection cannot publish a stale candidate", async () => {
  const c = await connect(await linked())
  try {
    const d = await created(c)
    effect = async (p, old) => {
      effect = undefined
      const next = normalizeDraft(
        createInput("Later revision").authoredShowJson,
        policy,
      )
      const idempotencyKey = key()
      await repository.replace(p, old.draftId, old.revision, next, {
        idempotencyKey,
        inputDigest: hashJson({
          contractVersion: "0.1.0",
          draftId: old.draftId,
          expectedRevision: old.revision,
          authoredShowJson: next.authoredShowJson,
          idempotencyKey,
        }),
        correlationId: key(),
      })
    }
    const result = await preview(c, d)
    assert.equal(meta(result), undefined)
    assert.equal(
      (result.structuredContent as any).error.code,
      "REVISION_CONFLICT",
    )
  } finally {
    effect = undefined
    await c.close()
  }
})
test("session revocation in the final policy callback prevents candidate disclosure", async () => {
  const minted = await f.tokens.mintToken(f.sessions[0].owner, "manager")
  const claims = await f.tokens.verifyToken(minted.token)
  const c = await connect(
    await linked({
      owner: f.sessions[0].owner,
      sid: claims.sid!,
      token: minted.token,
    }),
  )
  try {
    const d = await created(c)
    policyCalls = 0
    policyEffect = () => {
      if (policyCalls === 2) f.accounts.revokeAccountSession(claims.sid!)
    }
    const result = await preview(c, d)
    assert.equal(meta(result), undefined)
    assert.equal(result.isError, true)
  } finally {
    policyEffect = undefined
    await c.close()
  }
})
test("static resource is exact and bounded, and is denied after host permission revocation", async () => {
  assert.throws(() =>
    preparePreviewUiResource({
      html,
      sha256: "0".repeat(64),
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
      canServe: () => true,
    }),
  )
  assert.throws(() =>
    preparePreviewUiResource({
      html,
      sha256: createHash("sha256").update(html).digest("hex"),
      csp: {
        connectDomains: ["https://bad.invalid/path"],
        resourceDomains: [],
        frameDomains: [],
      },
      canServe: () => true,
    }),
  )
  const c = await connect(await linked())
  try {
    serve = false
    await assert.rejects(c.readResource({ uri: PREVIEW_RESOURCE }))
    serve = true
    serveError = true
    await assert.rejects(
      c.readResource({ uri: PREVIEW_RESOURCE }),
      (error) => !String(error).includes("PRIVATE_RESOURCE_PERMISSION_DETAIL"),
    )
  } finally {
    serveError = false
    serve = true
    await c.close()
  }
})

test("actual HTTP resource read admits a 400KiB static artifact without widening tool responses", async () => {
  const artifact = html.replace(
    "</body>",
    "<!--" + "x".repeat(400_000) + "--></body>",
  )
  const instance = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      rateLimit: async () => true,
      previewUiResource: {
        html: artifact,
        sha256: createHash("sha256").update(artifact).digest("hex"),
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        canServe: () => true,
      },
    },
  })
  const c = await connect(await linked(), instance)
  try {
    const result = await c.readResource({ uri: PREVIEW_RESOURCE })
    assert.equal((result.contents[0] as any).text, artifact)
  } finally {
    await c.close()
    await instance.close()
  }
})
