// oxlint-disable init-declarations -- The actual OAuth issuer is initialized by the isolated fixture hook.
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import {
  createFirstPartyOAuth,
  type FirstPartyOAuthOptions,
} from "../../src/mcp-app/first-party/oauth.ts"
import { createTextDraftExportPolicy } from "../../src/mcp-app/native-host/production-capabilities.ts"
import { dataSchemas, outputs } from "../../src/mcp-app/contracts/tools.ts"
import { dispatch } from "../../src/mcp-app/server/dispatch.ts"
import {
  normalizeDraft,
  normalizeStoredDraft,
} from "../../src/mcp-app/server/authoring.ts"
import { readSemanticShow } from "../../src/mcp-app/server/semantic-state.ts"
import {
  hashJson,
  canonicalJson,
} from "../../src/mcp-app/contracts/canonical.ts"
import {
  semanticPatchInputSchema,
  type SemanticAssetResolver,
  type SemanticAssetRef,
  type SemanticPatch,
} from "../../src/mcp-app/contracts/semantic-edit.ts"
import type {
  AuthoringPolicy,
  DraftRecord,
  NormalizedDraft,
  VerifiedPrincipal,
} from "../../src/mcp-app/server/dependencies.ts"
import { deriveAuthoredShowPreviewIdentityMap } from "../../src/core/show-library/identity.ts"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../../src/core/show-authoring-convert.ts"
import { preflightShowImport } from "../../src/core/index.ts"
import { resolveShowTheme } from "../../src/core/show-themes/resolve.ts"
import { applyThemeAudioDefaults } from "../../src/core/show-themes/audio.ts"
import {
  fixture,
  key,
  origin,
  show,
} from "../../src/mcp-app/tests/first-party/fixtures.ts"
import { authorizePkceGrant } from "../phase3-native-consent/oauth-flow.ts"
import {
  buildMcpOptions,
  createEphemeralOAuthKeys,
} from "../phase3-native-consent/harness.ts"

const theme = { id: "tadazz-classic", version: "1.0.0" }
const assets = [
  {
    assetId: "synthetic-purple",
    sha256: "a".repeat(64),
    purpose: "background",
    publicUrl: `${origin}/public/purple.webp`,
    mime: "image/webp",
  },
  {
    assetId: "synthetic-picture",
    sha256: "b".repeat(64),
    purpose: "answer-image",
    publicUrl: `${origin}/public/picture.png`,
    mime: "image/png",
  },
  {
    assetId: "synthetic-voting",
    sha256: "c".repeat(64),
    purpose: "audio",
    publicUrl: `${origin}/public/voting.mp3`,
    mime: "audio/mpeg",
  },
] as const
let allowReferenceExport = true
const resolver: SemanticAssetResolver = {
  resolveAsset(ref, context) {
    const found = assets.find(
      (asset) =>
        asset.assetId === ref.assetId &&
        asset.sha256 === ref.sha256 &&
        asset.purpose === context.purpose,
    )

    if (
      !found ||
      canonicalJson(ref.theme) !== canonicalJson(theme) ||
      canonicalJson(context.theme) !== canonicalJson(theme) ||
      !["store", "preview", "json-reference-export"].includes(
        context.operation,
      ) ||
      (context.operation === "json-reference-export" && !allowReferenceExport)
    ) {
      return undefined
    }

    return { ref, publicUrl: found.publicUrl }
  },
  resolveStoredUrl(url, context) {
    const found = assets.find(
      (asset) => asset.publicUrl === url && asset.purpose === context.purpose,
    )

    return found
      ? this.resolveAsset(
          { assetId: found.assetId, sha256: found.sha256, theme },
          context,
        )
      : undefined
  },
  listAssets(context) {
    return assets
      .filter((asset) => asset.purpose === context.purpose)
      .flatMap((asset) => {
        const result = this.resolveAsset(
          { assetId: asset.assetId, sha256: asset.sha256, theme },
          context,
        )

        return result
          ? [{ ...result, label: asset.assetId, mime: asset.mime }]
          : []
      })
  },
}
const authoring: AuthoringPolicy = {
  allowedPublicAssetUrls: new Set<string>(),
  semantic: { assets: resolver },
}
const scope = [
  "tadazz.drafts.read",
  "tadazz.drafts.write",
  "tadazz.exports.read",
]
let f: Awaited<ReturnType<typeof fixture>>
let issuer: Awaited<ReturnType<typeof createFirstPartyOAuth>>
let options: FirstPartyOAuthOptions
let repository: ReturnType<typeof issuer.draftRepository>
let semantic: ReturnType<typeof issuer.semanticDraftRepository>
let a: VerifiedPrincipal, b: VerifiedPrincipal
let tokenA: string

async function linked(index: 0 | 1, scopes = scope, instance = issuer) {
  let refreshToken: string | undefined
  const grant = await authorizePkceGrant({
    origin,
    nativeToken: f.sessions[index].token,
    scopes,
    verifyConsentHead: false,
    fetchImpl: async (input, init) => {
      const request = new Request(input, init)
      request.headers.set("host", new URL(origin).host)
      const response = await instance.fetch(request)

      if (new URL(request.url).pathname === "/oauth/token" && response.ok) {
        const value: unknown = await response.clone().json()
        assert(value && typeof value === "object" && "refresh_token" in value)
        assert.equal(typeof value.refresh_token, "string")
        refreshToken = value.refresh_token as string
      }

      return response
    },
  })
  assert(refreshToken)

  return {
    principal: await instance.verifyAccessToken(grant.accessToken),
    token: grant.accessToken,
    refreshToken,
  }
}
before(async () => {
  f = await fixture()
  options = {
    ...buildMcpOptions({ origin, keys: createEphemeralOAuthKeys() }),
    nativeSave: undefined,
    configRoot: f.root,
    exportPolicy: createTextDraftExportPolicy(
      authoring,
      new Set(["tadazz-chatgpt-client"]),
    ),
  }
  issuer = await createFirstPartyOAuth(options)
  repository = issuer.draftRepository(authoring)
  semantic = issuer.semanticDraftRepository(authoring)
  const linkedA = await linked(0),
    linkedB = await linked(1)
  a = linkedA.principal
  b = linkedB.principal
  tokenA = linkedA.token
})
after(() => f.close())
const mutation = (value: NormalizedDraft, current?: DraftRecord) => {
  const idempotencyKey = key()

  return {
    idempotencyKey,
    correlationId: key(),
    inputDigest: hashJson({
      contractVersion: "0.1.0",
      authoredShowJson: value.authoredShowJson,
      idempotencyKey,
      ...(current
        ? { draftId: current.draftId, expectedRevision: current.revision }
        : {}),
    }),
  }
}
const authored = () => {
  const source = show("Semantic fixture")

  return {
    ...source,
    cards: source.cards.map((card, index) => ({
      ...card,
      note: `PRIVATE_NOTE_${index}`,
      answers: [1, 2, 3, 4, 5].map((number) => ({ text: `Choice ${number}` })),
    })),
  }
}
function created() {
  const value = normalizeDraft(canonicalJson(authored()), authoring)

  return repository.create(a, value, mutation(value))
}
const command = (current: DraftRecord, patch: SemanticPatch) =>
  semanticPatchInputSchema.parse({
    contractVersion: "0.1.0",
    draftId: current.draftId,
    expectedRevision: current.revision,
    idempotencyKey: key(),
    patch,
  })
const ref = (index: 0 | 1 | 2): SemanticAssetRef => ({
  assetId: assets[index].assetId,
  sha256: assets[index].sha256,
  theme,
})
function publicQuestion(current: DraftRecord) {
  const map = deriveAuthoredShowPreviewIdentityMap(
    readSemanticShow(current.authoredShowJson),
  )
  const found = map.questions.find((item) => item.authoredKey === "q3")
  assert(found)

  return found.previewId
}
async function loadCurrent(id: string) {
  const value = await repository.get(a, id)
  assert(value)

  return value
}
test("model-facing question refs follow authored order and drive real issuer question/picture edits", async () => {
  const source = authored()
  const keys = ["z-last", "a-first", "q-third", "m-middle", "b-second"]
  const value = normalizeDraft(
    canonicalJson({
      ...source,
      cards: source.cards.map((card, index) => ({ ...card, key: keys[index] })),
    }),
    authoring,
  )
  const original = await repository.create(a, value, mutation(value))
  const deps = { authoring, drafts: repository, semanticDrafts: semantic }
  const config = {
    issuer: `${origin}/oauth`,
    resource: `${origin}/mcp`,
    resourceMetadataUrl: `${origin}/.well-known/oauth-protected-resource`,
  }
  const read = () =>
    dispatch(
      "get_game_draft",
      { contractVersion: "0.1.0", draftId: original.draftId },
      a,
      deps,
      config,
    )
  const first = await read()
  const firstOutput = outputs.get_game_draft.parse(first.structuredContent)
  assert(firstOutput.ok)
  const data = dataSchemas.get_game_draft.parse(firstOutput.data)
  assert.deepEqual(
    data.questionRefs.map((item) => item.questionNumber),
    [1, 2, 3, 4, 5],
  )
  assert.equal(
    new Set(data.questionRefs.map((item) => item.publicQuestionId)).size,
    5,
  )
  const third = data.questionRefs.find((item) => item.questionNumber === 3)
  assert(third)
  assert.deepEqual(Object.keys(third).sort(), [
    "publicQuestionId",
    "questionNumber",
  ])
  const textResult = await dispatch(
    "apply_game_edit",
    command(original, {
      kind: "set-question-text",
      publicQuestionId: third.publicQuestionId,
      text: "Question three selected only from model-visible references",
    }),
    a,
    deps,
    config,
  )
  assert(outputs.apply_game_edit.parse(textResult.structuredContent).ok)
  const edited = await loadCurrent(original.draftId)
  const expected = readSemanticShow(original.authoredShowJson)
  const [, , question] = expected.cards
  assert(question.kind === "quiz")
  question.question =
    "Question three selected only from model-visible references"
  assert.equal(edited.authoredShowJson, canonicalJson(expected))

  const catalog = await dispatch(
    "list_editing_assets",
    {
      contractVersion: "0.1.0",
      draftId: edited.draftId,
      expectedRevision: edited.revision,
      purpose: "answer-image",
      locale: "en",
    },
    a,
    deps,
    config,
  )
  const catalogOutput = outputs.list_editing_assets.parse(
    catalog.structuredContent,
  )
  assert(catalogOutput.ok)
  const [choice] = dataSchemas.list_editing_assets.parse(
    catalogOutput.data,
  ).assets
  assert(choice)
  const pictured = await dispatch(
    "apply_game_edit",
    command(edited, {
      kind: "set-answer-pictures",
      publicQuestionId: third.publicQuestionId,
      pictures: [1, 2, 3, 4, 5].map((answerNumber) => ({
        answerNumber,
        asset: choice.ref,
        alt: "Model-selected approved picture",
        display: "both" as const,
      })),
    }),
    a,
    deps,
    config,
  )
  assert(outputs.apply_game_edit.parse(pictured.structuredContent).ok)
  const final = readSemanticShow(
    (await loadCurrent(original.draftId)).authoredShowJson,
  )
  const [, , finalQuestion] = final.cards
  assert(finalQuestion.kind === "quiz")
  assert(
    finalQuestion.answers.every(
      (answer) => answer.imageUrl === choice.publicUrl,
    ),
  )
  const reread = await read()
  const rereadOutput = outputs.get_game_draft.parse(reread.structuredContent)
  assert(rereadOutput.ok)
  assert.deepEqual(
    dataSchemas.get_game_draft.parse(rereadOutput.data).questionRefs,
    data.questionRefs,
  )
  const foreign = await dispatch(
    "get_game_draft",
    { contractVersion: "0.1.0", draftId: original.draftId },
    b,
    deps,
    config,
  )
  const foreignOutput = outputs.get_game_draft.parse(foreign.structuredContent)
  assert.equal(foreignOutput.ok, false)
  assert.equal(Object.hasOwn(foreignOutput, "data"), false)
})

test("actual issuer changes only the selected question and returns no private source", async () => {
  const original = await created()
  const request = command(original, {
    kind: "set-question-text",
    publicQuestionId: publicQuestion(original),
    text: "Selected new question",
  })
  const result = await semantic.patch(a, request, { correlationId: key() })
  const next = await loadCurrent(original.draftId)
  assert.equal(result.revision, original.revision + 1)
  assert.doesNotMatch(
    JSON.stringify(result),
    /authoredShowJson|PRIVATE_NOTE|correctAnswers/u,
  )
  const expected = readSemanticShow(original.authoredShowJson)
  const card = expected.cards.find((item) => item.key === "q3")
  assert(card?.kind === "quiz")
  card.question = "Selected new question"
  assert.equal(next.authoredShowJson, canonicalJson(expected))
})
test("semantic replay precedes current CAS and a reused key with different command is rejected", async () => {
  const original = await created()
  const request = command(original, { kind: "set-title", title: "First" })
  const first = await semantic.patch(a, request, { correlationId: key() })
  const next = await loadCurrent(original.draftId)
  await semantic.patch(
    a,
    command(next, { kind: "set-title", title: "Second" }),
    { correlationId: key() },
  )
  assert.deepEqual(
    await semantic.patch(a, request, { correlationId: key() }),
    first,
  )
  await assert.rejects(
    semantic.patch(
      a,
      { ...request, patch: { kind: "set-title", title: "Different" } },
      { correlationId: key() },
    ),
    /REQUEST_KEY_REUSED/u,
  )
  await assert.rejects(
    semantic.patch(
      a,
      command(original, { kind: "set-title", title: "Stale" }),
      { correlationId: key() },
    ),
    /REVISION_CONFLICT/u,
  )
  assert.equal((await loadCurrent(original.draftId)).summary.title, "Second")
})
test("persistent undo discovery survives issuer restart and undo appends one idempotent revision", async () => {
  const original = await created()
  const request = command(original, { kind: "set-voting-volume", volume: 0.2 })
  const result = await semantic.patch(a, request, { correlationId: key() })
  assert(result.undoOperationId)
  const reopened = await createFirstPartyOAuth(options)
  const again = await reopened.verifyAccessToken(tokenA)
  const port = reopened.semanticDraftRepository(authoring)
  const state = await port.state(again, {
    contractVersion: "0.1.0",
    draftId: original.draftId,
  })
  assert.equal(state.undoOperationId, result.undoOperationId)
  const undo = {
    contractVersion: "0.1.0" as const,
    draftId: original.draftId,
    expectedRevision: result.revision,
    undoOperationId: result.undoOperationId,
    idempotencyKey: key(),
  }
  const undone = await port.undo(again, undo, { correlationId: key() })
  assert.equal(undone.revision, result.revision + 1)
  assert.deepEqual(
    await port.undo(again, undo, { correlationId: key() }),
    undone,
  )
  assert.equal(
    (await loadCurrent(original.draftId)).authoredShowJson,
    original.authoredShowJson,
  )
  assert.equal(
    (
      await port.state(again, {
        contractVersion: "0.1.0",
        draftId: original.draftId,
      })
    ).undoOperationId,
    undefined,
  )
})
test("voting volume uses native theme/audio resolution and raw model replacement preserves it", async () => {
  const original = await created()
  await semantic.patch(
    a,
    command(original, { kind: "set-voting-volume", volume: 0.15 }),
    { correlationId: key() },
  )
  const enhanced = await loadCurrent(original.draftId)
  const source = readSemanticShow(enhanced.authoredShowJson)
  const resolved = resolveShowTheme({
    selection: source.defaults?.showTheme,
    role: "spectator",
  })
  assert.equal(resolved.audio.answersMusic.volume, 0.15)
  const nativeAudio = applyThemeAudioDefaults(resolved)
  assert.equal(nativeAudio.cues.answersMusic.volume, 0.15)
  assert.equal(
    nativeAudio.soundtrack?.voting,
    undefined,
    "A gain-only edit retains the single answersMusic owner",
  )
  assert.throws(
    () => normalizeDraft(enhanced.authoredShowJson, authoring),
    /VALIDATION_FAILED/u,
  )
  const admitted = normalizeDraft(
    canonicalJson({ ...authored(), title: "Raw content change" }),
    authoring,
  )
  const next = await repository.replace(
    a,
    enhanced.draftId,
    enhanced.revision,
    admitted,
    mutation(admitted, enhanced),
  )
  assert.equal(next.summary.title, "Raw content change")
  const preserved = readSemanticShow(next.authoredShowJson)
  assert.deepEqual(preserved.defaults, source.defaults)
  const preservedAudio = applyThemeAudioDefaults(
    resolveShowTheme({
      selection: preserved.defaults?.showTheme,
      role: "spectator",
    }),
  )
  assert.equal(preservedAudio.cues.answersMusic.volume, 0.15)
  assert.equal(
    preservedAudio.cues.answersMusic.url,
    "/tadazz-show/music/platform/tzila-determined-pursuit-20261105.mp3",
  )
  assert.equal(preservedAudio.soundtrack?.voting, undefined)
  assert.deepEqual(normalizeStoredDraft(next.authoredShowJson, authoring), {
    authoredShowJson: next.authoredShowJson,
    summary: next.summary,
  })
})
test("five approved picture refs preserve answer count, text and correctness and survive native conversion", async () => {
  const original = await created()
  await semantic.patch(
    a,
    command(original, {
      kind: "set-answer-pictures",
      publicQuestionId: publicQuestion(original),
      pictures: [1, 2, 3, 4, 5].map((number) => ({
        answerNumber: number,
        asset: ref(1),
        alt: "Approved synthetic picture",
        display: "both" as const,
      })),
    }),
    { correlationId: key() },
  )
  const changed = await loadCurrent(original.draftId)
  const value = readSemanticShow(changed.authoredShowJson)
  const card = value.cards.find((item) => item.key === "q3")
  assert(card?.kind === "quiz")
  assert.equal(card.answers.length, 5)
  assert.deepEqual(card.correctAnswers, [1])
  assert(
    card.answers.every((answer) => answer.imageUrl === assets[1].publicUrl),
  )
  assert.deepEqual(
    card.answers.map((answer) => answer.text),
    [1, 2, 3, 4, 5].map((n) => `Choice ${n}`),
  )
  const converted = authoredShowToNativeBundleDraft(value)
  assert(converted.ok && converted.bundleDraft)
  assert.throws(
    () => normalizeDraft(changed.authoredShowJson, authoring),
    /VALIDATION_FAILED/u,
  )
  const admitted = normalizeDraft(canonicalJson(authored()), authoring)
  const preserved = await repository.replace(
    a,
    changed.draftId,
    changed.revision,
    admitted,
    mutation(admitted, changed),
  )
  assert.equal(preserved.authoredShowJson, changed.authoredShowJson)
})
test("background/music use exact purpose and theme; failed permission never creates a revision", async () => {
  const original = await created()
  await semantic.patch(
    a,
    command(original, { kind: "set-background", asset: ref(0) }),
    { correlationId: key() },
  )
  const background = await loadCurrent(original.draftId)
  await semantic.patch(
    a,
    command(background, { kind: "set-voting-music", asset: ref(2) }),
    { correlationId: key() },
  )
  const music = await loadCurrent(original.draftId)
  const value = readSemanticShow(music.authoredShowJson)
  assert.equal(value.defaults?.tadazzBackground?.staticUrl, assets[0].publicUrl)
  assert.equal(
    value.defaults.showTheme?.overrides?.audio?.answersMusic?.mediaUrl,
    assets[2].publicUrl,
  )
  await assert.rejects(
    semantic.patch(
      a,
      command(music, { kind: "set-background", asset: ref(2) }),
      { correlationId: key() },
    ),
    /VALIDATION_FAILED/u,
  )
  await assert.rejects(
    semantic.patch(
      a,
      command(music, {
        kind: "select-theme",
        theme: { id: "razzia-original", version: "1.0.0" },
      }),
      { correlationId: key() },
    ),
    /VALIDATION_FAILED/u,
  )
  assert.equal((await loadCurrent(original.draftId)).revision, music.revision)
})
test("actual issuer assets listing is bounded to owner, current grant and exact revision", async () => {
  const original = await created()
  const input = {
    contractVersion: "0.1.0" as const,
    draftId: original.draftId,
    expectedRevision: original.revision,
    purpose: "answer-image" as const,
    locale: "en" as const,
  }
  const listed = await semantic.assets(a, input)
  assert.equal(listed.assets.length, 1)
  assert.equal(listed.assets[0].ref.assetId, assets[1].assetId)
  assert.doesNotMatch(
    JSON.stringify(listed),
    /authoredShowJson|PRIVATE_NOTE|configRoot/u,
  )
  await assert.rejects(semantic.assets(b, input), /NOT_FOUND/u)
  await assert.rejects(
    semantic.assets(a, { ...input, expectedRevision: 2 }),
    /REVISION_CONFLICT/u,
  )
})
test("actual issuer blocks forged principals, missing scope and another grant's undo reference", async () => {
  const original = await created()
  const request = command(original, { kind: "set-title", title: "Scoped" })
  await assert.rejects(
    semantic.patch({ ...a }, request, { correlationId: key() }),
    /SCOPE_REQUIRED/u,
  )
  await assert.rejects(
    semantic.patch(b, request, { correlationId: key() }),
    /NOT_FOUND/u,
  )
  const readOnly = await linked(0, ["tadazz.drafts.read"])
  await assert.rejects(
    semantic.patch(readOnly.principal, request, { correlationId: key() }),
    /SCOPE_REQUIRED/u,
  )
  const changed = await semantic.patch(a, request, { correlationId: key() })
  assert(changed.undoOperationId)
  const otherGrant = await linked(0)
  assert.equal(
    (
      await semantic.state(otherGrant.principal, {
        contractVersion: "0.1.0",
        draftId: original.draftId,
      })
    ).undoOperationId,
    undefined,
  )
  await assert.rejects(
    semantic.undo(
      otherGrant.principal,
      {
        contractVersion: "0.1.0",
        draftId: original.draftId,
        expectedRevision: changed.revision,
        undoOperationId: changed.undoOperationId,
        idempotencyKey: key(),
      },
      { correlationId: key() },
    ),
    /NOT_FOUND/u,
  )
})
test("undo rejects intervening revisions and two concurrent CAS commands cannot both win", async () => {
  const original = await created()
  const initial = await semantic.patch(
    a,
    command(original, { kind: "set-title", title: "Undoable" }),
    { correlationId: key() },
  )
  assert(initial.undoOperationId)
  const previous = await loadCurrent(original.draftId)
  const attempts = await Promise.allSettled(
    ["One", "Two"].map((title) =>
      semantic.patch(a, command(previous, { kind: "set-title", title }), {
        correlationId: key(),
      }),
    ),
  )
  assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1)
  const now = await loadCurrent(original.draftId)
  await assert.rejects(
    semantic.undo(
      a,
      {
        contractVersion: "0.1.0",
        draftId: now.draftId,
        expectedRevision: now.revision,
        undoOperationId: initial.undoOperationId,
        idempotencyKey: key(),
      },
      { correlationId: key() },
    ),
    /REVISION_CONFLICT/u,
  )
})
function downloadExport(url: string): Promise<Response> {
  return issuer.fetch(
    new Request(url, { headers: { host: new URL(origin).host } }),
  )
}
test("JSON reference export delivers approved URLs without media bytes and rechecks permission at download", async () => {
  const original = await created()
  await semantic.patch(
    a,
    command(original, { kind: "set-background", asset: ref(0) }),
    { correlationId: key() },
  )
  const backdrop = await loadCurrent(original.draftId)
  await semantic.patch(
    a,
    command(backdrop, { kind: "set-voting-music", asset: ref(2) }),
    { correlationId: key() },
  )
  const music = await loadCurrent(original.draftId)
  await semantic.patch(
    a,
    command(music, {
      kind: "set-answer-pictures",
      publicQuestionId: publicQuestion(music),
      pictures: [
        {
          answerNumber: 1,
          asset: ref(1),
          alt: "Exported reference",
          display: "both",
        },
      ],
    }),
    { correlationId: key() },
  )
  const enhanced = await loadCurrent(original.draftId)
  assert.throws(
    () => normalizeStoredDraft(enhanced.authoredShowJson, authoring, "export"),
    /VALIDATION_FAILED/u,
  )
  const exportBroker = issuer.exports
  assert(exportBroker)
  for (const format of ["tada-json", "enhanced-bundle"] as const) {
    const input = {
      contractVersion: "0.1.0",
      draftId: enhanced.draftId,
      expectedRevision: enhanced.revision,
      format,
      idempotencyKey: key(),
    }
    const identity = {
      idempotencyKey: input.idempotencyKey,
      correlationId: key(),
      inputDigest: hashJson(input),
    }
    const selection = {
      draftId: enhanced.draftId,
      expectedRevision: enhanced.revision,
    }
    const exported = dataSchemas.export_game.parse(
      await exportBroker.createAuthorizedDownload(
        a,
        selection,
        format,
        identity,
      ),
    )

    const response = await downloadExport(exported.downloadUrl)
    assert.equal(response.status, 200)
    assert.match(
      response.headers.get("content-type") ?? "",
      /^application\/json/u,
    )
    const body = await response.text()
    assert.doesNotMatch(body, /data:(?:image|audio)|base64,|blob:/u)
    for (const asset of assets) {
      assert(body.includes(asset.publicUrl))
    }

    if (format === "tada-json") {
      assert.equal(body, enhanced.authoredShowJson)
    }

    const imported = preflightShowImport(
      body,
      format === "tada-json"
        ? "references.tada.json"
        : "references.enhanced.json",
    )
    assert(imported.ok && imported.normalizedBundleDraft)
    assert.equal(imported.format, format)
    const returned = readSemanticShow(
      JSON.stringify(
        nativeBundleToAuthoredShow(imported.normalizedBundleDraft),
      ),
    )
    const source = readSemanticShow(enhanced.authoredShowJson)
    const content = (value: ReturnType<typeof readSemanticShow>): unknown =>
      JSON.parse(
        JSON.stringify({
          title: value.title,
          defaults: value.defaults,
          // Native conversion intentionally assigns native IDs and sequential authored keys.
          // Preserve complete ordered card content, defaults and media; compare no random IDs.
          cards: value.cards.map(({ key: _key, ...card }) => card),
        }),
      ) as unknown
    assert.deepEqual(content(returned), content(source))

    assert.deepEqual(
      await exportBroker.createAuthorizedDownload(
        a,
        selection,
        format,
        identity,
      ),
      exported,
    )
    allowReferenceExport = false

    try {
      assert.equal((await downloadExport(exported.downloadUrl)).status, 404)
      await assert.rejects(
        exportBroker.createAuthorizedDownload(a, selection, format, identity),
        /EXPORT_UNAVAILABLE/u,
      )
    } finally {
      allowReferenceExport = true
    }
  }
})
test("revoked real grant cannot replay a previously successful semantic command", async () => {
  const own = await linked(0)
  const original = await created()
  const request = command(original, {
    kind: "set-title",
    title: "Before revoke",
  })
  await semantic.patch(own.principal, request, { correlationId: key() })
  const response = await issuer.fetch(
    new Request(`${origin}/oauth/revoke`, {
      method: "POST",
      headers: {
        host: new URL(origin).host,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: "tadazz-chatgpt-client",
        token: own.refreshToken,
      }),
    }),
  )
  assert.equal(response.status, 200)
  await assert.rejects(
    semantic.patch(own.principal, request, { correlationId: key() }),
    /SCOPE_REQUIRED/u,
  )
})

test("stored canonical admission rejects foreign media and unrelated native defaults", async () => {
  const original = await created()
  const base = readSemanticShow(original.authoredShowJson)
  const foreign = "https://foreign.invalid/private.jpg"
  const invalid = [
    {
      ...base,
      defaults: { tadazzBackground: { mode: "static", staticUrl: foreign } },
    },
    {
      ...base,
      defaults: {
        showTheme: {
          ...theme,
          overrides: { audio: { answersMusic: { mediaUrl: foreign } } },
        },
      },
    },
    { ...base, defaults: { motionKit: "goldy-20261105" } },
    {
      ...base,
      cards: base.cards.map((card) =>
        card.kind === "quiz"
          ? {
              ...card,
              answers: card.answers.map((answer) => ({
                ...answer,
                imageUrl: foreign,
              })),
            }
          : card,
      ),
    },
    {
      ...base,
      cards: base.cards.map((card) => ({
        ...card,
        background: { url: assets[0].publicUrl },
      })),
    },
    {
      ...base,
      defaults: {
        tadazzBackground: {
          mode: "static",
          staticUrl: `${assets[0].publicUrl}?override=1`,
        },
      },
    },
  ]
  for (const candidate of invalid) {
    assert.throws(
      () => normalizeStoredDraft(canonicalJson(candidate), authoring),
      /VALIDATION_FAILED/u,
    )
  }
  assert.equal(
    (await loadCurrent(original.draftId)).authoredShowJson,
    original.authoredShowJson,
  )
})

test("theme selection preserves independent audio settings and refuses incompatible existing media", async () => {
  const original = await created()
  await semantic.patch(
    a,
    command(original, { kind: "set-voting-volume", volume: 0.23 }),
    { correlationId: key() },
  )
  const audio = await loadCurrent(original.draftId)
  await semantic.patch(
    a,
    command(audio, {
      kind: "select-theme",
      theme: { id: "razzia-original", version: "1.0.0" },
    }),
    { correlationId: key() },
  )
  const selected = await loadCurrent(original.draftId)
  const source = readSemanticShow(selected.authoredShowJson)
  assert.equal(source.defaults?.showTheme?.id, "razzia-original")
  assert.equal(
    resolveShowTheme({
      selection: source.defaults.showTheme,
      role: "spectator",
    }).audio.answersMusic.volume,
    0.23,
  )
  assert.deepEqual(
    source.cards,
    readSemanticShow(original.authoredShowJson).cards,
  )
  const pictureDraft = await created()
  await semantic.patch(
    a,
    command(pictureDraft, {
      kind: "set-answer-pictures",
      publicQuestionId: publicQuestion(pictureDraft),
      pictures: [
        {
          answerNumber: 1,
          asset: ref(1),
          alt: "Approved picture",
          display: "both",
        },
      ],
    }),
    { correlationId: key() },
  )
  const beforeSwitch = await loadCurrent(pictureDraft.draftId)
  await assert.rejects(
    semantic.patch(
      a,
      command(beforeSwitch, {
        kind: "select-theme",
        theme: { id: "razzia-original", version: "1.0.0" },
      }),
      { correlationId: key() },
    ),
    /VALIDATION_FAILED/u,
  )
  assert.deepEqual(await loadCurrent(pictureDraft.draftId), beforeSwitch)
})
