import { describe, expect, it } from "vitest"
import { applicationPreviewFrameSchema } from "../../core/show-library/application-preview-schema"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import { authoredFixture } from "../../core/show-library/preview-fixtures"
import { projectPackageScene } from "../package-runtime/projection"
import { packagePreviewScene } from "./package-preview-scene"

const frame = (phase: string) => {
  const show = authoredFixture(3, 2)
  show.cards[0].correctAnswers = [2]
  const chapters = compileFullShowPreviewTimeline(show)
  const chapterIndex = chapters.findIndex((chapter) => chapter.phase === phase)
  return {
    chapters,
    value: applicationPreviewFrameSchema.parse({
      show,
      chapterIndex,
      clock: {
        epoch: 2,
        sequence: 4,
        elapsedMs: 8000,
        deadlineMs: 20000,
        paused: true,
      },
      role: "spectator",
      locale: "en",
      reducedMotion: false,
    }),
  }
}

describe("full-game package preview public projection", () => {
  it("reveals only the current authored choices and keeps correctness out of pre-result snapshots", () => {
    for (const phase of ["question", "answerCards", "voting", "voteLocked"]) {
      const { value, chapters } = frame(phase)
      const scene = packagePreviewScene(value, chapters[value.chapterIndex])
      const projected = projectPackageScene({
        scene,
        serverTime: 10000,
        paused: true,
      })
      expect(projected.question).toBe("Synthetic question 1")
      expect(projected.answers).toHaveLength(phase === "question" ? 0 : 3)
      expect(projected.answers.every((answer) => !("correct" in answer))).toBe(
        true,
      )
      expect(JSON.stringify(projected)).not.toContain("Synthetic question 2")
      expect(JSON.stringify(projected)).not.toContain("correctAnswers")
    }
  })
  it("uses the actual authored answer key only in the results phase", () => {
    const { value, chapters } = frame("results")
    const projected = projectPackageScene({
      scene: packagePreviewScene(value, chapters[value.chapterIndex]),
      serverTime: 10000,
      paused: true,
    })
    expect(projected.answers.map((answer) => answer.correct)).toEqual([
      false,
      true,
      false,
    ])
    expect(projected.answers.map((answer) => answer.votes)).toEqual([0, 0, 0])
  })
  it("uses the same authored timer and does not create live join credentials", () => {
    const { value, chapters } = frame("voting")
    const scene = packagePreviewScene(value, chapters[value.chapterIndex])
    expect(scene).toMatchObject({
      kind: "voting",
      remainingSeconds: 12,
      totalPlayers: 0,
    })
    const lobby = packagePreviewScene(
      { ...value, stagePhase: "lobby" },
      chapters[value.chapterIndex],
    )
    expect(lobby).toEqual({ kind: "lobby", key: "package-preview-lobby" })
  })
})
