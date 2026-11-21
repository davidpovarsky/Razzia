import { describe, expect, it } from "vitest"
import {
  createPackageSceneContinuity,
  type PackageScenePresentation,
} from "./scene-continuity"

function question(id: string): PackageScenePresentation {
  return {
    scene: {
      kind: "question",
      key: `question:${id}`,
      question: {
        key: id,
        question: `Question ${id}`,
        number: 1,
        totalQuestions: 2,
        options: [],
      },
    },
    questionId: id,
    epoch: 1,
    sequence: 3,
    remainingMs: 2000,
    deadline: 102000,
    backgroundUrl: "/media/question.png",
  }
}

const pending = (id: string): PackageScenePresentation => ({
  ...question(id),
  scene: { kind: "wait", key: "wait:question-content", text: "" },
  epoch: 2,
  sequence: 4,
})

describe("package presentation across independent socket messages", () => {
  it("keeps the complete previous frame during a counter/envelope/status race", () => {
    const owner = createPackageSceneContinuity()
    const first = {
      ...question("q1"),
      phaseElapsedMs: 1800,
      revealStage: "correct" as const,
    }
    expect(owner.select("room/theme/manager", first)).toEqual({
      presentation: first,
      holding: false,
    })
    for (const id of ["q1", "q2", "q1"]) {
      const selected = owner.select("room/theme/manager", pending(id))
      expect(selected.holding).toBe(true)
      expect(selected.presentation).toBe(first)
      expect(selected.presentation.questionId).toBe("q1")
      expect(selected.presentation.epoch).toBe(1)
      expect(selected.presentation.phaseElapsedMs).toBe(1800)
      expect(selected.presentation.revealStage).toBe("correct")
    }
    const next = question("q2")
    expect(owner.select("room/theme/manager", next)).toEqual({
      presentation: next,
      holding: false,
    })
  })

  it("releases the retained frame at an explicit lobby, closing or disconnected scene", () => {
    for (const scene of [
      { kind: "lobby", key: "lobby" },
      { kind: "connecting", key: "connecting" },
    ] as const) {
      const owner = createPackageSceneContinuity()
      owner.select("room/theme/manager", question("q1"))
      const next = { ...question(""), scene }
      expect(owner.select("room/theme/manager", next)).toEqual({
        presentation: next,
        holding: false,
      })
    }
  })

  it.each([
    "other-room/theme/manager",
    "room/other-theme/manager",
    "room/theme/player",
  ])(
    "cannot retain a previous room, renderer or role's data in %s",
    (identity) => {
      const owner = createPackageSceneContinuity()
      owner.select("room/theme/manager", question("private-old"))
      const next = pending("new")
      expect(owner.select(identity, next)).toEqual({
        presentation: next,
        holding: true,
      })
    },
  )

  it("does not invent content for a cold pending snapshot", () => {
    const owner = createPackageSceneContinuity()
    const next = pending("q1")
    expect(owner.select("room/theme/manager", next)).toEqual({
      presentation: next,
      holding: true,
    })
  })
})
