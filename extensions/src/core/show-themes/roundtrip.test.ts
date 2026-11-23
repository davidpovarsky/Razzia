import { describe, expect, it } from "vitest"
import {
  createDefaultQuizExtrasV2,
  quizExtrasV2Schema,
  type QuizExtrasV2,
} from "../studio-timeline-schema"
import { createDefaultShowTheme } from "./selection"
import { computeCanonicalBaseDigest } from "../digest"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../show-authoring-convert"
import { exportTadaShowWorkbook, parseTadaShowWorkbook } from "../show-workbook"
import { preflightShowImport } from "../show-import-preflight"
import { createEnhancedBundle, enhancedBundleSchema } from "../bundle"
import {
  collectQuizMediaReferences,
  detachMediaFromShowData,
} from "../card-media-references"

function fixture() {
  const quizz = {
    gameMode: "quiz" as const,
    subject: "Theme continuity",
    questions: [
      {
        type: "single" as const,
        question: "Which one?",
        answers: ["First", "Second"],
        solutions: [0],
        time: 20,
        cooldown: 3,
        media: undefined,
      },
    ],
  }
  const id = crypto.randomUUID()
  const extras = createDefaultQuizExtrasV2(
    "fixture",
    [id],
    computeCanonicalBaseDigest(quizz),
  )
  const theme = createDefaultShowTheme()
  theme.overrides = {
    audio: { answersMusic: { muted: true } },
    slots: { question: { mediaUrl: "/media/show.png", fit: "contain" } },
  }
  extras.defaults.showTheme = theme
  extras.defaults.showTheme.legacyPolicy = "theme-defaults"
  extras.defaults.themeHistory = [
    {
      id: "archived-theme",
      version: "2.0.0",
      overrides: { audio: { lobby: { muted: true } } },
    },
  ]
  extras.defaults.motionKit = "tadazz-v4"
  extras.defaults.stageAnimations = {
    questionEntrance: {
      preset: "fade",
      durationMs: 800,
      timing: "simultaneous",
      staggerMs: 90,
    },
  }
  extras.perQuestion[id] = {
    themeOverrides: {
      themeId: theme.id,
      themeVersion: theme.version,
      overrides: { slots: { question: { mediaUrl: "/media/question.png" } } },
      history: [
        {
          themeId: "archived-theme",
          themeVersion: "2.0.0",
          overrides: { audio: { showQuestion: { muted: true } } },
        },
      ],
    },
  }
  const sceneId = crypto.randomUUID()
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "transition",
    title: "Break",
    durationMs: 2000,
    advance: "manual",
    themeOverrides: {
      themeId: theme.id,
      themeVersion: theme.version,
      overrides: { audio: { zzTransition: { muted: true } } },
    },
  }
  extras.timeline.unshift({
    id: crypto.randomUUID(),
    kind: "transition",
    sceneId,
  })

  return { quizz, extras, id, sceneId }
}

function assertMetadata(restored: QuizExtrasV2, original: QuizExtrasV2) {
  expect(restored.defaults).toEqual(original.defaults)
  expect(Object.values(restored.perQuestion)[0].themeOverrides).toEqual(
    Object.values(original.perQuestion)[0].themeOverrides,
  )
  expect(Object.values(restored.scenes)[0].themeOverrides).toEqual(
    Object.values(original.scenes)[0].themeOverrides,
  )
}

describe("theme metadata continuity", () => {
  it("survives strict parsing, native bundle serialization and authored JSON with new question IDs", () => {
    const { quizz, extras } = fixture()
    const parsed = quizExtrasV2Schema.parse(extras)
    expect(parsed.defaults.showTheme).toEqual(extras.defaults.showTheme)
    const bundle = enhancedBundleSchema.parse(
      JSON.parse(JSON.stringify(createEnhancedBundle(quizz, extras))),
    )
    const show = nativeBundleToAuthoredShow(bundle)
    const restored = authoredShowToNativeBundleDraft(
      JSON.parse(JSON.stringify(show)),
    )
    expect(restored.diagnostics).toEqual([])
    expect(restored.bundleDraft).toBeDefined()

    if (!restored.bundleDraft) {
      throw new Error("Roundtrip failed")
    }

    assertMetadata(restored.bundleDraft.extras, extras)
    expect(restored.bundleDraft.extras.questionIds).not.toEqual(
      extras.questionIds,
    )
  })

  it("survives XLSX without changing format/version or losing motionKit/scoped overrides", () => {
    const { quizz, extras } = fixture()
    const workbook = exportTadaShowWorkbook({ quizz, extras })
    const show = parseTadaShowWorkbook(workbook)
    expect(show.format).toBe("tada-show")
    expect(show.version).toBe(1)
    const restored = authoredShowToNativeBundleDraft(show)
    expect(restored.ok, JSON.stringify(restored.diagnostics)).toBe(true)

    if (!restored.bundleDraft) {
      throw new Error("Workbook roundtrip failed")
    }

    assertMetadata(restored.bundleDraft.extras, extras)
  })

  it("retains unknown theme IDs on import and reports a repairable display-only fallback", () => {
    const { quizz, extras } = fixture()
    extras.defaults.showTheme = {
      id: "customer-theme-not-installed",
      version: "8.0.0",
      overrides: {},
    }
    const result = preflightShowImport(
      JSON.stringify(createEnhancedBundle(quizz, extras)),
      "show.json",
    )
    expect(result.ok).toBe(true)
    expect(
      result.issues.some((issue) => issue.code === "THEME_unknown-theme"),
    ).toBe(true)
    const saved = result.normalizedBundleDraft?.extras
    expect(
      saved && "defaults" in saved ? saved.defaults.showTheme?.id : null,
    ).toBe("customer-theme-not-installed")
  })

  it("tracks theme media in deletion preflight and detaches only references after explicit force delete", () => {
    const { quizz, extras } = fixture()
    const refs = collectQuizMediaReferences({ id: "fixture", quizz, extras })
    expect(
      refs
        .filter((ref) => ref.field === "show.themeAsset")
        .map((ref) => ref.url)
        .sort(),
    ).toEqual(["/media/question.png", "/media/show.png"])
    const result = detachMediaFromShowData("question.png", quizz, extras)
    expect(result.modified).toBe(true)
    expect(
      collectQuizMediaReferences({
        id: "fixture",
        quizz: result.quizz,
        extras: result.extras,
      }).some((ref) => ref.url === "/media/question.png"),
    ).toBe(false)
    expect(result.extras?.defaults.showTheme).toEqual(extras.defaults.showTheme)
  })

  it("keeps an explicit legacy rollback through authored JSON and XLSX", () => {
    const { quizz, extras } = fixture()
    delete extras.defaults.showTheme
    extras.defaults.motionKit = "legacy"
    const restored = authoredShowToNativeBundleDraft(
      parseTadaShowWorkbook(exportTadaShowWorkbook({ quizz, extras })),
    )
    expect(restored.bundleDraft?.extras.defaults.motionKit).toBe("legacy")
    expect(restored.bundleDraft?.extras.defaults.showTheme).toBeUndefined()
  })
})
