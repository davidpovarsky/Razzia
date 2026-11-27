// oxlint-disable init-declarations -- Node before hook initializes the actual issuer and fixture; no fallback authority.
import assert from "node:assert/strict"
import { z } from "zod"
import { readFileSync, lstatSync } from "node:fs"
import { createHash } from "node:crypto"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createBuiltinAssetResolver } from "../../src/mcp-app/native-host/builtin-asset-policy.ts"
import { createFullShowPreviewPortV3 } from "../../src/mcp-app/server/full-show-frame.ts"
import {
  fullShowFrameV3Schema,
  FULL_SHOW_META_V3,
  FULL_SHOW_RESOURCE_V3,
} from "../../src/mcp-app/contracts/full-show-frame.ts"
import { createFullShowConsumerV3 } from "../../src/mcp-app/client/full-show-frame.ts"
import { createFullShowPlayback } from "../../src/mcp-app/client/full-show-playback.ts"
import { fullShowVotingVolume } from "../../src/mcp-app/client/full-show-audio.ts"
import { tadaShowV1Schema } from "../../src/core/show-authoring-schema.ts"
import { after, before, test } from "node:test"
import { createFirstPartyOAuth } from "../../src/mcp-app/first-party/oauth.ts"
import { createFullShowSelectionPortV3 } from "../../src/mcp-app/server/full-show-selection.ts"
import {
  normalizeDraft,
  normalizeStoredDraft,
} from "../../src/mcp-app/server/authoring.ts"
import { hashJson } from "../../src/mcp-app/contracts/canonical.ts"
import { PREVIEW_RESOURCE } from "../../src/mcp-app/contracts/schemas.ts"
import { sha256Hex } from "../../src/core/digest.ts"
import {
  Client,
  StreamableHTTPClientTransport,
} from "../phase3-mcp-service/mcp-client.ts"
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
  return issuer.verifyAccessToken((await grantFor(index, scopes)).accessToken)
}
function grantFor(index: 0 | 1, scopes: readonly string[]) {
  return authorizePkceGrant({
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
test("all roles and nine supported locales retain exact caller context without granting live actions", async () => {
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
    "he",
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
    { ...selection(record), context: { ...context, locale: "xx" } },
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
test("actual issuer and official MCP SDK deliver the reviewed base CSP on the HTML content", async () => {
  const html =
    '<!doctype html><html><head><base href="https://tadazz.com/"></head><body></body></html>'
  const csp = {
    connectDomains: [],
    frameDomains: [],
    resourceDomains: ["https://tadazz.com"],
    baseUriDomains: ["https://tadazz.com"],
  }
  const instance = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      rateLimit: () => Promise.resolve(true),
      previewUiResource: {
        html,
        sha256: sha256Hex(html),
        csp,
        canServe: () => true,
      },
    },
  })
  const grant = await grantFor(0, ["tadazz.drafts.read"])
  const client = new Client({
    name: "full-show-base-csp-local-qa",
    version: "1",
  })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        authProvider: { token: () => Promise.resolve(grant.accessToken) },
        fetch: (input, init) => {
          const request = new Request(input, init)
          assert.equal(new URL(request.url).origin, origin)
          request.headers.set("host", new URL(origin).host)

          return instance.fetch(request)
        },
      }),
    )
    const result = await client.readResource({ uri: PREVIEW_RESOURCE })
    const [content] = result.contents
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- The remote resource may be empty despite optimistic indexed typing.
    assert(content && "text" in content)
    assert.equal(content.text, html)
    const ui = content._meta?.ui as { csp: unknown } | undefined
    assert.deepEqual(ui?.csp, csp)
    assert.doesNotMatch(
      JSON.stringify(result),
      new RegExp(grant.accessToken, "u"),
    )
  } finally {
    await client.close()
    await instance.close()
  }
})

const rendererBuildId = "a".repeat(64)
const fullPort = (
  assertAssets: () => Promise<void> = () => Promise.resolve(),
) =>
  createFullShowPreviewPortV3(
    { drafts: repository, authoring: policy },
    { rendererBuildId, assertAssets },
  )
test("full-show projection inherits trusted native entrance presets across question phases", async () => {
  const data = show("Trusted native motion inheritance")
  const trustedDefaults = tadaShowV1Schema.parse({
    ...data,
    defaults: {
      showTheme: { id: "razzia-original", version: "1.0.0" },
      stageAnimations: {
        questionEntrance: { preset: "slide-up", durationMs: 600 },
        answerEntrance: {
          preset: "cascade",
          durationMs: 650,
          timing: "sequential",
          staggerMs: 90,
        },
        resultsRevealEntrance: { preset: "zoom-soft", durationMs: 700 },
      },
    },
  }).defaults
  assert(trustedDefaults?.stageAnimations)
  const authoring = { ...policy, trustedDefaults }
  const drafts = issuer.draftRepository(authoring)
  const normalized = normalizeDraft(JSON.stringify(data), authoring)
  const record = await drafts.create(a, normalized, mutation(normalized))
  const preview = createFullShowPreviewPortV3(
    { drafts, authoring },
    { rendererBuildId, assertAssets: () => Promise.resolve() },
  )
  const initial = await preview.render(a, selection(record))
  const phases = initial.inventory.chapters.filter(
    (chapter) => chapter.questionOrdinal === 1,
  )
  assert.deepEqual(
    phases.map((chapter) => chapter.kind),
    ["question", "answerCards", "voting", "voteLocked", "results"],
  )
  for (const chapter of phases) {
    const frame = await preview.render(a, {
      ...selection(record),
      chapterId: chapter.id,
    })
    assert(frame.content.kind === "question")
    const inherited = frame.content.visualSettings.stageAnimations
    assert.deepEqual(
      inherited.questionEntrance,
      trustedDefaults.stageAnimations.questionEntrance,
    )
    assert.deepEqual(
      inherited.answerEntrance,
      trustedDefaults.stageAnimations.answerEntrance,
    )
    assert.deepEqual(
      inherited.resultsRevealEntrance,
      trustedDefaults.stageAnimations.resultsRevealEntrance,
    )
    assert(inherited.answerBadgeEntrance)
    assert.equal(inherited.answerBadgeEntrance.preset, "none")
  }
  // Per-card appearance remains forbidden at this authoring boundary. Native
  // resolver precedence is retained; this fix grants no raw model override.
  assert.throws(
    () =>
      normalizeDraft(
        JSON.stringify({
          ...data,
          cards: data.cards.map((card) => ({
            ...card,
            stageAnimations: { questionEntrance: { preset: "none" } },
          })),
        }),
        authoring,
      ),
    /VALIDATION_FAILED/u,
  )
  const afterProjection = await drafts.get(a, record.draftId)
  assert(afterProjection)
  assert.equal(afterProjection.revision, record.revision)
  assert.equal(afterProjection.authoredShowJson, normalized.authoredShowJson)
})

test("native demo transport pauses elapsed time, resumes continuously and explicitly replays question and scene epochs", async () => {
  const record = await created()
  const runtime = fullPort()
  const scene = await runtime.render(a, selection(record))
  const votingId = scene.inventory.chapters.find(
    (chapter) => chapter.kind === "voting",
  )?.id
  assert(votingId)
  const voting = await runtime.render(a, {
    ...selection(record),
    chapterId: votingId,
  })
  let now = 0
  const owner = createFullShowPlayback(() => now)
  const first = owner.select(scene)
  now = 1200
  assert.equal(owner.snapshot().clock.elapsedMs, 1200)
  owner.pause()
  now = 11200
  assert.equal(owner.snapshot().clock.elapsedMs, 1200)
  owner.resume()
  now += 1000
  assert.equal(owner.snapshot().clock.elapsedMs, 2200)
  const replayedScene = owner.select(scene, 1)
  assert.equal(replayedScene.clock.elapsedMs, 0)
  assert(replayedScene.clock.epoch > first.clock.epoch)
  const active = owner.select(voting, 1)
  assert.equal(active.clock.elapsedMs, 0)
  assert(active.clock.deadlineMs !== null && active.clock.deadlineMs > 0)
  now += 600
  const same = owner.select(
    {
      ...voting,
      inventory: {
        ...voting.inventory,
        revision: voting.inventory.revision + 1,
      },
    },
    1,
  )
  assert.equal(
    same.clock.elapsedMs,
    600,
    "An acknowledged volume edit must not restart playback",
  )
  assert.equal(same.audioEpoch, active.audioEpoch)
  owner.pause()
  const replayedQuestion = owner.select(voting, 2)
  assert.equal(replayedQuestion.clock.elapsedMs, 0)
  assert.equal(replayedQuestion.clock.paused, true)
  assert.equal(replayedQuestion.audioEpoch, active.audioEpoch + 1)
  assert(replayedQuestion.clock.epoch > active.clock.epoch)
  const adjacent = owner.select(scene, 2)
  assert.equal(
    adjacent.clock.paused,
    true,
    "Adjacent chapter selection preserves user pause",
  )
  owner.select(null)
  now += 5000
  assert.equal(owner.snapshot().clock.elapsedMs, 0)
})
test("volume editor uses the effective native theme default and explicit override for both families", async () => {
  const projected = await semanticProjectionFixture()
  let { revision } = projected.record
  for (const id of ["tadazz-classic", "razzia-original"] as const) {
    const updated = await projected.commands.patch(
      a,
      {
        contractVersion: "0.1.0",
        draftId: projected.record.draftId,
        expectedRevision: revision,
        idempotencyKey: key(),
        patch: { kind: "select-theme", theme: { id, version: "1.0.0" } },
      },
      { correlationId: key() },
    )
    ;({ revision } = updated)
    const frame = await projected.preview.render(a, {
      ...selection(projected.record),
      expectedRevision: revision,
    })
    assert.equal(fullShowVotingVolume(frame), 0.38)
    assert.equal(
      fullShowVotingVolume({
        ...frame,
        theme: { ...frame.theme, audio: { answersMusic: { volume: 0.2 } } },
      }),
      0.2,
    )
  }
})
test("V3 emits only the selected native chapter and reveals correct answers only in results", async () => {
  const record = await created()
  const runtime = fullPort()
  const first = await runtime.render(a, selection(record))
  assert.equal(first.inventory.chapters.length, 28)
  for (const chapter of first.inventory.chapters) {
    const frame = await runtime.render(a, {
      ...selection(record),
      chapterId: chapter.id,
    })
    assert.equal(fullShowFrameV3Schema.safeParse(frame).success, true)
    assert.equal(frame.inventory.selectedChapterId, chapter.id)
    const text = JSON.stringify(frame)
    assert.doesNotMatch(
      text,
      /PRIVATE_NOTE|private-opening|private-transition|private-ending|authoredShowJson|correctAnswers|solutions|accountId|grantId|defaults/u,
    )

    if (frame.content.kind === "question") {
      const ordinal = chapter.questionOrdinal
      assert(ordinal !== null)
      assert.equal(
        frame.content.frame.question.text,
        `FUTURE_QUESTION_${ordinal - 1}`,
      )
      for (let other = 0; other < 5; other += 1) {
        if (other !== ordinal - 1) {
          assert(!text.includes(`FUTURE_QUESTION_${other}`))
        }
      }

      if (chapter.kind !== "results") {
        assert.equal(frame.content.frame.results, undefined)
      } else {
        assert(frame.content.frame.results?.some((value) => value.correct))
      }

      if (chapter.kind === "question") {
        assert.deepEqual(frame.content.frame.choices, [])
      }
    } else {
      assert.doesNotMatch(text, /FUTURE_QUESTION/u)
      assert.equal(frame.content.scene.kind, chapter.kind)
    }
  }
})
test("V3 rejects foreign authority and player/live context before delivering current data", async () => {
  const record = await created()
  let checked = 0
  const runtime = fullPort(() => {
    checked += 1

    return Promise.resolve()
  })
  await assert.rejects(() => runtime.render({ ...a }, selection(record)))
  await assert.rejects(() => runtime.render(b, selection(record)))
  await assert.rejects(() =>
    runtime.render(a, {
      ...selection(record),
      context: { ...context, role: "player" },
    }),
  )
  assert.equal(checked, 0)
})
test("V3 rechecks actual issuer revision after asynchronous asset admission", async () => {
  const record = await created()
  const changed = normalizeDraft(
    JSON.stringify({ ...authored(), title: "Changed during rights check" }),
    policy,
  )
  const runtime = fullPort(async () => {
    await repository.replace(
      a,
      record.draftId,
      record.revision,
      changed,
      mutation(changed, record),
    )
  })
  await assert.rejects(
    () => runtime.render(a, selection(record)),
    /REVISION_CONFLICT/u,
  )
})
test("V3 denies asset callback failures and missing renderer build identity", async () => {
  const record = await created()
  await assert.rejects(() =>
    fullPort(() => Promise.reject(new Error("Denied"))).render(
      a,
      selection(record),
    ),
  )
  assert.throws(() =>
    createFullShowPreviewPortV3(
      { drafts: repository, authoring: policy },
      {
        rendererBuildId: "unreviewed",
        assertAssets: () => Promise.resolve(),
      },
    ),
  )
})
test("V3 strict consumer binds ticket, exact revision, context, digest, renderer and lifecycle", async () => {
  const record = await created()
  const frame = await fullPort().render(a, selection(record))
  const result = {
    content: [],
    structuredContent: {
      contractVersion: "0.1.0",
      ok: true,
      correlationId: key(),
      data: {
        draftId: record.draftId,
        revision: record.revision,
        title: frame.inventory.title,
        selectedChapterId: frame.inventory.selectedChapterId,
        chapterCount: frame.inventory.chapters.length,
        frameDigest: hashJson(frame),
      },
    },
    _meta: { [FULL_SHOW_META_V3]: frame },
  }
  const input = { ...selection(record), contractVersion: "0.1.0" }
  const consumer = createFullShowConsumerV3(rendererBuildId)
  const ticket = consumer.begin(input)
  assert.deepEqual(consumer.receive(ticket, result), frame)
  const tampered = structuredClone(result)
  tampered._meta[FULL_SHOW_META_V3].rendererBuildId = "b".repeat(64)
  tampered.structuredContent.data.frameDigest = hashJson(
    tampered._meta[FULL_SHOW_META_V3],
  )
  assert.throws(() => consumer.receive(ticket, tampered))
  const injection = { ...frame, authoredShowJson: record.authoredShowJson }
  assert.equal(fullShowFrameV3Schema.safeParse(injection).success, false)
  consumer.cancel()
  assert.equal(consumer.receive(ticket, result), null)
  const later = consumer.begin(input)
  assert.equal(consumer.receive(ticket, result), null)
  assert.deepEqual(consumer.receive(later, result), frame)
  consumer.dispose()
  assert.equal(consumer.receive(later, result), null)
  assert.throws(() => consumer.begin(input))
})
test("official SDK delivers V3 tool frame and static resource, summary and title CAS without raw iframe source", async () => {
  const record = await created()
  const html =
    "<!doctype html><html><body>V3 unit resource; not the browser artifact</body></html>"
  const runtime = fullPort()
  const instance = issuer.remote({
    allowedOrigins: [],
    dependencies: {
      authoring: policy,
      drafts: repository,
      rateLimit: () => Promise.resolve(true),
      fullShowPreviewV3: runtime,
      fullShowUiResourceV3: {
        html,
        sha256: sha256Hex(html),
        csp: { connectDomains: [], frameDomains: [], resourceDomains: [] },
        canServe: () => true,
      },
    },
  })
  const grant = await grantFor(0, ["tadazz.drafts.read", "tadazz.drafts.write"])
  const client = new Client({ name: "full-show-v3-local-qa", version: "1" })

  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        authProvider: { token: () => Promise.resolve(grant.accessToken) },
        fetch: (input, init) => {
          const request = new Request(input, init)
          request.headers.set("host", new URL(origin).host)

          return instance.fetch(request)
        },
      }),
    )
    const raw = await client.callTool({
      name: "preview_show",
      arguments: { ...selection(record), contractVersion: "0.1.0" },
    })
    assert.notEqual(raw.isError, true)
    assert.doesNotMatch(
      JSON.stringify(raw),
      /PRIVATE_NOTE|FUTURE_QUESTION|private-opening|authoredShowJson/u,
    )
    assert.equal(
      (await client.readResource({ uri: FULL_SHOW_RESOURCE_V3 })).contents
        .length,
      1,
    )
    const summary = await client.callTool({
      name: "get_game_draft_summary",
      arguments: { contractVersion: "0.1.0", draftId: record.draftId },
    })
    assert.notEqual(summary.isError, true)
    assert.doesNotMatch(
      JSON.stringify(summary),
      /authoredShowJson|FUTURE_QUESTION|PRIVATE_NOTE/u,
    )
    const changed = await client.callTool({
      name: "update_game_title",
      arguments: {
        contractVersion: "0.1.0",
        draftId: record.draftId,
        expectedRevision: 1,
        idempotencyKey: key(),
        title: "Widget title changed",
      },
    })
    assert.notEqual(changed.isError, true)
    const current = await repository.get(a, record.draftId)
    assert(current)
    assert.equal(current.revision, 2)
    assert.deepEqual(
      tadaShowV1Schema.parse(JSON.parse(current.authoredShowJson)).cards,
      tadaShowV1Schema.parse(JSON.parse(record.authoredShowJson)).cards,
    )
    assert.equal(
      tadaShowV1Schema.parse(JSON.parse(current.authoredShowJson)).title,
      "Widget title changed",
    )
  } finally {
    await client.close()
    await instance.close()
  }
})

test("revoking the actual underlying first-party session invalidates an already prepared frame", async () => {
  const record = await created(b)
  const prepared = await port.prepare(b, selection(record))
  f.accounts.revokeAccountSession(f.sessions[1].sid)
  await assert.rejects(() => port.assertCurrent(b, prepared))
  await assert.rejects(() => port.getHostSource(b, prepared))
})

async function semanticProjectionFixture() {
  const root = fileURLToPath(new URL("../../../", import.meta.url))
  const manifest = z
    .object({
      publicAssets: z.array(
        z.object({
          path: z.string(),
          sha256: z.string(),
          bytes: z.number().int().nonnegative(),
        }),
      ),
    })
    .parse(
      JSON.parse(
        readFileSync(
          new URL(
            "../../src/mcp-app/widget/dist/full-show-artifact.json",
            import.meta.url,
          ),
          "utf8",
        ),
      ),
    )
  const assets = createBuiltinAssetResolver({
    origin: "https://tadazz.com",
    publicAssets: manifest.publicAssets,
    verifyCurrentAsset(entry) {
      const file = resolve(root, entry.path)
      const stat = lstatSync(file)

      if (!stat.isFile() || stat.isSymbolicLink()) {
        return false
      }

      const bytes = readFileSync(file)

      return (
        bytes.length === entry.bytes &&
        createHash("sha256").update(bytes).digest("hex") === entry.sha256
      )
    },
  })
  const authoring = { ...policy, semantic: { assets } }
  const drafts = issuer.draftRepository(authoring)
  const commands = issuer.semanticDraftRepository(authoring)
  const data = authored()
  data.cards = data.cards.map((card) =>
    "answers" in card
      ? {
          ...card,
          answers: ["A", "B", "C", "D", "E"].map((text) => ({ text })),
        }
      : card,
  )
  const normalized = normalizeDraft(JSON.stringify(data), authoring)
  const record = await drafts.create(a, normalized, mutation(normalized))
  const admitted: string[][] = []
  const preview = createFullShowPreviewPortV3(
    { drafts, authoring },
    {
      rendererBuildId,
      assertAssets: (_principal, _theme, urls) => {
        admitted.push([...urls])

        return Promise.resolve()
      },
    },
  )
  const initial = await preview.render(a, selection(record))
  const question = initial.inventory.chapters.find(
    (chapter) => chapter.questionOrdinal === 3 && chapter.kind === "question",
  )
  const answers = initial.inventory.chapters.find(
    (chapter) =>
      chapter.questionOrdinal === 3 && chapter.kind === "answerCards",
  )
  assert(question && answers)
  const selected = await preview.render(a, {
    ...selection(record),
    chapterId: question.id,
  })
  assert.equal(selected.content.kind, "question")
  const choices = await commands.assets(a, {
    contractVersion: "0.1.0",
    draftId: record.draftId,
    expectedRevision: 1,
    purpose: "answer-image",
    locale: "en",
  })
  assert.equal(choices.assets.length, 5)
  await commands.patch(
    a,
    {
      contractVersion: "0.1.0",
      draftId: record.draftId,
      expectedRevision: 1,
      idempotencyKey: key(),
      patch: {
        kind: "set-answer-pictures",
        publicQuestionId: selected.content.frame.question.id,
        pictures: choices.assets.map((choice, index) => ({
          answerNumber: index + 1,
          asset: choice.ref,
          alt: choice.alt || choice.label,
          display: "both" as const,
        })),
      },
    },
    { correlationId: key() },
  )

  return {
    authoring,
    drafts,
    commands,
    record: { ...record, revision: 2 },
    preview,
    question,
    answers,
    assets,
    admitted,
  }
}
test("semantic five-picture projection uses current answer frame only and actual approved public bytes", async () => {
  const projected = await semanticProjectionFixture()
  projected.admitted.length = 0
  const question = await projected.preview.render(a, {
    ...selection(projected.record),
    chapterId: projected.question.id,
  })
  assert.deepEqual(question.presentation.answerVisuals, [])
  assert.deepEqual(projected.admitted, [[]])
  const answers = await projected.preview.render(a, {
    ...selection(projected.record),
    chapterId: projected.answers.id,
  })
  assert.equal(answers.presentation.answerVisuals.length, 5)
  assert.equal(projected.admitted[1].length, 5)
  assert.doesNotMatch(
    JSON.stringify(answers),
    /PRIVATE_NOTE_|FUTURE_QUESTION_[0134]|authoredShowJson|accountId|grantId/u,
  )
})
test("semantic selected media cannot fall back to generic URL allowlist when preview purpose is denied", async () => {
  const projected = await semanticProjectionFixture()
  let invoked = false
  const authoring = {
    ...projected.authoring,
    allowedPublicAssetUrls: new Set(
      projected.assets
        .listAssets(
          {
            theme: { id: "tadazz-classic", version: "1.0.0" },
            purpose: "answer-image",
            operation: "store",
          },
          "en",
        )
        .map((asset) => asset.publicUrl),
    ),
    semantic: {
      assets: {
        ...projected.assets,
        resolveStoredUrl: (
          url: string,
          assetContext: import("../../src/mcp-app/contracts/semantic-edit.ts").SemanticAssetContext,
        ) =>
          assetContext.operation === "preview"
            ? undefined
            : projected.assets.resolveStoredUrl(url, assetContext),
      },
    },
  }
  const preview = createFullShowPreviewPortV3(
    { drafts: projected.drafts, authoring },
    {
      rendererBuildId,
      assertAssets: () => {
        invoked = true

        return Promise.resolve()
      },
    },
  )
  await assert.rejects(() =>
    preview.render(a, {
      ...selection(projected.record),
      chapterId: projected.answers.id,
    }),
  )
  assert.equal(
    invoked,
    false,
    "Denied media must stop before the asynchronous asset reader",
  )
})

test("semantic silhouette projection survives the actual full-show wire without changing admitted image bytes", async () => {
  const projected = await semanticProjectionFixture()
  const stored = await projected.drafts.get(a, projected.record.draftId)
  assert(stored)
  const source = tadaShowV1Schema.parse(JSON.parse(stored.authoredShowJson))
  const original = JSON.parse(stored.authoredShowJson) as typeof source
  let questionOrdinal = 0
  const cards = original.cards.map((card) => {
    if (card.kind !== "quiz" && card.kind !== "survey") return card
    questionOrdinal += 1
    if (questionOrdinal !== 3) return card
    return {
      ...card,
      answers: card.answers.map((answer, index) => ({
        ...answer,
        ...(index < 4 ? { imageTreatment: "silhouette" as const } : {}),
      })),
    }
  })
  const normalized = normalizeStoredDraft(
    JSON.stringify({ ...original, cards }),
    projected.authoring,
  )
  // The write uses the normal authoring allowlist for the exact bundled URLs
  // already verified by semanticProjectionFixture. Preview admission stays on
  // the unchanged semantic resolver and its physical-byte verification.
  const writableDrafts = issuer.draftRepository({
    ...projected.authoring,
    allowedPublicAssetUrls: new Set(
      source.cards.flatMap((card) =>
        card.kind === "quiz" || card.kind === "survey"
          ? card.answers.flatMap((answer) =>
              answer.imageUrl ? [answer.imageUrl] : [],
            )
          : [],
      ),
    ),
  })
  const record = await writableDrafts.replace(
    a,
    stored.draftId,
    stored.revision,
    normalized,
    mutation(normalized, stored),
  )
  projected.admitted.length = 0
  const initial = await projected.preview.render(a, selection(record))
  const answers = initial.inventory.chapters.find(
    (chapter) =>
      chapter.questionOrdinal === 3 && chapter.kind === "answerCards",
  )
  assert(answers)
  const frame = await projected.preview.render(a, {
    ...selection(record),
    chapterId: answers.id,
  })
  const wire = fullShowFrameV3Schema.parse(JSON.parse(JSON.stringify(frame)))
  assert.deepEqual(
    wire.presentation.answerVisuals.map((visual) => visual.imageTreatment),
    ["silhouette", "silhouette", "silhouette", "silhouette", undefined],
  )
  assert.equal(projected.admitted.at(-1)?.length, 5)
  const originalQuestion = source.cards.filter(
    (card) => card.kind === "quiz" || card.kind === "survey",
  )[2]
  assert.deepEqual(
    wire.presentation.answerVisuals.map((visual) => visual.url),
    originalQuestion.answers.map((answer) => answer.imageUrl),
  )
  assert.equal(
    fullShowFrameV3Schema.safeParse({
      ...wire,
      presentation: {
        ...wire.presentation,
        answerVisuals: wire.presentation.answerVisuals.map((visual, index) =>
          index === 0 ? { ...visual, imageTreatment: "blur" } : visual,
        ),
      },
    }).success,
    false,
  )
  assert.doesNotMatch(
    JSON.stringify(wire),
    /PRIVATE_NOTE_|FUTURE_QUESTION_[0134]|authoredShowJson|accountId|grantId/u,
  )
})
