import { describe, expect, it } from "vitest"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "../../core/show-authoring-convert"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import { createEditorPreviewSnapshot } from "./editor-preview-snapshot"

function editorSource() {
  const converted = authoredShowToNativeBundleDraft({
    format: "tada-show",
    version: 1,
    title: "בדיקת עברית QA",
    baseGameMode: "quiz",
    cards: [
      {
        kind: "quiz",
        key: "Q01",
        question: "מה התשובה הנכונה לשאלה QA מספר 12?",
        answers: [{ text: "עברית English 123" }, { text: "English עברית 456" }],
        correctAnswers: [1],
      },
    ],
    settings: [],
  })

  if (!converted.ok || !converted.bundleDraft) {
    throw new Error(JSON.stringify(converted.diagnostics))
  }

  return {
    source: nativeBundleToAuthoredShow(converted.bundleDraft, {
      includePrivateRoster: false,
    }),
    timeline: converted.bundleDraft.extras.timeline,
  }
}

describe("live editor native snapshot boundary", () => {
  it("admits actual unsaved conversion with optional undefined values as native JSON", () => {
    const { source, timeline } = editorSource()
    expect(() => compileFullShowPreviewTimeline(source)).toThrow(
      "show-library:non-json-value",
    )
    const snapshot = createEditorPreviewSnapshot(source, timeline)
    expect(snapshot?.chapters.map((chapter) => chapter.phase)).toEqual([
      "question",
      "answerCards",
      "voting",
      "voteLocked",
      "results",
    ])
    expect(snapshot?.show.cards[0]).toMatchObject({
      question: "מה התשובה הנכונה לשאלה QA מספר 12?",
      answers: [{ text: "עברית English 123" }, { text: "English עברית 456" }],
    })
    expect(() => compileFullShowPreviewTimeline(snapshot?.show)).not.toThrow()
    expect(snapshot?.scopeIds?.Q01).toBeDefined()
    // The form/converter output is neither normalized nor mutated in place.
    expect(Object.hasOwn(source, "note")).toBe(true)
    expect(Object.hasOwn(snapshot?.show ?? {}, "note")).toBe(false)
  })

  it("returns native draft fallback for incomplete fields", () => {
    const { source, timeline } = editorSource()
    const [card] = source.cards

    if (card.kind !== "quiz") {
      throw new Error("Expected quiz fixture")
    }

    card.question = ""
    expect(createEditorPreviewSnapshot(source, timeline)).toBeNull()
  })

  it("keeps a valid current question on the exact engine beside an empty media draft", () => {
    const { source, timeline } = editorSource()
    source.cards.push({
      key: "MEDIA_01",
      kind: "media",
      mediaUrl: "",
      mediaType: "image",
      durationMs: 5000,
      advance: "auto",
    })
    timeline.push({
      id: crypto.randomUUID(),
      kind: "media",
      sceneId: crypto.randomUUID(),
    })
    const snapshot = createEditorPreviewSnapshot(source, timeline, "Q01")
    expect(snapshot?.show.cards.map((card) => card.key)).toEqual(["Q01"])
    expect(authoredShowToNativeBundleDraft(snapshot?.show).ok).toBe(true)
    expect(snapshot?.scopeIds?.Q01).toBe(
      timeline[0].kind === "question" ? timeline[0].questionId : "unexpected",
    )
    expect(source.cards).toHaveLength(2)
  })

  it("retains valid question context while another question is incomplete", () => {
    const { source, timeline } = editorSource()
    const [first] = source.cards

    if (first.kind !== "quiz") {
      throw new Error("Expected quiz fixture")
    }

    source.cards.push({ ...first, key: "Q02", question: "" })
    timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: crypto.randomUUID(),
    })
    expect(createEditorPreviewSnapshot(source, timeline)).toBeNull()
    const snapshot = createEditorPreviewSnapshot(source, timeline, "Q01")
    expect(snapshot?.show.cards.map((card) => card.key)).toEqual(["Q01"])
    expect(authoredShowToNativeBundleDraft(snapshot?.show).ok).toBe(true)
    expect(createEditorPreviewSnapshot(source, timeline, "Q02")).toBeNull()
  })

  it("preserves original question positions around valid native estimation", () => {
    const { source, timeline } = editorSource()
    const [first] = source.cards

    if (first.kind !== "quiz") {
      throw new Error("Expected quiz fixture")
    }

    source.cards.push({
      ...first,
      key: "Q02",
      questionType: "estimation",
      question: "Estimate the number",
      answers: [],
      correctAnswers: [121],
      options: { inputMode: "input", min: 0, max: 200, step: 5, margin: 10 },
    })
    source.cards.push({ ...first, key: "Q03", question: "After estimation" })
    timeline.push(
      {
        id: crypto.randomUUID(),
        kind: "question",
        questionId: crypto.randomUUID(),
      },
      {
        id: crypto.randomUUID(),
        kind: "question",
        questionId: crypto.randomUUID(),
      },
    )
    expect(createEditorPreviewSnapshot(source, timeline)).toBeNull()
    const snapshot = createEditorPreviewSnapshot(source, timeline, "Q03")
    expect(snapshot?.questionPosition).toEqual({ number: 3, total: 3 })
    expect(snapshot?.show.cards.map((card) => card.key)).toEqual(["Q01", "Q03"])
    expect(authoredShowToNativeBundleDraft(snapshot?.show).ok).toBe(true)
  })

  it("returns fallback for mismatched timeline instead of throwing in the editor", () => {
    const { source } = editorSource()
    expect(createEditorPreviewSnapshot(source, [])).toBeNull()
  })

  it("returns fallback for non-serializable draft input", () => {
    const source: { self?: unknown } = {}
    source.self = source
    expect(createEditorPreviewSnapshot(source)).toBeNull()
  })
})
