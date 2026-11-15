import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  compositionDocumentDigest,
  parseCompositionDocument,
  type CompositionDocument,
} from "./composition-document"
import {
  compositionDocumentV2Digest,
  parseCompositionDocumentV2,
  withNativePresentationV2,
  type CompositionDocumentV2,
} from "./composition-document-v2"
import {
  assertCompositionPreviewV2,
  getCompositionPreviewDigestContentV2,
  prepareCompositionPreviewV2,
} from "./composition-preview-v2"
import {
  CompositionRepository,
  CompositionRepositoryV2,
  type CompositionDraftKey,
  type CompositionDraftRecord,
  type CompositionPublication,
  type CompositionStorage,
} from "./composition-repository"
import { canonicalJson } from "./digest"
import { getPreviewIdentityId } from "./identity"
import { findNativeShowLibraryFamily } from "./native-library"
import {
  assertCompositionNativePreviewInputV2,
  produceCompositionNativePreviewInputV2,
  resolveCompositionNativeHostThemeV2,
} from "./native-preview-renderer-v2"
import { nativePreviewRendererInputV2Schema } from "./native-preview-renderer-v2-schema"
import {
  nativePreviewFrameV1Schema,
  nativePreviewRendererInputV1Schema,
} from "./native-preview-frame-schema"
import { authoredFixture, previewInputFixture } from "./preview-fixtures"
import { getCompiledPreviewManifest } from "./manifest"

function v1(id = "tadazz-classic"): CompositionDocument {
  return {
    format: "tadazz-show-composition",
    schemaVersion: 1,
    selection: { id, version: "1.0.0", overrides: {} },
    composition: {
      schemaVersion: 1,
      id: "composition-a",
      version: "1.0.0",
      baseTheme: { id, version: "1.0.0" },
      registry: { id: "candidate-registry", version: "1.0.0" },
      sections: {},
      roles: {},
      scopes: [],
    },
    scopes: [],
  }
}
function presentation() {
  return {
    format: "tadazz-native-presentation-settings" as const,
    schemaVersion: 1 as const,
    defaults: {},
    roles: {},
    cards: [],
  }
}
function fixture(
  id = "razzia-original",
  show = authoredFixture(2, 5),
  options: {
    document?: Readonly<CompositionDocumentV2>
    scopeBindings?: unknown
  } = {},
) {
  const input = previewInputFixture(show)
  const document =
    options.document ?? withNativePresentationV2(v1(id), presentation())
  const preview = prepareCompositionPreviewV2(input, document, {
    draftRevision: 4,
    scopeBindings: options.scopeBindings ?? [],
  })
  const [, , card] = preview.draft.show.cards

  if (card.kind !== "quiz" && card.kind !== "survey") {
    throw new Error("fixture")
  }

  const questionId = getPreviewIdentityId(
    preview.draft.input.identityMap,
    "questions",
    card.key,
  )
  const clock = {
    epoch: 3,
    sequence: 1,
    elapsedMs: 500,
    deadlineMs: 20000,
    paused: false,
  }
  const snapshot = {
    portVersion: 3,
    identityRuleVersion: 2,
    source: "deterministic-fixture",
    phase: "voting",
    clock,
    canAnswer: false,
    question: {
      id: questionId,
      text: card.question,
      questionType: card.questionType,
      playMode: card.kind,
      choices: card.answers.map((answer, i) => ({
        id: `${questionId}.choice.${i + 1}`,
        label: answer.text,
      })),
      solutionAnswerIds: [],
    },
  }
  const binding = {
    draft: preview.draft,
    plan: preview.plan,
    currentQuestionId: questionId,
    phase: "voting" as const,
    clock,
  }

  return { input, preview, card, questionId, snapshot, binding }
}

function syntheticStorageKey(recordKey: CompositionDraftKey) {
  return JSON.stringify([recordKey.tenantId, recordKey.draftId])
}

class SyntheticStorage<Document> implements CompositionStorage<Document> {
  drafts = new Map<string, CompositionDraftRecord<Document>>()
  versions = new Map<string, CompositionPublication<Document>>()
  readDraft(recordKey: CompositionDraftKey) {
    return Promise.resolve(
      this.drafts.get(syntheticStorageKey(recordKey)) ?? null,
    )
  }
  compareAndSwapDraft(
    recordKey: CompositionDraftKey,
    expected: number | null,
    next: CompositionDraftRecord<Document>,
  ) {
    if (
      (this.drafts.get(syntheticStorageKey(recordKey))?.revision ?? null) !==
      expected
    ) {
      return Promise.resolve(false)
    }

    this.drafts.set(syntheticStorageKey(recordKey), structuredClone(next))

    return Promise.resolve(true)
  }
  readVersion(recordKey: CompositionDraftKey, version: string) {
    return Promise.resolve(
      this.versions.get(`${syntheticStorageKey(recordKey)}:${version}`) ?? null,
    )
  }
  publishIfRevision(
    recordKey: CompositionDraftKey,
    expected: number,
    next: CompositionPublication<Document>,
  ) {
    if (
      this.drafts.get(syntheticStorageKey(recordKey))?.revision !== expected
    ) {
      return Promise.resolve("revision-conflict" as const)
    }

    const id = `${syntheticStorageKey(recordKey)}:${next.version}`

    if (this.versions.has(id)) {
      return Promise.resolve("version-exists" as const)
    }

    this.versions.set(id, structuredClone(next))

    return Promise.resolve("stored" as const)
  }
}

describe("explicit composition V2 while preserving V1 admission and data", () => {
  it("never widens V1 parsing/digests or silently upgrades the saved object", () => {
    const source = v1(),
      before = JSON.stringify(source),
      digest = compositionDocumentDigest(source)
    const next = withNativePresentationV2(source, presentation())
    expect(next.schemaVersion).toBe(2)
    expect(JSON.stringify(source)).toBe(before)
    expect(compositionDocumentDigest(source)).toBe(digest)
    expect(() => parseCompositionDocument(next)).toThrow()
    expect(() => compositionDocumentDigest(next)).toThrow()
    expect(() => parseCompositionDocumentV2(source)).toThrow()
    expect(compositionDocumentV2Digest(next)).toBe(
      createHash("sha256").update(canonicalJson(next)).digest("hex"),
    )
    expect(
      parseCompositionDocumentV2(JSON.parse(JSON.stringify(next))),
    ).toEqual(next)
  })
  it("opts into the same CAS/content-version engine through an explicit V2 repository", async () => {
    const key = { tenantId: "tenant-a", draftId: "draft-v2" }
    const legacy = new CompositionRepository(
      new SyntheticStorage<CompositionDocument>(),
    )
    const storage = new SyntheticStorage<CompositionDocumentV2>(),
      repository = new CompositionRepositoryV2(storage)
    const document = withNativePresentationV2(v1(), presentation())
    await expect(legacy.save(key, null, document)).rejects.toThrow()
    await expect(repository.save(key, null, v1())).rejects.toThrow()
    await repository.save(key, null, document)
    const results = await Promise.allSettled([
      repository.save(key, 1, document),
      repository.save(key, 1, document),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    const published = await repository.publish(key, 2, "1.0.0")
    expect(published.runtimeAcceptance).toBe("not-evaluated")
    expect((await repository.version(key, "1.0.0"))?.document).toEqual(document)
    await expect(repository.publish(key, 2, "1.0.0")).rejects.toThrow(
      "version-exists",
    )
  })
  it("prepares selected native theme in a copy through the genuine normalizer/identity/plan", () => {
    const f = fixture()
    expect(JSON.parse(f.input.authoredShowJson)).not.toHaveProperty("defaults")
    expect(f.preview.draft.show.defaults?.showTheme?.id).toBe("razzia-original")
    expect(f.preview.plan.resolution.requested.id).toBe("razzia-original")
    expect(f.preview.draft.input.identityMap).toEqual(f.input.identityMap)
    expect(f.preview.plan.resolution.kind).toBe("unavailable")
    expect(getCompiledPreviewManifest().pins).toEqual([])
  })
  it("requires explicit real scope→card associations, including constructor as a source key", () => {
    const show = authoredFixture(2, 5)
    show.cards[2].key = "constructor"
    const document = v1("razzia-original")
    document.scopes.push({
      scopeId: "scope-current",
      selection: {
        themeId: "razzia-original",
        themeVersion: "1.0.0",
        overrides: { audio: { opening: { volume: 0 } } },
      },
    })
    const next = withNativePresentationV2(document, presentation())
    const base = previewInputFixture(show)
    expect(() =>
      prepareCompositionPreviewV2(base, next, { draftRevision: 4 }),
    ).toThrow("scope-association")
    expect(() =>
      prepareCompositionPreviewV2(base, next, {
        draftRevision: 4,
        scopeBindings: [
          { scopeId: "scope-current", authoredCardKey: "not-real" },
        ],
      }),
    ).toThrow("scope-association")
    const f = fixture("razzia-original", show, {
      document: next,
      scopeBindings: [
        { scopeId: "scope-current", authoredCardKey: "constructor" },
      ],
    })
    expect(f.card.themeOverrides).toEqual(document.scopes[0].selection)
    expect(
      resolveCompositionNativeHostThemeV2(f.preview, f.questionId).audio.opening
        .volume,
    ).toBe(0)
  })
})

describe("bound V2 renderer input with the existing asset-free frame", () => {
  it.each(["tadazz-classic", "razzia-original"])(
    "binds actual %s defaults and all15 effective native slots",
    (id) => {
      const f = fixture(id),
        result = produceCompositionNativePreviewInputV2(
          f.preview,
          f.snapshot,
          f.binding,
        )
      expect(result.kind).toBe("candidate")

      if (result.kind !== "candidate") {
        throw new Error("fixture")
      }

      const family = findNativeShowLibraryFamily({ id, version: "1.0.0" })!
      expect(result.input.themeBinding.theme).toEqual(family.ref)
      expect(result.input.themeBinding.definitionSha256).toBe(
        family.definitionSha256,
      )
      expect(Object.keys(result.input.themeBinding.slots)).toHaveLength(15)
      expect(
        nativePreviewFrameV1Schema.safeParse(result.input.frame).success,
      ).toBe(true)
      expect(
        nativePreviewRendererInputV1Schema.safeParse(result.input).success,
      ).toBe(false)
      expect(result.executableAcceptance).toBe(false)
      expect(result.input.frame.seconds).toBe(20)
      expect(JSON.stringify(result.input)).not.toContain("Synthetic question 4")
      expect(JSON.stringify(result.input)).not.toContain("https://")
      expect(() =>
        assertCompositionNativePreviewInputV2(
          f.preview,
          f.binding,
          result.input,
        ),
      ).not.toThrow()
    },
  )
  it("uses native role/card precedence without changing the authoritative clock or replaying on ticks", () => {
    const settings = {
      ...presentation(),
      defaults: {
        stageAnimations: {
          questionEntrance: {
            preset: "fade",
            durationMs: 900,
            timing: "simultaneous",
            staggerMs: 90,
          },
        },
      },
      roles: {
        spectator: {
          stageAnimations: {
            answerEntrance: {
              preset: "cascade",
              durationMs: 1200,
              timing: "sequential",
              staggerMs: 100,
            },
          },
        },
      },
      cards: [
        {
          authoredCardKey: "question-3",
          theme: { id: "razzia-original", version: "1.0.0" },
          settings: {
            stageAnimations: {
              questionEntrance: {
                preset: "none",
                durationMs: 800,
                timing: "simultaneous",
                staggerMs: 90,
              },
            },
          },
          roles: {},
        },
      ],
    }
    const f = fixture("razzia-original", authoredFixture(2, 5), {
      document: withNativePresentationV2(v1("razzia-original"), settings),
    })
    const result = produceCompositionNativePreviewInputV2(
      f.preview,
      f.snapshot,
      f.binding,
    )

    if (result.kind !== "candidate") {
      throw new Error("fixture")
    }

    expect(
      result.input.themeBinding.settings.stageAnimations.questionEntrance
        ?.preset,
    ).toBe("none")
    expect(
      result.input.themeBinding.settings.stageAnimations.answerEntrance?.preset,
    ).toBe("cascade")
    expect(result.input.frame.clock).toEqual({
      elapsedMs: 500,
      deadlineMs: 20000,
      paused: false,
    })
    const clock = { ...f.binding.clock, sequence: 2, elapsedMs: 1000 }
    const next = produceCompositionNativePreviewInputV2(
      f.preview,
      { ...f.snapshot, clock },
      { ...f.binding, clock },
    )

    if (next.kind !== "candidate") {
      throw new Error("fixture")
    }

    expect(next.input.themeBinding).toEqual(result.input.themeBinding)
  })
  it("keeps distinct lone-surrogate source card keys in native settings arrays", () => {
    const show = authoredFixture(2, 5)
    show.cards[2].key = "\ud800"
    show.cards[3].key = "\ud801"
    const settings = {
      ...presentation(),
      cards: ["\ud800", "\ud801"].map((key, i) => ({
        authoredCardKey: key,
        theme: { id: "razzia-original", version: "1.0.0" },
        settings: {
          questionDecoration: {
            enabled: true,
            preset: i ? "pulse-bar" : "shimmer-line",
          },
        },
        roles: {},
      })),
    }
    const f = fixture("razzia-original", show, {
      document: withNativePresentationV2(v1("razzia-original"), settings),
    })
    const result = produceCompositionNativePreviewInputV2(
      f.preview,
      f.snapshot,
      f.binding,
    )

    if (result.kind !== "candidate") {
      throw new Error("fixture")
    }

    expect(result.input.themeBinding.settings.questionDecoration.preset).toBe(
      "shimmer-line",
    )
    expect(f.preview.document.nativePresentation.cards).toHaveLength(2)
  })
  it("rejects cloned host associations and mismatched role/question/revision/family payloads", () => {
    const f = fixture(),
      result = produceCompositionNativePreviewInputV2(
        f.preview,
        f.snapshot,
        f.binding,
      )

    if (result.kind !== "candidate") {
      throw new Error("fixture")
    }

    expect(() => assertCompositionPreviewV2({ ...f.preview })).toThrow(
      "unprepared",
    )
    expect(() =>
      assertCompositionNativePreviewInputV2(
        f.preview,
        f.binding,
        nativePreviewRendererInputV2Schema.parse(result.input),
      ),
    ).toThrow("unbound-native-preview-input")
    for (const patch of [
      { questionId: `preview-question-${"a".repeat(64)}` },
      { draftRevision: 9 },
      { role: "manager" },
      { rendererId: "tadazz-classic-stage" },
    ]) {
      expect(
        nativePreviewRendererInputV2Schema.safeParse({
          ...result.input,
          themeBinding: { ...result.input.themeBinding, ...patch },
        }).success,
      ).toBe(false)
    }
    expect(
      nativePreviewRendererInputV2Schema.safeParse({
        ...result.input,
        definition: {},
      }).success,
    ).toBe(false)
  })
  it("reports unsupported graph/media/active Lottie while preserving the saved document", () => {
    const graph = v1("razzia-original")
    graph.composition.sections.templates = {
      voting: { id: "custom-tree", version: "1.0.0" },
    }
    const f = fixture("razzia-original", authoredFixture(2, 5), {
      document: withNativePresentationV2(graph, presentation()),
    })
    expect(
      produceCompositionNativePreviewInputV2(f.preview, f.snapshot, f.binding),
    ).toMatchObject({
      kind: "unavailable",
      input: null,
      diagnostics: ["composition-registry-adapter-unavailable"],
    })
    const settings = {
      ...presentation(),
      defaults: {
        overlayAnimations: [
          { id: "overlay-a", assetUrl: "/media/test.lottie", enabled: true },
        ],
      },
    }
    const lottie = fixture("razzia-original", authoredFixture(2, 5), {
      document: withNativePresentationV2(v1("razzia-original"), settings),
    })
    expect(
      produceCompositionNativePreviewInputV2(
        lottie.preview,
        lottie.snapshot,
        lottie.binding,
      ),
    ).toMatchObject({
      kind: "unavailable",
      input: null,
      diagnostics: ["native-media-binding-unavailable"],
    })
    expect(
      lottie.preview.document.nativePresentation.defaults.overlayAnimations,
    ).toHaveLength(1)
    expect(getCompiledPreviewManifest().pins).toEqual([])
  })
  it.each([
    { enabled: false, preset: "lottie", expected: "candidate" },
    { enabled: false, preset: "shimmer-line", expected: "candidate" },
    { enabled: true, preset: "shimmer-line", expected: "unavailable" },
    { enabled: true, preset: "lottie", expected: "unavailable" },
  ] as const)(
    "handles retained decoration URL with enabled=$enabled/preset=$preset as $expected",
    ({ enabled, preset, expected }) => {
      const lottieUrl = "/media/retained-decoration.lottie"
      const document = withNativePresentationV2(v1("razzia-original"), {
        ...presentation(),
        defaults: { questionDecoration: { enabled, preset, lottieUrl } },
      })
      const saved = canonicalJson(document)
      const f = fixture("razzia-original", authoredFixture(2, 5), { document })
      const result = produceCompositionNativePreviewInputV2(
        f.preview,
        f.snapshot,
        f.binding,
      )

      expect(result.kind).toBe(expected)
      expect(canonicalJson(document)).toBe(saved)
      expect(canonicalJson(f.preview.document)).toBe(saved)
      expect(
        document.nativePresentation.defaults.questionDecoration?.lottieUrl,
      ).toBe(lottieUrl)
      expect(JSON.stringify(result)).not.toContain(lottieUrl)

      if (result.kind === "candidate") {
        expect(result.input.themeBinding.settings.questionDecoration).toEqual({
          enabled: false,
          preset: "none",
        })
        expect(
          nativePreviewRendererInputV2Schema.safeParse({
            ...result.input,
            themeBinding: {
              ...result.input.themeBinding,
              settings: {
                ...result.input.themeBinding.settings,
                questionDecoration: {
                  ...result.input.themeBinding.settings.questionDecoration,
                  lottieUrl,
                },
              },
            },
          }).success,
        ).toBe(false)
      } else {
        expect(result).toEqual({
          kind: "unavailable",
          input: null,
          diagnostics: ["native-media-binding-unavailable"],
          executableAcceptance: false,
        })
      }
    },
  )
  it("returns exact versioned composition content for F's existing canonical digest path", () => {
    const f = fixture(),
      content = getCompositionPreviewDigestContentV2(f.preview)
    expect(content.schemaVersion).toBe(2)
    expect(content.compositionDocumentSha256).toBe(
      compositionDocumentV2Digest(f.preview.document),
    )
    expect(content.compositionDocument).toEqual(f.preview.document)
    expect(content.preview.normalizedAuthoredContent).toEqual(
      JSON.parse(f.preview.draft.normalizedAuthoredShowJson),
    )
    expect(Object.hasOwn(content, "mcpDigest")).toBe(false)
    expect(Object.hasOwn(content, "previewDigest")).toBe(false)
  })
})
