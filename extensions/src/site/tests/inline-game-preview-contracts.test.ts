import { describe, expect, it, vi } from "vitest"
import {
  canSeekChapter,
  previewSelectionSchema,
  sessionMatchesSelection,
  sourceMatchesSelection,
  type GamePreviewSession,
  type PreviewChapter,
} from "../components/game-preview/contracts"
import { previewPlanSchema } from "../../core/show-library/preview-schemas"
import { getPublicDemo } from "../../core/show-library/public-demo-catalogue"
import { normalizeApplicationPreviewDraft } from "../../core/show-library/application-preview-input"
import { resolveApplicationPreviewPlan } from "../../core/show-library/application-preview-resolve"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import { applicationPreviewFrameSchema } from "../../core/show-library/application-preview-schema"

const selection = { kind: "account-owned", quizId: "quiz-a" } as const
const source = { ...selection, immutableRevision: "fixture-revision-a" }
const chapter: PreviewChapter = {
  id: "opening",
  authoredKey: "opening",
  phase: "opening",
  title: "Fixture opening",
  duration: { kind: "manual" },
  seek: "unavailable",
}

function familySession() {
  const familySelection = {
    kind: "published-demo",
    catalogueId: "family-mixup",
  } as const
  const demo = getPublicDemo(familySelection.catalogueId)

  if (!demo) {
    throw new Error("The reviewed family example is missing")
  }

  const draft = normalizeApplicationPreviewDraft(
    {
      source: { ...familySelection, immutableRevision: "a".repeat(64) },
      show: demo.show,
      assets: [],
    },
    { role: "spectator", locale: "en", reducedMotion: false },
  )
  const session: GamePreviewSession = {
    source: draft.source,
    plan: resolveApplicationPreviewPlan(draft),
    coverage: "full-show",
    sampleData: true,
    chapters: compileFullShowPreviewTimeline(draft.show),
    mount: vi.fn(),
    snapshot: vi.fn(),
    subscribe: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    replay: vi.fn(),
    seekChapter: vi.fn(),
    dispose: vi.fn(),
  }

  return { familySelection, session }
}

describe("inline consumer source contract, not ACL/executable admission", () => {
  it("admits all 261 native chapters of the reviewed 48-question family game", () => {
    const { familySelection, session } = familySession()

    expect(session.plan.resolution.kind).toBe("exact")
    expect(session.plan.capabilities.questions).toHaveLength(48)
    expect(session.chapters).toHaveLength(261)
    expect(session.chapters.at(-1)?.phase).toBe("closing")
    expect(sessionMatchesSelection(session, familySelection)).toBe(true)
    expect(session.mount).not.toHaveBeenCalled()
  })

  it("keeps the native 1024-chapter bound and rejects duplicate or invalid chapters", () => {
    const { familySelection, session } = familySession()
    const chapters = Array.from({ length: 1024 }, (_, index) => ({
      ...chapter,
      id: `bounded-${index}`,
    }))

    expect(
      applicationPreviewFrameSchema.shape.chapterIndex.safeParse(1023).success,
    ).toBe(true)
    expect(
      applicationPreviewFrameSchema.shape.chapterIndex.safeParse(1024).success,
    ).toBe(false)
    expect(
      sessionMatchesSelection({ ...session, chapters }, familySelection),
    ).toBe(true)
    expect(
      sessionMatchesSelection(
        { ...session, chapters: [...chapters, { ...chapter, id: "overflow" }] },
        familySelection,
      ),
    ).toBe(false)

    const invalid: PreviewChapter[][] = [
      [],
      [chapter, chapter],
      [{ ...chapter, id: "" }],
      [{ ...chapter, title: "   " }],
      [{ ...chapter, duration: { kind: "known", milliseconds: 0 } }],
      [{ ...chapter, duration: { kind: "known", milliseconds: Infinity } }],
    ]

    for (const chapters of invalid) {
      expect(
        sessionMatchesSelection({ ...session, chapters }, familySelection),
      ).toBe(false)
    }
    expect(session.mount).not.toHaveBeenCalled()
  })

  it("accepts only a tile ID, never caller-owned scope/revision/role/rights", () => {
    expect(previewSelectionSchema.parse(selection)).toEqual(selection)
    for (const extra of [
      { accountId: "foreign" },
      { immutableRevision: "caller-choice" },
      { role: "manager" },
      { published: true },
      { assetUrl: "https://private.invalid/asset" },
    ]) {
      expect(
        previewSelectionSchema.safeParse({ ...selection, ...extra }).success,
      ).toBe(false)
    }
  })

  it("binds a resolved revision to the requested source identity and kind", () => {
    expect(sourceMatchesSelection(source, selection)).toBe(true)
    expect(
      sourceMatchesSelection({ ...source, quizId: "quiz-b" }, selection),
    ).toBe(false)
    expect(
      sourceMatchesSelection({ ...source, immutableRevision: "" }, selection),
    ).toBe(false)
    expect(
      sourceMatchesSelection(source, {
        kind: "published-demo",
        catalogueId: "quiz-a",
      }),
    ).toBe(false)
    expect(
      previewSelectionSchema.safeParse({ ...selection, quizId: "../foreign" })
        .success,
    ).toBe(false)
  })

  it("cannot promote an unavailable core plan into a stage or seek capability", () => {
    const unavailable = previewPlanSchema.parse({
      portVersion: 3,
      identityRuleVersion: 2,
      resolution: {
        kind: "unavailable",
        requested: { id: "tadazz-classic", version: "1.0.0" },
        effective: null,
        pin: null,
      },
      capabilities: {
        localSelection: false,
        reveal: false,
        results: false,
        leaderboard: false,
        seek: "unavailable",
        supportedRoles: [],
        questions: [],
      },
      diagnostics: [],
    })
    const mount = vi.fn()
    const seekChapter = vi.fn()
    const session: GamePreviewSession = {
      source,
      plan: unavailable,
      coverage: "current-card",
      sampleData: true,
      chapters: [chapter],
      mount,
      snapshot: vi.fn(),
      subscribe: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      replay: vi.fn(),
      seekChapter,
      dispose: vi.fn(),
    }
    expect(sessionMatchesSelection(session, selection)).toBe(false)
    expect(canSeekChapter(session, chapter)).toBe(false)
    expect(mount).not.toHaveBeenCalled()
    expect(seekChapter).not.toHaveBeenCalled()
    expect(chapter.duration).toEqual({ kind: "manual" })
  })
})
