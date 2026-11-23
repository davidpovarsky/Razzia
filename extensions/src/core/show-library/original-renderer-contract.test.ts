import { describe, expect, it } from "vitest"
import { QUESTION_REGISTRY } from "../../../../packages/web/src/features/questions"
import { QUESTION_PRESENTATIONS } from "../../../../packages/web/src/features/questions/presentation"
import {
  ANSWERS_COLORS,
  ANSWERS_LABELS,
} from "../../../../packages/web/src/features/game/utils/constants"
import * as pure from "../../../../packages/web/src/features/game/utils/answer-style"

describe("original Razzia views remain the source of both consumers", () => {
  it("keeps the exact original registered component identities and configuration", () => {
    for (const type of ["single", "multi", "estimation"] as const) {
      expect(QUESTION_REGISTRY[type].AnswerComponent).toBe(
        QUESTION_PRESENTATIONS[type].AnswerComponent,
      )
    }
    expect(QUESTION_REGISTRY.estimation.ResponsesComponent).toBe(
      QUESTION_PRESENTATIONS.estimation.ResponsesComponent,
    )
    expect(typeof QUESTION_REGISTRY.single.ConfigComponent).toBe("function")
    expect(QUESTION_REGISTRY.multi.defaultOptions).toEqual({
      scoringMode: "balanced",
    })
  })
  it("re-exports the same color/label objects to the live game without importing it into preview", () => {
    expect(ANSWERS_COLORS).toBe(pure.ANSWERS_COLORS)
    expect(ANSWERS_LABELS).toBe(pure.ANSWERS_LABELS)
    expect(ANSWERS_LABELS).toEqual(["1", "2", "3", "4", "5"])
  })
})
