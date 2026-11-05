import { describe, expect, it } from "vitest"
import {
  buildReveal,
  computeShowScene,
  isTadazzShowActive,
  leaderboardEntries,
  resolveStageBackdrop,
  resolveWinner,
  type ShowEnvelope,
  type ShowInput,
} from "./presentation-scene"
import { collapseForResume, planTransition, type StageStep } from "./show-director"

const QID = "11111111-1111-4111-8111-111111111111"
const envelope = (extras: Record<string, unknown> = {}, over: Partial<ShowEnvelope> = {}): ShowEnvelope => ({
  gameId: "g1",
  epoch: 3,
  seq: 9,
  phase: "question",
  questionId: QID,
  startedAt: 1000,
  extras,
  ...over,
})
const base = (over: Partial<ShowInput>): ShowInput => ({
  role: "manager",
  isConnected: true,
  status: null,
  envelope: null,
  questionStates: { current: 4, total: 10 },
  ...over,
})
const visuals = ["Pirate", "Shadchan", "Faithful Dog", "Therapist", "Lamplighter"].map((alt, answerIndex) => ({
  answerIndex,
  display: "image" as const,
  url: `/media/real-${answerIndex}.webp`,
  alt,
}))
const answers = ["Pirate", "Shadchan", "Faithful Dog", "Therapist", "Lamplighter"]

describe("computeShowScene — every Razzia status maps to a TADAZZ screen", () => {
  it("maps SELECT_ANSWER with real answers + answerVisuals by answerIndex and server time", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope({ answerVisuals: [...visuals].reverse() }),
        status: { name: "SELECT_ANSWER", data: { question: "Pick a secondary character.", answers, time: 20, remainingTime: 12, totalPlayer: 3, questionType: "single", playMode: "survey" } },
      }),
    )
    expect(scene.kind).toBe("voting")
    if (scene.kind !== "voting") return
    expect(scene.question.options.map((o) => o.image)).toEqual(visuals.map((v) => v.url))
    expect(scene.question.options.map((o) => o.label)).toEqual(answers)
    expect(scene.seconds).toBe(20)
    expect(scene.remainingSeconds).toBe(12)
    expect(scene.question.number).toBe(4)
    expect(scene.question.totalQuestions).toBe(10)
  })

  it("never fabricates images or extra options (2 answers, text only, NO_TIME_LIMIT)", () => {
    const scene = computeShowScene(
      base({ status: { name: "SELECT_ANSWER", data: { question: "Q", answers: ["Yes", "No"], time: -1, questionType: "single" } } }),
    )
    if (scene.kind !== "voting") throw new Error("expected voting")
    expect(scene.question.options).toEqual([
      { label: "Yes", image: undefined, alt: "Yes" },
      { label: "No", image: undefined, alt: "No" },
    ])
    expect(scene.seconds).toBeNull()
  })

  it("ignores stale answerVisuals that do not fit the current answer set", () => {
    const scene = computeShowScene(
      base({ envelope: envelope({ answerVisuals: visuals }), status: { name: "SELECT_ANSWER", data: { question: "Q", answers: ["A", "B"], time: 10 } } }),
    )
    if (scene.kind !== "voting") throw new Error("expected voting")
    expect(scene.question.options.every((o) => !o.image)).toBe(true)
  })

  it.each([
    ["SHOW_ROOM", { text: "game:waitingForPlayers", inviteCode: "123456" }, "lobby"],
    ["WAIT", { text: "game:waitingForPlayers" }, "wait"],
    ["SHOW_START", { time: 3, subject: "Show" }, "start"],
    ["SHOW_PREPARED", { totalAnswers: 5, questionNumber: 4, questionType: "single" }, "prepared"],
    ["SHOW_QUESTION", { question: "Q", cooldown: 5 }, "question"],
    ["SHOW_RESPONSES", { question: "Q", answers, responses: { 0: 1 }, type: "single" }, "results"],
    ["SHOW_RESULT", { correct: true, message: "m", points: 10, myPoints: 10, rank: 1, aheadOfMe: null }, "player-result"],
    ["SHOW_LEADERBOARD", { oldLeaderboard: [], leaderboard: [] }, "leaderboard"],
    ["FINISHED", { subject: "s", top: [] }, "finale"],
    ["SUMMARY", { subject: "s", totalPlayers: 2, totalQuestions: 3 }, "summary"],
  ] as const)("%s → %s", (name, data, kind) => {
    expect(computeShowScene(base({ status: { name, data: data as Record<string, unknown> } })).kind).toBe(kind)
  })

  it("timeline scenes and interludes take precedence over the Razzia status", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope({ currentScene: { id: "s1", kind: "leaderboard", title: "Top" }, activeTimelineStep: { kind: "leaderboard", stepIndex: 2 } }, { phase: "scene" }),
        status: { name: "SHOW_RESPONSES", data: { question: "Q", answers, responses: {}, type: "single" } },
      }),
    )
    expect(scene.kind).toBe("scene")
    const inter = computeShowScene(
      base({ envelope: envelope({ interlude: { kind: "title", title: "Break", durationMs: 3000, advance: "auto" } }, { phase: "interlude" }) }),
    )
    expect(inter.kind).toBe("interlude")
  })

  it("is connecting (branded) before the first status, never legacy", () => {
    expect(computeShowScene(base({ isConnected: false })).kind).toBe("connecting")
    expect(computeShowScene(base({ isConnected: true })).kind).toBe("wait")
  })
})

describe("reveal data is server-authoritative", () => {
  it("uses snapshot counts/percentages (multi-choice unique-respondent denominator)", () => {
    const r = buildReveal({
      answersCount: 3,
      responses: { 0: 9, 1: 9, 2: 9 },
      snapshot: {
        questionIndex: 0, questionType: "multi", totalResponders: 4, eligiblePlayers: 5, revealStartedAt: 1,
        options: { 0: { index: 0, count: 3, percentage: 75 }, 1: { index: 1, count: 2, percentage: 50 }, 2: { index: 2, count: 1, percentage: 25 } },
      },
    })
    expect(r.counts).toEqual([3, 2, 1])
    expect(r.percentages).toEqual([75, 50, 25])
    expect(r.mode).toBe("survey")
  })

  it("quiz keeps correct/incorrect; survey has none", () => {
    expect(buildReveal({ answersCount: 2, responses: { 0: 1 }, solutions: [1] })).toMatchObject({ mode: "quiz", solutions: [1] })
    expect(buildReveal({ answersCount: 2, responses: { 0: 1 }, solutions: [] })).toMatchObject({ mode: "survey", solutions: undefined })
  })

  it("zero votes produce zero percentages", () => {
    const r = buildReveal({ answersCount: 5, responses: {} })
    expect(r.counts).toEqual([0, 0, 0, 0, 0])
    expect(r.percentages).toEqual([0, 0, 0, 0, 0])
  })
})

describe("leaderboard / finale use real names only", () => {
  it("individual and team entries", () => {
    const players = [
      { id: "p1", clientId: "c1", username: "Dana", points: 300 },
      { id: "p2", clientId: "c2", username: "Noam", points: 500 },
    ]
    expect(leaderboardEntries(players, undefined)).toEqual([
      { id: "p1", name: "Dana", score: 300 },
      { id: "p2", name: "Noam", score: 500 },
    ])
    const teams = leaderboardEntries(players, {
      enabled: true,
      teams: [{ id: "a", name: "Blue", color: "#00f" }, { id: "b", name: "Gold", color: "#fc0" }] as never,
      assignments: { c1: "a", c2: "b" },
    })
    expect(teams.map((t) => t.name).sort()).toEqual(["Blue", "Gold"])
  })

  it("winner, joint winner and neutral (no fake 'The Brainwaves')", () => {
    expect(resolveWinner([{ name: "A", score: 3 }, { name: "B", score: 9 }])).toEqual({ name: "B", score: 9 })
    expect(resolveWinner([{ name: "A", score: 9 }, { name: "B", score: 9 }])).toEqual({ name: "A & B", score: 9 })
    expect(resolveWinner([{ name: "A", score: 0 }])).toBeNull()
    expect(resolveWinner([])).toBeNull()
  })
})

describe("activation and backdrop priority", () => {
  it("is active by default and can be rolled back per show", () => {
    expect(isTadazzShowActive(null)).toBe(true)
    expect(isTadazzShowActive(envelope({ defaults: { motionKit: "goldy-20261105" } }))).toBe(true)
    expect(isTadazzShowActive(envelope({ defaults: { motionKit: "legacy" } }))).toBe(false)
  })

  it("authored card background overrides the canonical backdrop; unsafe URLs are ignored", () => {
    expect(resolveStageBackdrop(envelope({ cardBackground: { mode: "card", url: "/media/bg.png", fit: "contain" } }))).toEqual({ url: "/media/bg.png", fit: "contain" })
    expect(resolveStageBackdrop(envelope({ cardBackground: { mode: "card", url: "javascript:alert(1)" } }))).toBeNull()
    expect(resolveStageBackdrop(envelope({}))).toBeNull()
  })
})

describe("planTransition — the ten reference methods are driven by real events", () => {
  const q = (key: string, n = 5) => ({ key, question: "Q", number: 1, totalQuestions: 10, options: Array.from({ length: n }, (_, i) => ({ label: `o${i}` })) })
  const ops = (steps: StageStep[]) => steps.map((s) => s.op)

  it("lobby → question uses showQuestion; results → next question uses nextQuestion (ZZ)", () => {
    expect(ops(planTransition({ kind: "lobby", key: "lobby" }, { kind: "question", key: "q", question: q("k1", 0) }, { questionKey: null, mode: "custom" }))).toEqual(["showQuestion"])
    const results = { kind: "results" as const, key: "r", question: q("k1"), questionType: "single", reveal: { counts: [1, 0, 0, 0, 0], mode: "survey" as const } }
    expect(ops(planTransition(results, { kind: "question", key: "q2", question: q("k2", 0) }, { questionKey: "k1", mode: "results" }))).toEqual(["nextQuestion"])
  })

  it("SELECT_ANSWER → presentOptions + openVoting with a server deadline", () => {
    const steps = planTransition(
      { kind: "question", key: "q", question: q("k1", 0) },
      { kind: "voting", key: "v", question: q("k1"), questionType: "single", seconds: 20, remainingSeconds: 12, totalPlayers: 2, answers: [] },
      { questionKey: "k1", mode: "question" },
      1_000_000,
    )
    expect(ops(steps)).toEqual(["presentOptions", "openVoting"])
    expect(steps[1]).toMatchObject({ seconds: 20, deadlineMs: 1_012_000 })
  })

  it("voting → results always plays lockVoting before revealResults", () => {
    const steps = planTransition(
      { kind: "voting", key: "v", question: q("k1"), questionType: "single", seconds: 20, remainingSeconds: null, totalPlayers: 2, answers: [] },
      { kind: "results", key: "r", question: q("k1"), questionType: "single", reveal: { counts: [1, 2, 0, 0, 0], mode: "survey" } },
      { questionKey: "k1", mode: "voting" },
    )
    expect(ops(steps)).toEqual(["presentOptions", "lockVoting", "revealResults"])
  })

  it("leaderboard → showLeaderboard(old) + hold + updateLeaderboard(new)", () => {
    const steps = planTransition(null, {
      kind: "leaderboard",
      key: "l",
      previous: [{ id: "a", name: "A", score: 1 }],
      entries: [{ id: "a", name: "A", score: 5 }],
    }, { questionKey: null, mode: "idle" })
    expect(ops(steps)).toEqual(["showLeaderboard", "hold", "updateLeaderboard"])
  })

  it("prepared after a question uses playZZWipe; finale uses showFinale; authored opening without media uses showIntro", () => {
    const results = { kind: "results" as const, key: "r", question: q("k1"), questionType: "single", reveal: { counts: [0, 0, 0, 0, 0], mode: "survey" as const } }
    expect(ops(planTransition(results, { kind: "prepared", key: "p", questionNumber: 2, totalAnswers: 5 }, { questionKey: "k1", mode: "results" }))).toEqual(["playZZWipe"])
    expect(ops(planTransition(null, { kind: "finale", key: "f", winner: null }, { questionKey: null, mode: "idle" }))).toEqual(["showFinale"])
    expect(ops(planTransition(null, { kind: "scene", key: "s", scene: { kind: "opening", title: "Hi" } }, { questionKey: null, mode: "idle" }))).toEqual(["showIntro"])
    expect(ops(planTransition(null, { kind: "scene", key: "s", scene: { kind: "transition" } }, { questionKey: null, mode: "idle" }))).toEqual(["playZZWipe"])
  })

  it("resume after refresh renders the current state without replaying history", () => {
    const collapsed = collapseForResume([
      { op: "nextQuestion", question: q("k") },
      { op: "lockVoting" },
      { op: "showLeaderboard", entries: [] },
      { op: "hold", ms: 1600 },
      { op: "updateLeaderboard", entries: [{ id: "a", name: "A", score: 2 }] },
    ])
    expect(ops(collapsed)).toEqual(["showQuestion", "showLeaderboard"])
    expect(collapsed[1]).toMatchObject({ entries: [{ id: "a", score: 2 }] })
  })
})
