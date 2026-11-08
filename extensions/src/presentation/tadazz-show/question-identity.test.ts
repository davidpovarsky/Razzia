import { expect, it } from "vitest"
import { computeShowScene, type ShowInput } from "./presentation-scene"

it.each(["SHOW_QUESTION", "SELECT_ANSWER", "SHOW_RESPONSES"] as const)(
  "%s keeps content identity when the separate counter advances first",
  (name) => {
    const input: ShowInput = {
      role: "manager",
      isConnected: true,
      envelope: null,
      questionStates: { current: 1, total: 10 },
      status: {
        name,
        data: {
          question: "Old question",
          questionNumber: 1,
          answers: ["A", "B"],
          responses: {},
          time: 20,
        },
      },
    }
    const before = computeShowScene(input)
    const counterFirst = computeShowScene({
      ...input,
      questionStates: { current: 2, total: 10 },
    })
    expect(counterFirst.key).toBe(before.key)
    expect("question" in counterFirst && counterFirst.question.number).toBe(1)
    const next = computeShowScene({
      ...input,
      status: {
        name,
        data: {
          ...input.status!.data,
          question: "New question",
          questionNumber: 2,
        },
      },
      questionStates: { current: 2, total: 10 },
    })
    expect(next.key).not.toBe(before.key)
    expect("question" in next && next.question.number).toBe(2)
  },
)
