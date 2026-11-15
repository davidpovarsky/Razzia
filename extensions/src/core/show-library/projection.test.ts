import { describe, expect, it } from "vitest"
import { RUNTIME_PHASES } from "../packages/protocol"
import { previewContextSchema, demoIntentSchema } from "./preview-schemas"
import { previewInputFixture, snapshotFixture } from "./preview-fixtures"
import { projectShowBindings } from "./projection"
import { showProjectionSchema } from "./projection-schema"

describe("phase/role projection before visual props", () => {
  it.each(["manager", "player", "spectator"] as const)(
    "redacts solutions/results/future data during voting for %s",
    (role) => {
      const result = projectShowBindings(snapshotFixture(), {
        ...previewInputFixture().context,
        role,
      })
      expect(result.results).toBeUndefined()
      expect(result.personalResult).toBeUndefined()
      expect(result.leaders).toBeUndefined()
      expect(JSON.stringify(result)).not.toContain("solutionAnswerIds")
      expect(result.choices).toHaveLength(5)
      expect(result.join).toBe("unavailable-demo")
      expect(result.selectedAnswerIds).toEqual(
        role === "player" ? ["a2"] : undefined,
      )
      expect(result.canAnswer).toBe(role === "player")
    },
  )
  it("does not disclose choices during question entrance", () => {
    const result = projectShowBindings(
      { ...snapshotFixture(), phase: "question" },
      previewInputFixture().context,
    )
    expect(result.question?.text).toBe("Current synthetic question")
    expect(result.choices).toBeUndefined()
  })
  it.each(RUNTIME_PHASES)(
    "gates all phases without a second status enum: %s",
    (phase) => {
      const result = projectShowBindings(
        { ...snapshotFixture(), phase },
        previewInputFixture().context,
      )
      expect(result.results !== undefined).toBe(phase === "results")
      expect(result.leaders !== undefined).toBe(
        phase === "leaderboard" || phase === "closing",
      )
      expect(result.personalResult).toBeUndefined()
    },
  )
  it("reveals own synthetic result only for player and freezes paused answer permission", () => {
    const context = { ...previewInputFixture().context, role: "player" }
    expect(
      projectShowBindings(
        { ...snapshotFixture(), phase: "personalResult" },
        context,
      ).personalResult?.points,
    ).toBe(0)
    const snapshot = snapshotFixture()
    snapshot.clock.paused = true
    expect(projectShowBindings(snapshot, context).canAnswer).toBe(false)
  })
  it.each([
    "roomId",
    "pin",
    "joinUrl",
    "phoneE164",
    "futureQuestions",
    "onSubmit",
  ])("rejects raw forbidden controller field %s", (key) => {
    expect(() =>
      projectShowBindings(
        { ...snapshotFixture(), [key]: "forbidden" },
        previewInputFixture().context,
      ),
    ).toThrow()
  })
  it("rejects live context, private fields and arbitrary commands", () => {
    expect(
      previewContextSchema.safeParse({
        ...previewInputFixture().context,
        mode: "live",
      }).success,
    ).toBe(false)
    expect(
      demoIntentSchema.safeParse({ type: "socket", event: "vote" }).success,
    ).toBe(false)
    expect(() =>
      projectShowBindings(
        {
          ...snapshotFixture(),
          question: { ...snapshotFixture().question, phoneE164: "private" },
        },
        previewInputFixture().context,
      ),
    ).toThrow()
  })
  it("rejects foreign/duplicate result identities and invalid aggregate counts", () => {
    expect(() =>
      projectShowBindings(
        {
          ...snapshotFixture(),
          results: [{ answerId: "foreign", count: 1, percent: 100 }],
        },
        previewInputFixture().context,
      ),
    ).toThrow()
    expect(() =>
      projectShowBindings(
        { ...snapshotFixture(), responders: 6, eligible: 5 },
        previewInputFixture().context,
      ),
    ).toThrow()
  })
  it.each([0, 1, 5, 64])(
    "projects transient/fixture %i choices without truncation or authoring bypass",
    (count) => {
      const snapshot = snapshotFixture()
      snapshot.question.choices = Array.from({ length: count }, (_, i) => ({
        id: `a${i + 1}`,
        label: `Choice ${i + 1}`,
      }))
      snapshot.question.solutionAnswerIds = []
      snapshot.selectedAnswerIds = []
      snapshot.results = []
      expect(
        projectShowBindings(snapshot, previewInputFixture().context).choices,
      ).toHaveLength(count)
    },
  )
  it("the exported projection schema also rejects phase/role leaks", () => {
    const view = projectShowBindings(
      snapshotFixture(),
      previewInputFixture().context,
    )
    expect(
      showProjectionSchema.safeParse({
        ...view,
        results: snapshotFixture().results,
      }).success,
    ).toBe(false)
    expect(
      showProjectionSchema.safeParse({ ...view, selectedAnswerIds: ["a1"] })
        .success,
    ).toBe(false)
  })
})
