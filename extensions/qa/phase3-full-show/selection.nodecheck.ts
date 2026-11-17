// oxlint-disable init-declarations -- Node before hook initializes the actual issuer and fixture; no fallback authority.
import assert from "node:assert/strict"
import { tadaShowV1Schema } from "../../src/core/show-authoring-schema.ts"
import { after, before, test } from "node:test"
import { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import { createFullShowSelectionPortV3 } from "../../src/mcp-app/server/full-show-selection.ts"
import { normalizeDraft } from "../../src/mcp-app/server/authoring.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { fullShowInventoryV3Schema } from "../../src/mcp-app/contracts/full-show-selection.ts"
import { compileFullShowPreviewTimeline } from "../../src/core/show-library/full-show-preview-timeline.ts"
import {
  deriveAuthoredShowPreviewIdentityMap,
  getPreviewIdentityId,
} from "../../src/core/show-library/identity.ts"
import { authoredShowToNativeBundleDraft } from "../../src/core/show-authoring-convert.ts"
import {
  fixture,
  key,
  origin,
  policy,
  show,
  snapshot,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import { authorizePkceGrant } from "../phase3-native-consent/oauth-flow.ts"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
} from "../phase3-native-consent/harness.ts"
import type {
  DraftRecord,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../../src/mcp-app/server/dependencies.ts"

// Actual local account/session DB, OAuth PKCE protocol and issuer repository.
// The account rows/consent POSTs are controlled QA fixtures, not a live host
// installation or a human browser consent claim.
let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let repository: ReturnType<typeof issuer.draftRepository>
let port: ReturnType<typeof createFullShowSelectionPortV3>
let a: VerifiedPrincipal, b: VerifiedPrincipal
const context = {
  mode: "demo",
  role: "spectator",
  locale: "en",
  reducedMotion: true,
  join: "unavailable-demo",
  actions: "synthetic-only",
} as const
const selection = (record: DraftRecord) => ({
  selectionVersion: 3,
  draftId: record.draftId,
  expectedRevision: record.revision,
  context,
})
const mutation = (draft: NormalizedDraft, selected?: DraftRecord) => {
  const idempotencyKey = key()

  return {
    idempotencyKey,
    inputDigest: hashJson({
      contractVersion: "0.1.0",
      authoredShowJson: draft.authoredShowJson,
      idempotencyKey,
      ...(selected
        ? { draftId: selected.draftId, expectedRevision: selected.revision }
        : {}),
    }),
    correlationId: key(),
  }
}
before(async () => {
  f = await fixture()
  issuer = await createFirstPartyOAuth({
    ...buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
    nativeSave: undefined,
    configRoot: f.root,
  })
  repository = issuer.draftRepository(policy)
  port = createFullShowSelectionPortV3({
    drafts: repository,
    authoring: policy,
  })
  a = await linked(0)
  b = await linked(1)
})
after(() => f.close())
async function linked(
  index: 0 | 1,
  scopes: readonly string[] = ["tadazz.drafts.read", "tadazz.drafts.write"],
) {
  const grant = await authorizePkceGrant({
    origin,
    nativeToken: f.sessions[index].token,
    scopes,
    verifyConsentHead: false,
    fetchImpl: (input, init) => {
      const request = new Request(input, init)
      assert.equal(new URL(request.url).origin, origin)
      request.headers.set("host", new URL(origin).host)

      return issuer.fetch(request)
    },
  })

  return issuer.verifyAccessToken(grant.accessToken)
}
function authored() {
  const original = show("Selection-only full show")

  return {
    ...original,
    cards: [
      {
        key: "private-opening-key",
        kind: "opening",
        title: "Selected opening",
      },
      ...original.cards.map((card, index) => ({
        ...card,
        note: `PRIVATE_NOTE_${index}`,
        question: `FUTURE_QUESTION_${index}`,
      })),
      {
        key: "private-transition-key",
        kind: "transition",
        title: "Private transition",
      },
      { key: "private-ending-key", kind: "closing", title: "Selected closing" },
    ],
  }
}
function created(p = a, data: unknown = authored()) {
  const draft = normalizeDraft(JSON.stringify(data), policy)

  return repository.create(p, draft, mutation(draft))
}
test("inventory uses actual authored order, compiler durations and D identity rule without private chapters", async () => {
  const record = await created()
  const beforeRead = snapshot(f.root)
  const prepared = await port.prepare(a, selection(record))
  assert.equal(await port.assertCurrent(a, prepared), undefined)
  assert.deepEqual(
    snapshot(f.root),
    beforeRead,
    "Selection must not create/update native games or draft families",
  )
  assert.deepEqual(Object.keys(prepared), ["inventory"])
  assert(Object.isFrozen(prepared.inventory.chapters[0]))
  const nativeShow = tadaShowV1Schema.parse(JSON.parse(record.authoredShowJson))
  const compiled = compileFullShowPreviewTimeline(nativeShow)
  const identities = deriveAuthoredShowPreviewIdentityMap(nativeShow)
  assert.equal(prepared.inventory.chapters.length, 28)
  assert.deepEqual(
    prepared.inventory.chapters.map((chapter) => ({
      id: chapter.id,
      kind: chapter.kind,
      duration: chapter.duration,
    })),
    compiled.map((chapter) => ({
      id: `${getPreviewIdentityId(identities, "cards", chapter.authoredKey)}:${chapter.phase}`,
      kind: chapter.phase,
      duration: chapter.duration,
    })),
  )
  const publicText = JSON.stringify(prepared)
  assert.doesNotMatch(
    publicText,
    /PRIVATE_NOTE|FUTURE_QUESTION|Selected opening|Selected closing|private-opening|private-transition|private-ending|correctAnswers|solutions|authoredShowJson|defaults/u,
  )
  assert.equal(
    fullShowInventoryV3Schema.safeParse(prepared.inventory).success,
    true,
  )
})
test("selects exact native current question or scene and never returns a different authored card", async () => {
  const record = await created()
  const first = await port.prepare(a, selection(record))
  const converted = authoredShowToNativeBundleDraft(
    JSON.parse(record.authoredShowJson),
    "mcp-preview",
  )
  assert(converted.ok && converted.bundleDraft)
  for (const chapter of first.inventory.chapters) {
    const selected = await port.prepare(a, {
      ...selection(record),
      chapterId: chapter.id,
    })
    const source = await port.getHostSource(a, selected)
    assert.equal(source.chapter?.id, chapter.id)
    assert.equal(
      source.card.key,
      tadaShowV1Schema.parse(JSON.parse(record.authoredShowJson)).cards[
        chapter.cardOrdinal - 1
      ].key,
    )
    assert.equal("show" in source, false)

    if ("question" in source && source.question) {
      assert.deepEqual(
        source.question,
        converted.bundleDraft.quizz.questions[
          (chapter.questionOrdinal ?? 0) - 1
        ],
      )
      assert.equal("scene" in source, false)
    } else {
      assert("scene" in source && source.scene)
      assert.equal("question" in source, false)
    }
  }
})
test("actual issuer rejects cloned principal, foreign account and lookalike prepared selections", async () => {
  const record = await created()
  const prepared = await port.prepare(a, selection(record))
  await assert.rejects(() => port.prepare({ ...a }, selection(record)))
  await assert.rejects(() => port.prepare(b, selection(record)))
  await assert.rejects(
    () => port.getHostSource(b, prepared),
    /PREVIEW_UNAVAILABLE/u,
  )
  await assert.rejects(
    () => port.getHostSource(a, { ...prepared }),
    /PREVIEW_UNAVAILABLE/u,
  )
  await assert.rejects(
    () =>
      port.assertCurrent(
        a,
        JSON.parse(JSON.stringify(prepared)) as typeof prepared,
      ),
    /PREVIEW_UNAVAILABLE/u,
  )
})
test("same account's different real grant cannot reuse an in-process selection", async () => {
  const record = await created()
  const prepared = await port.prepare(a, selection(record))
  const otherGrant = await linked(0)
  await assert.rejects(
    () => port.getHostSource(otherGrant, prepared),
    /PREVIEW_UNAVAILABLE/u,
  )
  assert((await port.prepare(otherGrant, selection(record))).inventory)
})
test("missing real read scope is rejected by issuer repository", async () => {
  const record = await created()
  const writeOnly = await linked(0, ["tadazz.drafts.write"])
  await assert.rejects(() => port.prepare(writeOnly, selection(record)))
})
test("stale expected revision and edits after selection cannot expose an old frame", async () => {
  const record = await created()
  const prepared = await port.prepare(a, selection(record))
  await assert.rejects(
    () =>
      port.prepare(a, {
        ...selection(record),
        expectedRevision: record.revision + 1,
      }),
    /REVISION_CONFLICT/u,
  )
  const draft = normalizeDraft(JSON.stringify(authored()), policy)
  await repository.replace(
    a,
    record.draftId,
    record.revision,
    draft,
    mutation(draft, record),
  )
  await assert.rejects(
    () => port.getHostSource(a, prepared),
    /REVISION_CONFLICT/u,
  )
})
test("all roles and eight existing locales retain exact caller context without granting live actions", async () => {
  const record = await created()
  for (const locale of [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ] as const) {
    for (const role of ["manager", "player", "spectator"] as const) {
      const wanted = { ...context, locale, role, reducedMotion: false }
      const prepared = await port.prepare(a, {
        ...selection(record),
        context: wanted,
      })
      assert.deepEqual(prepared.inventory.context, wanted)
      assert.equal(
        (await port.getHostSource(a, prepared)).context.actions,
        "synthetic-only",
      )
    }
  }
})
test("strict inputs reject authority, arbitrary chapter, live actions and unsupported identity keys", async () => {
  const record = await created()
  const checkInvalid = (input: unknown) =>
    assert.rejects(() => port.prepare(a, input), /VALIDATION_FAILED/u)
  for (const input of [
    { ...selection(record), accountId: a.accountId },
    {
      ...selection(record),
      chapterId: `preview-card-${"0".repeat(64)}:question`,
    },
    { ...selection(record), context: { ...context, actions: "live" } },
    { ...selection(record), context: { ...context, locale: "he" } },
    {
      ...selection(record),
      context: { ...context, join: "https://arbitrary.invalid" },
    },
  ]) {
    await checkInvalid(input)
  }
  const source = authored()
  const longKey = await created(a, {
    ...source,
    cards: source.cards.map((card, index) =>
      index === 0 ? { ...card, key: "x".repeat(161) } : card,
    ),
  })
  await assert.rejects(
    () => port.prepare(a, selection(longKey)),
    /PREVIEW_UNAVAILABLE/u,
  )
})
test("canonical bookends round-trip while explicitly authored protected media/audio still fail", () => {
  const normalized = normalizeDraft(JSON.stringify(authored()), policy)
  assert.deepEqual(
    normalizeDraft(normalized.authoredShowJson, policy),
    normalized,
  )
  for (const field of [
    "volume",
    "audio",
    "background",
    "lottieUrl",
    "showTheme",
    "stageAnimations",
    "overlayAnimations",
  ] as const) {
    const data = authored()
    let value: unknown = {}

    if (field === "volume") {
      value = 0.8
    }

    if (field === "lottieUrl") {
      value = "https://example.invalid/a.json"
    }

    assert.throws(
      () =>
        normalizeDraft(
          JSON.stringify({
            ...data,
            cards: data.cards.map((card, index) =>
              index === 0 ? { ...card, [field]: value } : card,
            ),
          }),
          policy,
        ),
      /VALIDATION_FAILED/u,
    )
  }
  const trusted = tadaShowV1Schema.parse({
    ...authored(),
    defaults: { showTheme: { id: "tadazz-classic", version: "1.0.0" } },
  }).defaults
  assert(trusted)
  const trustedPolicy = { ...policy, trustedDefaults: trusted }
  const inherited = normalizeDraft(JSON.stringify(authored()), trustedPolicy)
  assert.deepEqual(
    normalizeDraft(inherited.authoredShowJson, trustedPolicy),
    inherited,
  )
  assert.deepEqual(
    tadaShowV1Schema.parse(JSON.parse(inherited.authoredShowJson)).defaults
      ?.showTheme,
    trusted.showTheme,
  )
})
test("abort and a mutable principal during an asynchronous repository read fail closed", async () => {
  const record = await created()
  await assert.rejects(() =>
    port.prepare(a, selection(record), AbortSignal.abort()),
  )
  const mutable = { ...a }
  const unsafeFixturePort = createFullShowSelectionPortV3({
    authoring: policy,
    drafts: {
      ...repository,
      async get() {
        await Promise.resolve()
        mutable.grantId = "mutated-after-read"

        return record
      },
    },
  })
  await assert.rejects(
    () => unsafeFixturePort.prepare(mutable, selection(record)),
    /PREVIEW_UNAVAILABLE/u,
  )
  const prepared = await port.prepare(a, selection(record))
  await assert.rejects(() =>
    port.getHostSource(a, prepared, AbortSignal.abort()),
  )
})
test("revoking the actual underlying first-party session invalidates an already prepared frame", async () => {
  const record = await created(b)
  const prepared = await port.prepare(b, selection(record))
  f.accounts.revokeAccountSession(f.sessions[1].sid)
  await assert.rejects(() => port.assertCurrent(b, prepared))
  await assert.rejects(() => port.getHostSource(b, prepared))
})
