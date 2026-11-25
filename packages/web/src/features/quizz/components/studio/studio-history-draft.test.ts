import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
  type QuizExtrasV2,
} from "@razzia/extensions/core"
import { quizzValidator } from "@razzia/common/validators/quizz"
import { describe, expect, it } from "vitest"
import {
  createStudioHistory,
  isStudioSnapshot,
  moveStudioHistory,
  recordStudioEdit,
  studioContent,
  type StudioSnapshot,
} from "./studio-snapshot"
import {
  isStudioDraftStale,
  readStudioDrafts,
  removeStudioDraft,
  studioDraftKey,
  writeStudioDraft,
  type DraftStorage,
  type StudioDraft,
} from "./studio-draft-storage"

const ids = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
]
const sceneId = "33333333-3333-4333-8333-333333333333"
const duplicateId = "44444444-4444-4444-8444-444444444444"
function fixture(): StudioSnapshot & { extras: QuizExtrasV2 } {
  const values = {
    subject: "Authored show",
    gameMode: "quiz" as const,
    questions: ids.map((_, index) => ({
      type: "single" as const,
      question: `Question ${index + 1}`,
      answers: ["Yes", "No"],
      solutions: [index],
      cooldown: 2,
      time: 20,
    })),
  }
  const extras = createDefaultQuizExtrasV2(
    "quiz-one",
    [...ids],
    computeCanonicalBaseDigest(values),
  )
  extras.perQuestion[ids[0]] = {
    answerVisuals: [
      {
        answerIndex: 0,
        display: "image",
        url: "/media/original.png",
        alt: "Original image",
      },
    ],
  }
  extras.timeline.push({ id: sceneId, kind: "answerRecap", sceneId })
  extras.scenes[sceneId] = {
    id: sceneId,
    kind: "answerRecap",
    startQuestionId: ids[0],
    title: "Recap",
    mode: "mostSelected",
    maxItemsPerPage: 4,
    showCounts: true,
    showPercentages: true,
    durationMs: 8000,
    advance: "auto",
  }

  return {
    values,
    extras,
    questionIds: [...ids],
    selectedTimelineId: extras.timeline[0].id,
    currentIndex: 0,
  }
}
function storage(): DraftStorage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}
function record(overrides: Partial<StudioDraft> = {}): StudioDraft {
  const snapshot = fixture()

  return {
    version: 1,
    id: "editor-instance-one",
    scope: { ownerId: "owner-one", quizzId: "quiz-one" },
    savedAt: 1000,
    baseline: {
      revision: snapshot.extras.revision,
      baseDigest: snapshot.extras.baseDigest,
    },
    snapshot,
    ...overrides,
  }
}

describe("Studio composite structural history", () => {
  it("accepts incomplete authoring and rejects broken linked identities", () => {
    const incomplete = fixture()
    incomplete.values.subject = ""
    incomplete.values.questions[0].question = ""
    incomplete.values.questions[0].answers = ["", ""]
    expect(isStudioSnapshot(incomplete)).toBe(true)
    incomplete.questionIds.reverse()
    expect(isStudioSnapshot(incomplete)).toBe(false)
  })

  it("retains omitted solutions in valid survey drafts through storage and history", () => {
    const captured = fixture()
    captured.values.gameMode = "survey"
    for (const question of captured.values.questions) {
      delete question.solutions
    }
    captured.extras.baseDigest = computeCanonicalBaseDigest(captured.values)
    expect(quizzValidator.safeParse(captured.values).success).toBe(true)
    expect(isStudioSnapshot(captured)).toBe(true)

    const local = storage()
    const draft = record({
      snapshot: captured,
      baseline: {
        revision: captured.extras.revision,
        baseDigest: captured.extras.baseDigest,
      },
    })
    writeStudioDraft(local, draft)
    const recovered = readStudioDrafts(local, draft.scope)
    expect(recovered.invalid).toBe(false)
    expect(recovered.drafts).toHaveLength(1)
    const restored = recovered.drafts[0].snapshot as StudioSnapshot & {
      extras: QuizExtrasV2
    }
    expect(restored).toEqual(captured)
    expect(isStudioSnapshot(restored)).toBe(true)
    expect(
      restored.values.questions.every(
        (question) => !Object.hasOwn(question, "solutions"),
      ),
    ).toBe(true)

    const after = structuredClone(restored)
    after.values.questions.reverse()
    after.questionIds.reverse()
    after.extras.questionIds.reverse()
    after.extras.timeline = [
      after.extras.timeline[1],
      after.extras.timeline[0],
      after.extras.timeline[2],
    ]
    const history = recordStudioEdit(createStudioHistory(), restored, after)
    const edited = structuredClone(after)
    edited.values.questions[1].question = "Keep later survey text"
    const undo = moveStudioHistory(history, edited, "undo")!
    expect(undo.snapshot.questionIds).toEqual(ids)
    expect(undo.snapshot.values.questions[0].question).toBe(
      "Keep later survey text",
    )
    const redo = moveStudioHistory(undo.history, undo.snapshot, "redo")!
    expect(redo.snapshot.questionIds).toEqual(after.questionIds)
    expect(redo.snapshot.values.questions).toEqual(edited.values.questions)
    for (const result of [undo.snapshot, redo.snapshot]) {
      expect(isStudioSnapshot(result)).toBe(true)
      expect(
        result.values.questions.every(
          (question) => !Object.hasOwn(question, "solutions"),
        ),
      ).toBe(true)
    }
  })

  it("undoes mixed reorder atomically while retaining later text, audio and accepted revision", () => {
    const before = fixture()
    const after = structuredClone(before)
    after.questionIds.reverse()
    after.values.questions.reverse()
    after.extras.questionIds.reverse()
    after.extras.timeline = [
      after.extras.timeline[1],
      after.extras.timeline[0],
      after.extras.timeline[2],
    ]
    const history = recordStudioEdit(createStudioHistory(), before, after)
    const edited = structuredClone(after)
    edited.values.subject = "Keep this later title"
    edited.values.questions[1].question = "Keep this later text"
    edited.extras.audio = {
      ...edited.extras.audio,
      cues: {
        ...edited.extras.audio.cues,
        start: { ...edited.extras.audio.cues.start, volume: 0.17 },
      },
    }
    edited.extras.revision = 7
    const result = moveStudioHistory(history, edited, "undo")
    expect(result?.snapshot.questionIds).toEqual(ids)
    expect(result?.snapshot.extras.questionIds).toEqual(ids)
    expect(result?.snapshot.values.questions[0].question).toBe(
      "Keep this later text",
    )
    expect(result?.snapshot.values.subject).toBe("Keep this later title")
    expect(result?.snapshot.extras.audio).toEqual(edited.extras.audio)
    expect(result?.snapshot.extras.revision).toBe(7)
    expect(isStudioSnapshot(result?.snapshot)).toBe(true)
    expect(
      moveStudioHistory(result!.history, result!.snapshot, "redo")?.snapshot
        .questionIds,
    ).toEqual([...ids].reverse())
  })

  it("restores deleted question IDs, answers, attachments and recap references", () => {
    const before = fixture()
    const after = structuredClone(before)
    after.values.questions.shift()
    after.questionIds.shift()
    after.extras.questionIds.shift()
    after.extras.timeline.shift()
    after.extras.perQuestion = Object.fromEntries(
      Object.entries(after.extras.perQuestion).filter(([id]) => id !== ids[0]),
    )
    after.extras.scenes[sceneId] = {
      ...after.extras.scenes[sceneId],
      startQuestionId: ids[1],
    } as (typeof after.extras.scenes)[string]
    const undo = moveStudioHistory(
      recordStudioEdit(createStudioHistory(), before, after),
      after,
      "undo",
    )
    expect(undo?.snapshot.values.questions).toEqual(before.values.questions)
    expect(undo?.snapshot.extras.perQuestion).toEqual(before.extras.perQuestion)
    expect(undo?.snapshot.extras).toEqual(before.extras)
  })

  it("redo restores a duplicated card with text authored after duplication", () => {
    const before = fixture()
    const after = structuredClone(before)
    after.questionIds.push(duplicateId)
    after.extras.questionIds.push(duplicateId)
    after.values.questions.push(structuredClone(before.values.questions[0]))
    after.extras.timeline.push({
      id: duplicateId,
      kind: "question",
      questionId: duplicateId,
    })
    after.extras.perQuestion[duplicateId] = structuredClone(
      before.extras.perQuestion[ids[0]],
    )
    const history = recordStudioEdit(createStudioHistory(), before, after)
    after.values.questions[2].question = "Edited duplicate"
    const undo = moveStudioHistory(history, after, "undo")!
    expect(undo.snapshot.questionIds).toEqual(ids)
    const redo = moveStudioHistory(undo.history, undo.snapshot, "redo")!
    expect(redo.snapshot.questionIds[2]).toBe(duplicateId)
    expect(redo.snapshot.values.questions[2].question).toBe("Edited duplicate")
    expect(redo.snapshot.extras.perQuestion[duplicateId]).toEqual(
      before.extras.perQuestion[ids[0]],
    )
  })

  it("restores converted question content and preserves subsequent edits to other scenes", () => {
    const before = fixture()
    const after = structuredClone(before)
    after.values.questions.shift()
    after.questionIds.shift()
    after.extras.questionIds.shift()
    after.extras.timeline[0] = {
      id: before.extras.timeline[0].id,
      kind: "transition",
      sceneId: duplicateId,
    }
    after.extras.scenes[duplicateId] = {
      id: duplicateId,
      kind: "transition",
      title: "",
      durationMs: 5000,
      advance: "auto",
    }
    after.extras.perQuestion = Object.fromEntries(
      Object.entries(after.extras.perQuestion).filter(([id]) => id !== ids[0]),
    )
    const history = recordStudioEdit(createStudioHistory(), before, after)
    after.extras.scenes[sceneId].title = "Keep recap edit"
    const undo = moveStudioHistory(history, after, "undo")!
    expect(undo.snapshot.values.questions).toEqual(before.values.questions)
    expect(
      (undo.snapshot.extras as QuizExtrasV2).scenes[duplicateId],
    ).toBeUndefined()
    expect((undo.snapshot.extras as QuizExtrasV2).scenes[sceneId].title).toBe(
      "Keep recap edit",
    )
    expect(isStudioSnapshot(undo.snapshot)).toBe(true)
  })

  it("bounds history, ignores no-ops and drops redo on a new transaction", () => {
    const before = fixture()
    let history = createStudioHistory()
    expect(recordStudioEdit(history, before, structuredClone(before))).toBe(
      history,
    )
    let current = before
    for (let index = 0; index < 55; index += 1) {
      const next = structuredClone(current)
      next.values.questions[0].playMode = index % 2 ? "quiz" : "survey"
      history = recordStudioEdit(history, current, next)
      current = next
    }
    expect(history.past).toHaveLength(50)
    const undo = moveStudioHistory(history, current, "undo")!
    const next = structuredClone(undo.snapshot)
    next.values.subject = "Another transaction"
    expect(recordStudioEdit(undo.history, undo.snapshot, next).future).toEqual(
      [],
    )
    expect(moveStudioHistory(createStudioHistory(), before, "undo")).toBeNull()
  })

  it("compares saved content independently of server metadata and selection", () => {
    const initial = fixture()
    const saved = structuredClone(initial)
    saved.extras.revision += 1
    saved.extras.baseDigest = "a".repeat(64)
    saved.selectedTimelineId = sceneId
    expect(studioContent(saved)).toBe(studioContent(initial))
    saved.values.questions[0].question = "Newer unsaved change"
    expect(studioContent(saved)).not.toBe(studioContent(initial))
  })
})

describe("Studio browser backup records", () => {
  it("isolates accounts, quizzes, new drafts and concurrent editor instances", () => {
    const local = storage()
    const first = record()
    const second = record({ id: "another-tab", savedAt: 2000 })
    const otherOwner = record({
      scope: { ownerId: "owner-two", quizzId: "quiz-one" },
    })
    const newDraft = record({ scope: { ownerId: "owner-one", quizzId: null } })
    for (const draft of [first, second, otherOwner, newDraft]) {
      writeStudioDraft(local, draft)
    }
    expect(
      readStudioDrafts(local, first.scope).drafts.map((item) => item.id),
    ).toEqual(["another-tab", "editor-instance-one"])
    expect(readStudioDrafts(local, otherOwner.scope).drafts).toEqual([
      otherOwner,
    ])
    expect(readStudioDrafts(local, newDraft.scope).drafts).toEqual([newDraft])
    expect(removeStudioDraft(local, first)).toBe(true)
    expect(readStudioDrafts(local, first.scope).drafts).toEqual([second])
    expect(readStudioDrafts(local, newDraft.scope).drafts).toEqual([newDraft])
  })

  it("does not clear a newer record after an earlier save or discard", () => {
    const local = storage()
    const earlier = record()
    const newer = structuredClone(earlier)
    newer.savedAt += 1
    newer.snapshot.values.subject = "Keep newer changes"
    writeStudioDraft(local, newer)
    expect(removeStudioDraft(local, earlier)).toBe(false)
    expect(readStudioDrafts(local, earlier.scope).drafts).toEqual([newer])
  })

  it("preserves a foreign newer version written between inspection and cleanup", () => {
    const local = storage()
    const earlier = record()
    const newer = record({ id: "immutable-newer-version", savedAt: 2000 })
    newer.snapshot.values.subject = "Keep interleaved newer changes"
    writeStudioDraft(local, earlier)
    let interleave = true
    const racing = {
      ...local,
      getItem: (key: string) => {
        const previous = local.getItem(key)

        if (interleave && key === studioDraftKey(earlier)) {
          interleave = false
          writeStudioDraft(local, newer)
        }

        return previous
      },
    }
    expect(removeStudioDraft(racing, earlier)).toBe(true)
    expect(readStudioDrafts(local, earlier.scope).drafts).toEqual([newer])
    expect(() => writeStudioDraft(local, { ...newer, savedAt: 3000 })).toThrow(
      "immutable",
    )
  })

  it("reports malformed and unknown versions without applying or deleting them", () => {
    const local = storage()
    const draft = record()
    local.setItem(studioDraftKey(draft), "{broken")
    expect(readStudioDrafts(local, draft.scope)).toEqual({
      drafts: [],
      invalid: true,
    })
    local.setItem(
      studioDraftKey(draft),
      JSON.stringify({ ...draft, version: 999 }),
    )
    expect(readStudioDrafts(local, draft.scope)).toEqual({
      drafts: [],
      invalid: true,
    })
    expect(local.length).toBe(1)
  })

  it("propagates quota denial for the hook to report while retaining the previous record", () => {
    const local = storage()
    const draft = record()
    writeStudioDraft(local, draft)
    const denied = {
      ...local,
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError")
      },
    }
    expect(() =>
      writeStudioDraft(denied, { ...draft, id: "next-version", savedAt: 2000 }),
    ).toThrow("Full")
    expect(readStudioDrafts(local, draft.scope).drafts).toEqual([draft])
  })

  it("requires conflict handling for both revision and base changes", () => {
    const draft = record()
    expect(isStudioDraftStale(draft, draft.baseline)).toBe(false)
    expect(
      isStudioDraftStale(draft, {
        ...draft.baseline,
        revision: draft.baseline.revision + 1,
      }),
    ).toBe(true)
    expect(
      isStudioDraftStale(draft, {
        ...draft.baseline,
        baseDigest: "f".repeat(64),
      }),
    ).toBe(true)
    expect(
      isStudioDraftStale(
        { ...draft, scope: { ...draft.scope, quizzId: null } },
        { revision: 99, baseDigest: "" },
      ),
    ).toBe(false)
  })
})
