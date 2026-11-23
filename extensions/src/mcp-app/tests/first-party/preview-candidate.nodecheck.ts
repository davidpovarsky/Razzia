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

type PreviewSelectionParameters = Parameters<
  Parameters<typeof createPreviewCandidatePortV2>[1]["select"]
>

function requirePreviewRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid synthetic preview observation record")
  }

  return value as Record<string, unknown>
}

function optionalPreviewRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value === null || value === undefined) {
    return undefined
  }

  return requirePreviewRecord(value)
}

function requirePreviewString(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error("Missing synthetic preview observation text")
  }

  return value
}

function requirePreviewPresent<T>(value: T): NonNullable<T> {
  if (value === null || value === undefined) {
    throw new Error("Missing synthetic preview observation value")
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
type InitializedRepositoryValue = ReturnType<
  InitializedIssuerValue["draftRepository"]
>
let repository: InitializedRepositoryValue | undefined = undefined
function requireInitializedRepository(): InitializedRepositoryValue {
  if (repository === undefined) {
    throw new Error("Fixture state repository was read before initialization")
  }

  return repository
}
let theme = "razzia-original",
  rights = true,
  serve = true,
  player = false,
  foreign = false
let effect:
  | ((
      p: PreviewSelectionParameters[0],
      d: PreviewSelectionParameters[1],
    ) => Promise<void>)
  | undefined = undefined

let policyEffect: (() => void) | undefined = undefined
let policyCalls = 0
let serveError = false
const clientId = "synthetic-preview-consumer",
  callback = "https://host.example.invalid/preview/callback"
const config = {
  issuer: `${origin}/oauth`,
  resource: `${origin}/mcp`,
  resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource/mcp`,
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
    configRoot: requireInitializedF().root,
    keyId: "synthetic-preview-key",
    signingPrivateKeyPem: pair.privateKey
      .export({ type: "pkcs8", format: "pem" })
      .toString(),
    ticketEncryptionKey: randomBytes(32),
    consentPageUrl: `${origin}/studio/oauth-consent`,
    clients: [
      {
        clientId,
        redirectUris: [callback],
        scopes: ["tadazz.drafts.read", "tadazz.drafts.write"],
      },
    ],
  })
  repository = requireInitializedIssuer().draftRepository(policy)
  const candidate = createPreviewCandidatePortV2(
    requireInitializedRepository(),
    {
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
            const card = requirePreviewPresent(
              prepared.draft.show.cards.find(
                (c) => c.kind === "quiz" || c.kind === "survey",
              ),
            )

            if (card.kind !== "quiz" && card.kind !== "survey") {
              throw Error("fixture card")
            }

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
        policyCalls += 1

        policyEffect?.()

        return rights
      },
    },
  )
  remote = requireInitializedIssuer().remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: requireInitializedRepository(),
      previewCandidateV2: candidate,
      previewUiResource: {
        html,
        sha256: createHash("sha256").update(html).digest("hex"),
        csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
        canServe: () => {
          if (serveError) {
            throw new Error("PRIVATE_RESOURCE_PERMISSION_DETAIL")
          }

          return serve
        },
      },
      rateLimit: () => Promise.resolve(true),
    },
  })
})
after(async () => {
  await remote?.close()
  f?.db.close()

  if (process.env.TADAZZ_PREVIEW_QA_OUTPUT) {
    fs.writeFileSync(
      process.env.TADAZZ_PREVIEW_QA_OUTPUT,
      `${JSON.stringify(
        {
          fixtureRoot: requireInitializedF().root,
          privateQaOnly: true,
          results: publicResults,
        },
        null,
        2,
      )}\n`,
      { flag: "wx" },
    )
  }
})
async function api(
  path: string,
  body?: Record<string, string>,
  session?: Session,
) {
  const json = path.includes("/inspect") || path.includes("/approve")

  return requireInitializedIssuer().fetch(
    new Request(origin + path, {
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
async function linked(
  session = requireInitializedF().sessions[0],
  scopes = ["tadazz.drafts.read", "tadazz.drafts.write"],
) {
  const verifier = randomBytes(32).toString("base64url")
  const started = await api(
    `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: callback,
      resource: config.resource,
      scope: scopes.join(" "),
      state: key(),
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    })}`,
  )
  assert.equal(started.status, 302)
  const ticket = requirePreviewPresent(
    new URL(
      requirePreviewPresent(started.headers.get("location")),
    ).searchParams.get("oauth_request"),
  )

  const inspected = requirePreviewRecord(
    await (await api("/oauth/inspect", { ticket }, session)).json(),
  )

  const approved = requirePreviewRecord(
    await (
      await api(
        "/oauth/approve",
        {
          ticket,
          decision: "allow",
          proof: requirePreviewString(inspected.proof),
        },
        session,
      )
    ).json(),
  )
  const token = await api("/oauth/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: callback,
    resource: config.resource,
    code: requirePreviewPresent(
      new URL(requirePreviewString(approved.redirectUrl)).searchParams.get(
        "code",
      ),
    ),
    code_verifier: verifier,
  })
  assert.equal(token.status, 200)

  return requirePreviewString(
    requirePreviewRecord(await token.json()).access_token,
  )
}
async function connect(token: string, instance = requireInitializedRemote()) {
  const client = new Client({
    name: "actual-preview-http-consumer",
    version: "1",
  })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(config.resource), {
      authProvider: { token: () => Promise.resolve(token) },
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
  const data = requirePreviewRecord(
    requirePreviewRecord(result.structuredContent).data,
  )

  assert.ok(data)

  return data
}
const preview = (
  client: Client,
  draft: Record<string, unknown>,
  locale = "en",
) =>
  client.callTool({
    name: "preview_game",
    arguments: {
      contractVersion: "0.1.0",
      draftId: draft.draftId,
      expectedRevision: draft.revision,
      locale,
    },
  })
const meta = (result: unknown) =>
  optionalPreviewRecord(requirePreviewRecord(result)._meta)?.[
    PREVIEW_CANDIDATE_META_V2
  ]

test("official HTTP tool/resource exposes exact real D candidates while frozen V1 result remains unavailable", async () => {
  const c = await connect(await linked())

  try {
    const draft = await created(c)
    const tools = await c.listTools()
    assert.equal(
      requirePreviewRecord(
        requirePreviewPresent(
          tools.tools.find((t) => t.name === "preview_game"),
        )._meta?.ui,
      ).resourceUri,
      PREVIEW_RESOURCE,
    )
    const resource = await c.readResource({ uri: PREVIEW_RESOURCE })
    assert.equal(requirePreviewRecord(resource.contents[0]).text, html)
    assert.deepEqual(requirePreviewRecord(resource.contents[0]._meta?.ui).csp, {
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
        requirePreviewRecord(
          requirePreviewRecord(result.structuredContent).error,
        ).code,
        "PREVIEW_UNAVAILABLE",
      )
      const candidate = requirePreviewRecord(meta(result))
      assert.equal(candidate.executableAcceptance, false)
      assert.equal(
        requirePreviewRecord(
          requirePreviewRecord(
            requirePreviewRecord(candidate.input).themeBinding,
          ).theme,
        ).id,
        id,
      )
      assert.equal(candidate.draftId, draft.draftId)
      assert.equal(candidate.revision, 1)
      assert.equal(hashJson(candidate.input), candidate.inputDigest)
      assert.equal(
        Object.keys(
          requirePreviewRecord(
            requirePreviewRecord(
              requirePreviewRecord(candidate.input).themeBinding,
            ).slots,
          ),
        ).length,
        15,
      )
      assert.equal(
        requirePreviewRecord(
          requirePreviewRecord(requirePreviewRecord(candidate.input).frame)
            .question,
        ).text,
        "Question 1",
      )
      assert.equal(
        requirePreviewRecord(
          requirePreviewRecord(requirePreviewRecord(candidate.input).frame)
            .clock,
        ).paused,
        true,
      )
      assert.equal(
        requirePreviewRecord(requirePreviewRecord(candidate.input).frame)
          .results,
        undefined,
      )
      assert.equal(
        JSON.stringify(candidate).includes("solutionAnswerIds"),
        false,
      )
      publicResults.push({
        selection: {
          contractVersion: "0.1.0",
          draftId: draft.draftId,
          expectedRevision: 1,
          locale: requirePreviewRecord(candidate.input).locale,
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
  const other = await connect(await linked(requireInitializedF().sessions[1]))
  const noRead = await connect(
    await linked(requireInitializedF().sessions[0], ["tadazz.drafts.write"]),
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
    for (const denialKind of ["rights", "player", "foreign"]) {
      rights = denialKind !== "rights"
      player = denialKind === "player"
      foreign = denialKind === "foreign"
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
      await requireInitializedRepository().replace(
        p,
        old.draftId,
        old.revision,
        next,
        {
          idempotencyKey,
          inputDigest: hashJson({
            contractVersion: "0.1.0",
            draftId: old.draftId,
            expectedRevision: old.revision,
            authoredShowJson: next.authoredShowJson,
            idempotencyKey,
          }),
          correlationId: key(),
        },
      )
    }
    const result = await preview(c, d)
    assert.equal(meta(result), undefined)
    assert.equal(
      requirePreviewRecord(requirePreviewRecord(result.structuredContent).error)
        .code,
      "REVISION_CONFLICT",
    )
  } finally {
    effect = undefined
    await c.close()
  }
})
test("session revocation in the final policy callback prevents candidate disclosure", async () => {
  const minted = await requireInitializedF().tokens.mintToken(
    requireInitializedF().sessions[0].owner,
    "manager",
  )
  const claims = await requireInitializedF().tokens.verifyToken(minted.token)
  const c = await connect(
    await linked({
      owner: requireInitializedF().sessions[0].owner,
      sid: requirePreviewPresent(claims.sid),
      token: minted.token,
    }),
  )

  try {
    const d = await created(c)
    policyCalls = 0
    policyEffect = () => {
      if (policyCalls === 2) {
        requireInitializedF().accounts.revokeAccountSession(
          requirePreviewPresent(claims.sid),
        )
      }
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

    `<!--${"x".repeat(400_000)}--></body>`,
  )
  const instance = requireInitializedIssuer().remote({
    allowedOrigins: [],
    dependencies: {
      rateLimit: () => Promise.resolve(true),
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
    assert.equal(requirePreviewRecord(result.contents[0]).text, artifact)
  } finally {
    await c.close()
    await instance.close()
  }
})
