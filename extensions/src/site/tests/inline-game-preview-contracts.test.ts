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

describe("inline consumer source contract, not ACL/executable admission", () => {
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
