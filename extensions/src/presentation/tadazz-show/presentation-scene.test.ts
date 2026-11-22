import { describe, expect, it } from "vitest"
import {
  buildReveal,
  computeShowScene,
  isShowSceneContentPending,
  isTadazzShowActive,
  isTadazzV4Active,
  leaderboardEntries,
  resolveStageBackdrop,
  resolveWinner,
  type ShowEnvelope,
  type ShowInput,
} from "./presentation-scene"
import {
  collapseForResume,
  planTransition,
  type StageStep,
} from "./show-director"

const QID = "11111111-1111-4111-8111-111111111111"
const envelope = (
  extras: Record<string, unknown> = {},
  over: Partial<ShowEnvelope> = {},
): ShowEnvelope => ({
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
const visuals = [
  "Pirate",
  "Shadchan",
  "Faithful Dog",
  "Therapist",
  "Lamplighter",
].map((alt, answerIndex) => ({
  answerIndex,
  display: "image" as const,
  url: `/media/real-${answerIndex}.webp`,
  alt,
}))
const answers = [
  "Pirate",
  "Shadchan",
  "Faithful Dog",
  "Therapist",
  "Lamplighter",
]

describe("computeShowScene — every Razzia status maps to a TADAZZ screen", () => {
  it("holds an authored finale while the closing envelope precedes final status", () => {
    const closing = envelope(
      {
        currentScene: { id: "last", kind: "animation", preset: "grand-finale" },
        activeTimelineStep: {
          kind: "animation",
          sceneId: "last",
          stepIndex: 1,
        },
        presentationLaunch: { stage: "running", startedAt: null },
      },
      { phase: "scene" },
    )
    const previous = computeShowScene(base({ envelope: closing }))
    expect(previous.kind).toBe("scene")
    for (const stage of ["closing", "closed"]) {
      for (const role of ["manager", "spectator", "player"] as const) {
        const next = computeShowScene(
          base({
            role,
            envelope: envelope(
              { presentationLaunch: { stage, startedAt: 1000 } },
              { phase: "responses", epoch: 4 },
            ),
            status: {
              name: "SHOW_RESPONSES",
              data: { question: "Previous question", answers, responses: {} },
            },
          }),
        )
        expect(isShowSceneContentPending(next)).toBe(true)
        expect(
          planTransition(previous, next, { mode: "finale", questionKey: null }),
        ).toEqual([])
      }
    }
    const finished = computeShowScene(
      base({
        envelope: envelope({
          presentationLaunch: { stage: "closed", startedAt: 1000 },
        }),
        status: {
          name: "FINISHED",
          data: { top: [{ username: "Winner", points: 10 }] },
        },
      }),
    )
    expect(finished).toMatchObject({
      kind: "finale",
      winner: { name: "Winner", score: 10 },
    })
  })

  it("ignores an old closing launch when an active question is authoritative", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope({
          activeTimelineStep: { kind: "question", questionId: QID },
          presentationLaunch: { stage: "closed", startedAt: 1000 },
        }),
        status: {
          name: "SHOW_QUESTION",
          data: { question: "Current question", totalAnswers: 3 },
        },
      }),
    )
    expect(scene.kind).toBe("question")
    expect(isShowSceneContentPending(scene)).toBe(false)
  })

  it("does not retain a finished scene after replay or a new game resumes", () => {
    for (const gameId of ["g1", "new-game"]) {
      const resumed = computeShowScene(
        base({
          envelope: envelope(
            { presentationLaunch: { stage: "running", startedAt: null } },
            { gameId },
          ),
          status: {
            name: "SHOW_QUESTION",
            data: { question: "Replay", totalAnswers: 3 },
          },
        }),
      )
      expect(resumed.kind).toBe("question")
      expect(isShowSceneContentPending(resumed)).toBe(false)
    }
  })

  it("maps SELECT_ANSWER with real answers + answerVisuals by answerIndex and server time", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope({ answerVisuals: [...visuals].reverse() }),
        status: {
          name: "SELECT_ANSWER",
          data: {
            question: "Pick a secondary character.",
            answers,
            time: 20,
            remainingTime: 12,
            totalPlayer: 3,
            questionType: "single",
            playMode: "survey",
          },
        },
      }),
    )
    expect(scene.kind).toBe("voting")

    if (scene.kind !== "voting") {
      return
    }

    expect(scene.question.options.map((o) => o.image)).toEqual(
      visuals.map((v) => v.url),
    )
    expect(scene.question.options.map((o) => o.label)).toEqual(answers)
    expect(scene.seconds).toBe(20)
    expect(scene.remainingSeconds).toBe(12)
    expect(scene.question.number).toBe(4)
    expect(scene.question.totalQuestions).toBe(10)
  })

  it("never fabricates images or extra options (2 answers, text only, NO_TIME_LIMIT)", () => {
    const scene = computeShowScene(
      base({
        status: {
          name: "SELECT_ANSWER",
          data: {
            question: "Q",
            answers: ["Yes", "No"],
            time: -1,
            questionType: "single",
          },
        },
      }),
    )

    if (scene.kind !== "voting") {
      throw new Error("expected voting")
    }

    expect(scene.question.options).toEqual([
      { label: "Yes", image: undefined, alt: "Yes" },
      { label: "No", image: undefined, alt: "No" },
    ])
    expect(scene.seconds).toBeNull()
  })

  it("ignores stale answerVisuals that do not fit the current answer set", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope({ answerVisuals: visuals }),
        status: {
          name: "SELECT_ANSWER",
          data: { question: "Q", answers: ["A", "B"], time: 10 },
        },
      }),
    )

    if (scene.kind !== "voting") {
      throw new Error("expected voting")
    }

    expect(scene.question.options.every((o) => !o.image)).toBe(true)
  })

  it.each([
    [
      "SHOW_ROOM",
      { text: "game:waitingForPlayers", inviteCode: "123456" },
      "lobby",
    ],
    ["WAIT", { text: "game:waitingForPlayers" }, "wait"],
    ["SHOW_START", { time: 3, subject: "Show" }, "start"],
    [
      "SHOW_PREPARED",
      { totalAnswers: 5, questionNumber: 4, questionType: "single" },
      "prepared",
    ],
    ["SHOW_QUESTION", { question: "Q", cooldown: 5 }, "question"],
    [
      "SHOW_RESPONSES",
      { question: "Q", answers, responses: { 0: 1 }, type: "single" },
      "results",
    ],
    [
      "SHOW_RESULT",
      {
        correct: true,
        message: "m",
        points: 10,
        myPoints: 10,
        rank: 1,
        aheadOfMe: null,
      },
      "player-result",
    ],
    [
      "SHOW_LEADERBOARD",
      { oldLeaderboard: [], leaderboard: [] },
      "leaderboard",
    ],
    ["FINISHED", { subject: "s", top: [] }, "finale"],
    [
      "SUMMARY",
      { subject: "s", totalPlayers: 2, totalQuestions: 3 },
      "summary",
    ],
  ] as const)("%s → %s", (name, data, kind) => {
    expect(computeShowScene(base({ status: { name, data } })).kind).toBe(kind)
  })

  it("timeline scenes and interludes take precedence over the Razzia status", () => {
    const scene = computeShowScene(
      base({
        envelope: envelope(
          {
            currentScene: { id: "s1", kind: "leaderboard", title: "Top" },
            activeTimelineStep: { kind: "leaderboard", stepIndex: 2 },
          },
          { phase: "scene" },
        ),
        status: {
          name: "SHOW_RESPONSES",
          data: { question: "Q", answers, responses: {}, type: "single" },
        },
      }),
    )
    expect(scene.kind).toBe("scene")
    const inter = computeShowScene(
      base({
        envelope: envelope(
          {
            interlude: {
              kind: "title",
              title: "Break",
              durationMs: 3000,
              advance: "auto",
            },
          },
          { phase: "interlude" },
        ),
      }),
    )
    expect(inter.kind).toBe("interlude")
  })

  it("is connecting (branded) before the first status, never legacy", () => {
    expect(computeShowScene(base({ isConnected: false })).kind).toBe(
      "connecting",
    )
    expect(computeShowScene(base({ isConnected: true })).kind).toBe("wait")
  })
})

describe("reveal data is server-authoritative", () => {
  it("uses snapshot counts/percentages (multi-choice unique-respondent denominator)", () => {
    const r = buildReveal({
      answersCount: 3,
      responses: { 0: 9, 1: 9, 2: 9 },
      snapshot: {
        questionIndex: 0,
        questionType: "multi",
        totalResponders: 4,
        eligiblePlayers: 5,
        revealStartedAt: 1,
        options: {
          0: { index: 0, count: 3, percentage: 75 },
          1: { index: 1, count: 2, percentage: 50 },
          2: { index: 2, count: 1, percentage: 25 },
        },
      },
    })
    expect(r.counts).toEqual([3, 2, 1])
    expect(r.percentages).toEqual([75, 50, 25])
    expect(r.mode).toBe("survey")
  })

  it("quiz keeps correct/incorrect; survey has none", () => {
    expect(
      buildReveal({ answersCount: 2, responses: { 0: 1 }, solutions: [1] }),
    ).toMatchObject({ mode: "quiz", solutions: [1] })
    expect(
      buildReveal({ answersCount: 2, responses: { 0: 1 }, solutions: [] }),
    ).toMatchObject({ mode: "survey", solutions: undefined })
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
      teams: [
        { id: "a", name: "Blue", color: "#00f" },
        { id: "b", name: "Gold", color: "#fc0" },
      ] as never,
      assignments: { c1: "a", c2: "b" },
    })
    expect(teams.map((t) => t.name).sort()).toEqual(["Blue", "Gold"])
  })

  it("winner, joint winner and neutral (no fake 'The Brainwaves')", () => {
    expect(
      resolveWinner([
        { name: "A", score: 3 },
        { name: "B", score: 9 },
      ]),
    ).toEqual({ name: "B", score: 9 })
    expect(
      resolveWinner([
        { name: "A", score: 9 },
        { name: "B", score: 9 },
      ]),
    ).toEqual({ name: "A & B", score: 9 })
    expect(resolveWinner([{ name: "A", score: 0 }])).toBeNull()
    expect(resolveWinner([])).toBeNull()
  })
})

describe("activation and backdrop priority", () => {
  it("is active by default and can be rolled back per show", () => {
    expect(isTadazzShowActive(null)).toBe(true)
    expect(
      isTadazzShowActive(
        envelope({ defaults: { motionKit: "goldy-20261105" } }),
      ),
    ).toBe(true)
    expect(
      isTadazzShowActive(envelope({ defaults: { motionKit: "legacy" } })),
    ).toBe(false)
  })

  it("authored card background overrides the canonical backdrop; unsafe URLs are ignored", () => {
    expect(
      resolveStageBackdrop(
        envelope({
          cardBackground: {
            mode: "card",
            url: "/media/bg.png",
            fit: "contain",
            position: "bottom",
            overlayOpacity: 0.65,
          },
        }),
      ),
    ).toEqual({
      url: "/media/bg.png",
      fit: "contain",
      position: "bottom",
      overlayOpacity: 0.65,
    })
    expect(
      resolveStageBackdrop(
        envelope({
          cardBackground: { mode: "card", url: "javascript:alert(1)" },
        }),
      ),
    ).toBeNull()
    expect(resolveStageBackdrop(envelope({}))).toBeNull()
    expect(
      resolveStageBackdrop(
        envelope({
          currentScene: {
            kind: "transition",
            background: {
              url: "/media/scene.png",
              fit: "cover",
              position: "left",
              overlayOpacity: 0,
            },
          },
        }),
      ),
    ).toEqual({
      url: "/media/scene.png",
      fit: "cover",
      position: "left",
      overlayOpacity: 0,
    })
    expect(
      resolveStageBackdrop(
        envelope({ cardBackground: { url: "/media/defaults.png" } }),
      ),
    ).toEqual({
      url: "/media/defaults.png",
      fit: "cover",
      position: "center",
      overlayOpacity: 0.35,
    })
  })
})

describe("planTransition — the ten reference methods are driven by real events", () => {
  it("shows an authored Lottie instead of the generic spotlight without replacing Creating Worlds", () => {
    const stage = { mode: "idle" as const, questionKey: null }
    const scene = {
      kind: "animation" as const,
      id: "scene",
      preset: "spotlight",
      lottieUrl: "/media/owned.json",
    }
    expect(
      planTransition(null, { kind: "scene", key: "lottie", scene }, stage),
    ).toEqual([{ op: "custom" }])
    expect(
      planTransition(
        null,
        {
          kind: "scene",
          key: "native",
          scene: { ...scene, preset: "round-one" },
        },
        stage,
      )[0].op,
    ).toBe("showFullShowScene")
  })
  const q = (key: string, n = 5) => ({
    key,
    question: "Q",
    number: 1,
    totalQuestions: 10,
    options: Array.from({ length: n }, (_, i) => ({ label: `o${i}` })),
  })
  const ops = (steps: StageStep[]) => steps.map((s) => s.op)

  it("lobby → question uses showQuestion; results → next question uses nextQuestion (ZZ)", () => {
    expect(
      ops(
        planTransition(
          { kind: "lobby", key: "lobby" },
          { kind: "question", key: "q", question: q("k1", 0) },
          { questionKey: null, mode: "custom" },
        ),
      ),
    ).toEqual(["showQuestion"])
    const results = {
      kind: "results" as const,
      key: "r",
      question: q("k1"),
      questionType: "single",
      reveal: { counts: [1, 0, 0, 0, 0], mode: "survey" as const },
    }
    expect(
      ops(
        planTransition(
          results,
          { kind: "question", key: "q2", question: q("k2", 0) },
          { questionKey: "k1", mode: "results" },
        ),
      ),
    ).toEqual(["nextQuestion"])
  })

  it("SELECT_ANSWER enters answers and voting together with a server deadline", () => {
    const steps = planTransition(
      { kind: "question", key: "q", question: q("k1", 0) },
      {
        kind: "voting",
        key: "v",
        question: q("k1"),
        questionType: "single",
        seconds: 20,
        remainingSeconds: 12,
        totalPlayers: 2,
        answers: [],
      },
      { questionKey: "k1", mode: "question" },
      1_000_000,
    )
    expect(ops(steps)).toEqual(["openVoting"])
    expect(steps[0]).toMatchObject({
      question: q("k1"),
      seconds: 20,
      deadlineMs: 1_012_000,
    })
  })

  it("voting → results always plays lockVoting before revealResults", () => {
    const steps = planTransition(
      {
        kind: "voting",
        key: "v",
        question: q("k1"),
        questionType: "single",
        seconds: 20,
        remainingSeconds: null,
        totalPlayers: 2,
        answers: [],
      },
      {
        kind: "results",
        key: "r",
        question: q("k1"),
        questionType: "single",
        reveal: { counts: [1, 2, 0, 0, 0], mode: "survey" },
      },
      { questionKey: "k1", mode: "voting" },
    )
    expect(ops(steps)).toEqual([
      "presentOptions",
      "lockVoting",
      "revealResults",
    ])
  })

  it("leaderboard → showLeaderboard(old) + hold + updateLeaderboard(new)", () => {
    const steps = planTransition(
      null,
      {
        kind: "leaderboard",
        key: "l",
        previous: [{ id: "a", name: "A", score: 1 }],
        entries: [{ id: "a", name: "A", score: 5 }],
      },
      { questionKey: null, mode: "idle" },
    )
    expect(ops(steps)).toEqual(["showLeaderboard", "hold", "updateLeaderboard"])
  })

  it.each(["idle", "leaderboard"] as const)(
    "keeps the authored leaderboard title when the stage is %s",
    (mode) => {
      const steps = planTransition(
        null,
        {
          kind: "scene",
          key: "authored-leaderboard",
          scene: { kind: "leaderboard", title: "Mid-Game Leaderboard" },
          activeSceneData: {
            leaderboard: {
              entries: [{ rank: 1, displayName: "Alice", points: 850 }],
            },
          },
        },
        { questionKey: null, mode },
      )
      expect(steps).toEqual([
        {
          op: mode === "leaderboard" ? "updateLeaderboard" : "showLeaderboard",
          entries: [{ id: "rank:Alice", name: "Alice", score: 850 }],
          title: "Mid-Game Leaderboard",
        },
      ])
    },
  )

  it("reveals the authored interim title on the existing question", () => {
    const steps = planTransition(
      null,
      {
        kind: "scene",
        key: "authored-interim",
        scene: { kind: "interimResults", title: "Audience Poll Overview" },
        activeSceneData: {
          interimResults: {
            sourceQuestionId: "poll",
            questionText: "Which color?",
            totalResponders: 2,
            options: [
              { answerIndex: 0, label: "Red", count: 1, percentage: 50 },
              { answerIndex: 1, label: "Blue", count: 1, percentage: 50 },
            ],
            winners: [0, 1],
            isTie: true,
          },
        },
      },
      { questionKey: "Which color?#poll", mode: "voting" },
    )
    expect(ops(steps)).toEqual([
      "presentOptions",
      "lockVoting",
      "revealResults",
    ])
    expect(steps[0]).toMatchObject({
      question: { key: "Which color?#poll", question: "Which color?" },
    })
    expect(steps[2]).toEqual({
      op: "revealResults",
      reveal: {
        title: "Audience Poll Overview",
        counts: [1, 1],
        percentages: [50, 50],
        mode: "survey",
      },
    })
  })

  it("keeps an untitled authored leaderboard eligible for the canonical heading", () => {
    const steps = planTransition(
      null,
      {
        kind: "scene",
        key: "untitled-leaderboard",
        scene: { kind: "leaderboard" },
        activeSceneData: {
          leaderboard: {
            entries: [{ rank: 1, displayName: "Alice", points: 850 }],
          },
        },
      },
      { questionKey: null, mode: "leaderboard" },
    )
    expect(steps).toEqual([
      {
        op: "updateLeaderboard",
        entries: [{ id: "rank:Alice", name: "Alice", score: 850 }],
        title: undefined,
      },
    ])
  })

  it("prepared after a question uses playZZWipe; finale uses showFinale; authored opening without media uses showIntro", () => {
    const results = {
      kind: "results" as const,
      key: "r",
      question: q("k1"),
      questionType: "single",
      reveal: { counts: [0, 0, 0, 0, 0], mode: "survey" as const },
    }
    expect(
      ops(
        planTransition(
          results,
          { kind: "prepared", key: "p", questionNumber: 2, totalAnswers: 5 },
          { questionKey: "k1", mode: "results" },
        ),
      ),
    ).toEqual(["playZZWipe"])
    expect(
      ops(
        planTransition(
          null,
          { kind: "finale", key: "f", winner: null },
          { questionKey: null, mode: "idle" },
        ),
      ),
    ).toEqual(["showFinale"])
    expect(
      ops(
        planTransition(
          null,
          { kind: "scene", key: "s", scene: { kind: "opening", title: "Hi" } },
          { questionKey: null, mode: "idle" },
        ),
      ),
    ).toEqual(["showIntro"])
    expect(
      ops(
        planTransition(
          null,
          { kind: "scene", key: "s", scene: { kind: "transition" } },
          { questionKey: null, mode: "idle" },
        ),
      ),
    ).toEqual(["playZZWipe"])
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

  it("isTadazzV4Active defaults to true and respects legacy/goldy rollback", () => {
    expect(isTadazzV4Active(null)).toBe(true)
    expect(isTadazzV4Active(envelope())).toBe(true)
    expect(
      isTadazzV4Active(envelope({ defaults: { motionKit: "tadazz-v4" } })),
    ).toBe(true)
    expect(
      isTadazzV4Active(envelope({ defaults: { motionKit: "legacy" } })),
    ).toBe(false)
    expect(
      isTadazzV4Active(envelope({ defaults: { motionKit: "goldy-20261105" } })),
    ).toBe(false)
  })

  it("planTransition maps v4 timeline scenes: answerRecap, interlude, top-pick", () => {
    const recapStep = planTransition(
      null,
      {
        kind: "scene",
        key: "recap-key",
        scene: {
          kind: "answerRecap",
          roundNumber: 2,
          subtitle: "Recap Subtitle",
          recapItems: [{ label: "Choice A", image: "/imgA.png" }],
        },
      },
      { questionKey: null, mode: "idle" },
    )
    expect(ops(recapStep)).toEqual(["showRoundRecap"])

    const interludeStep = planTransition(
      null,
      {
        kind: "scene",
        key: "interlude-key",
        scene: {
          kind: "interlude",
          title: "Interlude Title",
          subtitle: "Interlude Sub",
        },
      },
      { questionKey: null, mode: "idle" },
    )
    expect(ops(interludeStep)).toEqual(["showInterlude"])

    const topPickStep = planTransition(
      null,
      {
        kind: "scene",
        key: "top-pick-key",
        scene: {
          kind: "animation",
          preset: "top-pick",
          title: "Top Pick Title",
        },
      },
      { questionKey: null, mode: "idle" },
    )
    expect(ops(topPickStep)).toEqual(["showTopPick"])
  })
})
