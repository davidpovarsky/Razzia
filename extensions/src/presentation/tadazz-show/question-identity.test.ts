import { expect, it } from "vitest"
import { computeShowScene, type ShowInput } from "./presentation-scene"

it.each(["SHOW_QUESTION", "SELECT_ANSWER", "SHOW_RESPONSES"] as const)(
  "%s keeps content identity when the separate counter advances first",
  (name) => {
    const input: ShowInput = {
      role: "manager",
      isConnected: true,
      envelope: { questionId: "old", phase: "question", extras: {} },
      questionStates: { current: 1, total: 10 },
      status: {
        name,
        data: {
          question: "Old question",
          questionNumber: 1,
          questionId: "old",
          answers: ["A", "B"],
          responses: {},
          time: 20,
        },
      },
    }
    const before = computeShowScene(input)
    const timelineFirst = computeShowScene({
      ...input,
      envelope: {
        ...input.envelope!,
        extras: { activeTimelineStep: { kind: "question", questionId: "new" } },
      },
    })
    expect(timelineFirst.key).toBe("wait:question-content")
    const counterFirst = computeShowScene({
      ...input,
      questionStates: { current: 2, total: 10 },
    })
    expect(counterFirst.key).toBe("wait:question-content")
    const envelopeFirst = computeShowScene({
      ...input,
      envelope: { questionId: "new", phase: "question", extras: {} },
    })
    expect(envelopeFirst.key).toBe("wait:question-content")
    const newStatus = {
      name,
      data: {
        ...input.status!.data,
        question: "New question",
        questionNumber: 2,
        questionId: "new",
      },
    }
    expect(computeShowScene({ ...input, status: newStatus }).key).toBe(
      "wait:question-content",
    )
    const next = computeShowScene({
      ...input,
      status: newStatus,
      envelope: { questionId: "new", phase: "question", extras: {} },
      questionStates: { current: 2, total: 10 },
    })
    expect(next.key).not.toBe(before.key)
    expect("question" in next && next.question.number).toBe(2)
  },
)
