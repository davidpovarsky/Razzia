import { normalizePreviewDraft, getPreviewIdentityId } from "./identity"
import { resolvePreviewPlan } from "./preview-resolve"
import {
  authoredFixture,
  previewInputFixture,
  snapshotFixture,
} from "./preview-fixtures"
import { describe, expect, it } from "vitest"
import { RUNTIME_PHASES } from "../packages/protocol"
import { previewContextSchema, demoIntentSchema } from "./preview-schemas"

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
      expect(result.canAnswer).toBe(false)
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

describe("readiness requires genuine bound evidence", () => {
  function boundFixture(estimation = false) {
    const show = authoredFixture(2, 1)

    if (estimation) {
      Object.assign(show.cards[0], {
        questionType: "estimation",
        options: { inputMode: "input", min: 0, max: 100, step: 1, margin: 0 },
      })
    }

    const input = previewInputFixture(show)
    input.context.role = "player"
    const draft = normalizePreviewDraft(input),
      plan = resolvePreviewPlan(draft)
    const [card] = draft.show.cards

    if (card.kind !== "quiz") {
      throw new Error("fixture")
    }

    const id = getPreviewIdentityId(
      draft.input.identityMap,
      "questions",
      card.key,
    )
    const snapshot = {
      portVersion: 3,
      identityRuleVersion: 2,
      source: "deterministic-fixture",
      phase: "voting",
      clock: snapshotFixture().clock,
      canAnswer: true,
      question: {
        id,
        text: card.question,
        questionType: card.questionType,
        playMode: card.kind,
        choices: estimation
          ? []
          : card.answers.map((a, i) => ({
              id: `${id}.choice.${i + 1}`,
              label: a.text,
            })),
        solutionAnswerIds: [],
        ...(estimation ? { estimation: card.options } : {}),
      },
    }
    const binding = {
      draft,
      plan,
      currentQuestionId: id,
      phase: "voting" as const,
      clock: snapshot.clock,
    }

    return { snapshot, binding, context: input.context }
  }
  it("denies the review witness: player voting without a question", () => {
    const snapshot = {
      portVersion: 3,
      identityRuleVersion: 2,
      source: "deterministic-fixture",
      phase: "voting",
      clock: snapshotFixture().clock,
      canAnswer: true,
    }
    expect(
      projectShowBindings(snapshot, {
        ...previewInputFixture().context,
        role: "player",
      }),
    ).toMatchObject({ canAnswer: false, answerReadiness: "missing-binding" })
    const { binding, context } = boundFixture()
    expect(projectShowBindings(snapshot, context, binding)).toMatchObject({
      canAnswer: false,
      answerReadiness: "missing-question",
    })
  })
  it.each([false, true])(
    "keeps genuine supported-shape input unavailable (estimation=%s)",
    (estimation) => {
      const { snapshot, context, binding } = boundFixture(estimation)
      expect(projectShowBindings(snapshot, context, binding)).toMatchObject({
        canAnswer: false,
        answerReadiness: "unavailable",
      })
    },
  )
  it("rejects forged draft, cloned/foreign/capability-forged plan", () => {
    const { snapshot, context, binding } = boundFixture()
    expect(() =>
      projectShowBindings(snapshot, context, {
        ...binding,
        draft: { ...binding.draft },
      }),
    ).toThrow("unvalidated-draft")
    for (const plan of [
      { ...binding.plan },
      boundFixture().binding.plan,
      {
        ...binding.plan,
        capabilities: {
          ...binding.plan.capabilities,
          localSelection: true,
          supportedRoles: ["player"],
        },
      },
    ]) {
      expect(() =>
        projectShowBindings(snapshot, context, {
          ...binding,
          plan,
        } as typeof binding),
      ).toThrow("unbound-preview-plan")
    }
  })
  it("rejects mismatched identity, type, count, choice IDs, role, phase and clock", () => {
    const { snapshot, context, binding } = boundFixture()
    for (const question of [
      { ...snapshot.question, id: "foreign" },
      { ...snapshot.question, questionType: "multi" },
      { ...snapshot.question, choices: [] },
      {
        ...snapshot.question,
        choices: snapshot.question.choices.map((c) => ({
          ...c,
          id: "foreign",
        })),
      },
    ]) {
      expect(() =>
        projectShowBindings({ ...snapshot, question }, context, binding),
      ).toThrow()
    }
    expect(() =>
      projectShowBindings(snapshot, { ...context, role: "spectator" }, binding),
    ).toThrow("context-mismatch")
    expect(() =>
      projectShowBindings(
        { ...snapshot, phase: "voteLocked" },
        context,
        binding,
      ),
    ).toThrow("clock-phase-mismatch")
    expect(() =>
      projectShowBindings(
        { ...snapshot, clock: { ...snapshot.clock, sequence: 2 } },
        context,
        binding,
      ),
    ).toThrow("clock-phase-mismatch")
  })
  it("paused/expired voting cannot become ready", () => {
    const { snapshot, context, binding } = boundFixture()
    for (const clock of [
      { ...snapshot.clock, paused: true },
      { ...snapshot.clock, elapsedMs: 20000 },
    ]) {
      expect(
        projectShowBindings({ ...snapshot, clock }, context, {
          ...binding,
          clock,
        }),
      ).toMatchObject({ canAnswer: false, answerReadiness: "inactive" })
    }
  })
})
