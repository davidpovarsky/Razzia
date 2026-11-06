import { EVENTS, QUIZZ_MODES } from "@razzia/common/constants"
import type { Quizz } from "@razzia/common/types/game"
import { STATUS } from "@razzia/common/types/game/status"
import { CooldownTimer } from "@razzia/socket/services/game/cooldown-timer"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { RoundManager } from "@razzia/socket/services/game/round-manager"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  duplicateQuestion,
  generateQuestionIds,
  remapQuestionIds,
  removeQuestion,
  reorderQuestionIds,
  type QuizExtrasV1,
} from "../core/index"
import { ExtensionGameSession } from "./game/session"
import { CompositeStorageError } from "./storage/error"
import { CompositeStorageService } from "./storage/service"

describe("WAVE 2 / PHASE A - Authoritative Game Control, Interludes & Reveal Data", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Sample 3-question quiz fixture
  const createSampleQuiz = (
    gameMode: Quizz["gameMode"] = QUIZZ_MODES.QUIZ,
  ): Quizz => ({
    gameMode,
    subject: "Phase A Acceptance Quiz",
    questions: [
      {
        type: "single",
        question: "Q1: Capital of France?",
        answers: ["Paris", "Lyon", "Marseille", "Nice"],
        solutions: [0],
        cooldown: 0,
        time: 10,
      },
      {
        type: "multi",
        question: "Q2: Prime numbers?",
        answers: ["2", "3", "4", "5"],
        solutions: [0, 1, 3],
        cooldown: 0,
        time: 10,
      },
      {
        type: "estimation",
        question: "Q3: Height of Eiffel Tower in meters?",
        answers: [],
        solutions: [330],
        cooldown: 0,
        time: 10,
        options: {
          inputMode: "slider",
          min: 100,
          max: 500,
          step: 1,
          margin: 10,
        },
      },
    ],
  })

  // Sample extras fixture with 4 interlude kinds and rich configuration
  const createSampleExtras = (quizId: string, qIds: string[]): QuizExtrasV1 => {
    const digest = computeCanonicalBaseDigest({
      subject: "Phase A Acceptance Quiz",
    })
    const extras = createDefaultQuizExtras(quizId, qIds, digest)

    // Q0 has title interlude (auto advance)
    extras.perQuestion[qIds[0]] = {
      interlude: {
        kind: "title",
        title: "Well Done! Next Round Coming Up",
        durationMs: 3000,
        advance: "auto",
      },
    }

    // Q1 has image interlude (manual advance)
    extras.perQuestion[qIds[1]] = {
      interlude: {
        kind: "image",
        title: "Bonus Trivia",
        url: "/media/trivia.png",
        durationMs: 5000,
        advance: "manual",
      },
    }

    // Q2 has countdown interlude (auto advance) - note: Q2 is last question, so per rule it will NOT trigger interlude
    extras.perQuestion[qIds[2]] = {
      interlude: {
        kind: "countdown",
        durationMs: 4000,
        advance: "auto",
      },
    }

    return extras
  }

  // Setup helper for RoundManager and ExtensionGameSession
  const setupGame = (
    quizz = createSampleQuiz(),
    options: { withExtras?: boolean; showLeaderboard?: boolean } = {},
  ) => {
    const fake = createFakeIo()
    const qIds = generateQuestionIds(quizz.questions.length)
    const extras =
      options.withExtras !== false ? createSampleExtras("quiz-1", qIds) : null
    const session = extras ? new ExtensionGameSession("game-1", extras) : null

    let roundRef: RoundManager | null = null

    const playerManager = new PlayerManager({
      io: fake.io,
      gameId: "game-1",
      gameMode: quizz.gameMode,
      getManagerId: () => "mgr-1",
      isStarted: () => roundRef?.isStarted() ?? false,
    })

    const p1Socket = fake.createSocket("p1")
    const p2Socket = fake.createSocket("p2")
    const err1 = playerManager.join(p1Socket, "Alice")
    const err2 = playerManager.join(p2Socket, "Bobby")

    if (err1 || err2) {
      throw new Error(`Join failed: ${err1} / ${err2}`)
    }

    let gameFinished = false
    const playerResults: Array<{
      id: string
      points: number
      correct: boolean
    }> = []

    const round = new RoundManager({
      quizz,
      players: playerManager,
      cooldown: new CooldownTimer(fake.io, "game-1"),
      io: fake.io,
      gameId: "game-1",
      getManagerId: () => "mgr-1",
      broadcast: (status, data) => {
        fake.io.to("game-1").emit(EVENTS.GAME.STATUS, { name: status, data })

        if (session) {
          if (status === STATUS.SHOW_QUESTION) {
            session.onQuestionStart(round.currentQuestionIndex)
          } else if (status === STATUS.SELECT_ANSWER) {
            session.setPhase("question")
          } else if (
            status === STATUS.SHOW_RESPONSES ||
            status === STATUS.SHOW_RESULT
          ) {
            session.setPhase("responses")
          } else if (status === STATUS.SHOW_LEADERBOARD) {
            session.setPhase("leaderboard")
          } else if (status === STATUS.FINISHED) {
            session.setPhase("finished")
          }
        }
      },
      send: (target, status, data) => {
        fake.io.to(target).emit(EVENTS.GAME.STATUS, { name: status, data })

        if (status === STATUS.SHOW_RESULT) {
          playerResults.push({
            id: target,
            points: (data as { points: number }).points,
            correct: (data as { correct: boolean }).correct,
          })
        }

        if (session && status === STATUS.SHOW_RESPONSES) {
          session.setPhase("responses")
        }
      },
      onNewQuestion: () => undefined,
      onGameFinished: () => {
        gameFinished = true
      },
      getSettings: () => ({
        answersOnly: false,
        generatedUsernames: false,
        autoAdvance: { enable: false, responsesDelay: 5, leaderboardDelay: 5 },
      }),
      shouldShowLeaderboard: () => options.showLeaderboard ?? false,
      hasInterlude: (qIdx) => session?.hasInterlude(qIdx) ?? false,
      getInterludeAdvance: (qIdx) =>
        session?.getInterludeAdvance(qIdx) ?? "manual",
      getInterludeDuration: (qIdx) =>
        session?.getInterludeDuration(qIdx) ?? 5000,
      onInterlude: (qIdx) => session?.onInterludeStart(qIdx),
      getQuestionId: (qIdx) => session?.getQuestionId(qIdx),
      onResultsCalculated: (dist) => session?.setRevealDistribution(dist),
      onReplayCheckpoint: (qIdx) => session?.onReplayCheckpoint(qIdx),
    })

    roundRef = round

    if (session) {
      session.setDelegate({
        endAnswerTimer: () => round.endTimer(),
        nextScreen: () => round.nextScreen(),
        previousScreen: () => round.previousScreen(),
        cancelActiveVote: () => round.cancelActiveVote(),
        reopenQuestion: (qIdx) => round.reopenQuestion(qIdx),
        getAnswersCount: () => round.getAnswerCount(),
        canPrevious: () => round.canPrevious(),
        isAcceptingAnswers: () => round.isCurrentlyAcceptingAnswers,
        pauseGame: () => round.pauseGame(),
        resumeGame: () => round.resumeGame(),
        getPauseSnapshot: () => round.getPauseSnapshot(),
        skipQuestion: (reason) => round.skipQuestion(reason),
        replayFromCheckpoint: (qIdx) => round.replayFromCheckpoint(qIdx),
        endOrSkipInterlude: () => round.endOrSkipInterlude(),
        getHistory: (qIdx) => round.getHistory(qIdx),
      })
    }

    const mgrSocket = fake.createSocket("mgr-1", "mgr-client-1")

    const reachAnswers = async () => {
      let attempts = 0

      const poll = async (): Promise<void> => {
        if (round.isCurrentlyAcceptingAnswers || attempts >= 30) {
          return
        }

        attempts += 1
        await vi.advanceTimersByTimeAsync(SECOND_MS)

        return poll()
      }

      await poll()
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)
    }

    const start = async () => {
      void round.start(mgrSocket)
      await reachAnswers()
    }

    return {
      round,
      session,
      playerManager,
      p1Socket,
      p2Socket,
      mgrSocket,
      fake,
      playerResults,
      reachAnswers,
      start,
      isFinished: () => gameFinished,
    }
  }

  // ── A1: CRITICAL INTERLUDE INTEGRATION ────────────────────────────────────

  describe("A1: Interlude Progression & Server Authority (Asana 1219846884974853)", () => {
    it("progresses SHOW_RESPONSES -> interlude -> next question with auto and manual advance", async () => {
      const { round, session, p1Socket, p2Socket, reachAnswers, start } =
        setupGame()
      await start()

      expect(round.isStarted()).toBe(true)
      expect(round.currentQuestionIndex).toBe(0)

      // Step 1: Alice and Bobby answer Q0
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      // Step 2: Next screen moves to configured Q0 interlude (title, auto)
      expect(round.nextScreen()).toBe(true)
      expect(round.currentStepName).toBe("interlude")
      expect(session?.currentPhase).toBe("interlude")

      // Manager snapshot contains interlude metadata
      const snap = session?.getStateSnapshot("manager", [])
      const interludeData = snap?.extras.interlude as
        { title: string } | undefined
      expect(interludeData?.title).toBe("Well Done! Next Round Coming Up")

      // Auto duration (3000ms) elapses on server -> automatically advances to Q1
      await vi.advanceTimersByTimeAsync((3000 / 1000) * SECOND_MS)
      await reachAnswers()

      expect(round.currentQuestionIndex).toBe(1)
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      // Step 3: Answer Q1 and reach Q1 interlude (image, manual advance)
      round.selectAnswer(p1Socket, [0, 1])
      round.selectAnswer(p2Socket, [0, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      round.nextScreen()
      expect(round.currentStepName).toBe("interlude")

      // Image interlude is manual: timer does not advance it automatically
      await vi.advanceTimersByTimeAsync(10 * SECOND_MS)
      expect(round.currentStepName).toBe("interlude")

      // Manager sends END_OR_SKIP_INTERLUDE to advance
      const skipRes = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "END_OR_SKIP_INTERLUDE",
          payload: { reason: "manual" },
          requestId: "req-skip-interlude",
        },
        true,
        false,
      )

      expect(skipRes?.success).toBe(true)
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(2)
    })

    it("prevents interlude after the final question per Asana V1 rule", async () => {
      const { round, p1Socket, p2Socket, reachAnswers, start, isFinished } =
        setupGame()
      await start()

      // Q0 -> answer and skip interlude
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      // Advance to interlude
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      // Q1 -> answer and skip interlude
      round.selectAnswer(p1Socket, [0, 1, 3])
      round.selectAnswer(p2Socket, [0, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      // Advance to interlude
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      expect(round.currentQuestionIndex).toBe(2)

      // Q2 (final question) -> answer
      round.selectAnswer(p1Socket, [330])
      round.selectAnswer(p2Socket, [340])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      // Advancing from final question finishes quiz directly without interlude
      round.nextScreen()
      expect(isFinished()).toBe(true)
      expect(round.isStarted()).toBe(false)
    })

    it("verifies 4 interlude kinds: title, image, video, countdown", () => {
      const qIds = generateQuestionIds(4)
      const digest = computeCanonicalBaseDigest({ subject: "4 Kinds" })
      const extras = createDefaultQuizExtras("quiz-4kinds", qIds, digest)

      extras.perQuestion[qIds[0]] = {
        interlude: {
          kind: "title",
          title: "Slide Title",
          durationMs: 4000,
          advance: "auto",
        },
      }
      extras.perQuestion[qIds[1]] = {
        interlude: {
          kind: "image",
          title: "Photo",
          url: "/media/photo.jpg",
          durationMs: 5000,
          advance: "manual",
        },
      }
      extras.perQuestion[qIds[2]] = {
        interlude: {
          kind: "video",
          title: "Clip",
          url: "/media/clip.mp4",
          durationMs: 8000,
          advance: "auto",
        },
      }
      extras.perQuestion[qIds[3]] = {
        interlude: { kind: "countdown", durationMs: 5000, advance: "auto" },
      }

      const session = new ExtensionGameSession("game-4kinds", extras)

      session.onInterludeStart(0)
      expect(session.getStateSnapshot("manager", []).extras.interlude).toEqual({
        kind: "title",
        title: "Slide Title",
        durationMs: 4000,
        advance: "auto",
      })

      session.onInterludeStart(1)
      expect(session.getStateSnapshot("manager", []).extras.interlude).toEqual({
        kind: "image",
        title: "Photo",
        url: "/media/photo.jpg",
        durationMs: 5000,
        advance: "manual",
      })

      session.onInterludeStart(2)
      expect(session.getStateSnapshot("manager", []).extras.interlude).toEqual({
        kind: "video",
        title: "Clip",
        url: "/media/clip.mp4",
        durationMs: 8000,
        advance: "auto",
      })

      session.onInterludeStart(3)
      expect(session.getStateSnapshot("manager", []).extras.interlude).toEqual({
        kind: "countdown",
        durationMs: 5000,
        advance: "auto",
      })
    })
  })

  // ── A2: END TIMER, NEXT SCREEN, SKIP QUESTION ────────────────────────────

  describe("A2: Distinguish End Timer, Next Screen, Skip Question (Asana 1219846277925221 / 1219846277923284)", () => {
    it("End Timer: closes answer acceptance, cancels timer, and scores immediately", async () => {
      const { round, session, p1Socket, playerResults, start } = setupGame()
      await start()

      // Alice answers correctly; Bobby does not answer
      round.selectAnswer(p1Socket, [0])
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      // Manager invokes END_ANSWER_TIMER
      const res = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "END_ANSWER_TIMER",
          payload: {},
          requestId: "req-end-timer",
        },
        true,
        false,
      )

      expect(res?.success).toBe(true)
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.isCurrentlyAcceptingAnswers).toBe(false)
      expect(round.currentStepName).toBe("reveal")

      // Alice received points immediately
      const isAliceResult = (r: { id: string }) => r.id === "p1"
      const aliceRes = playerResults.find(isAliceResult)
      expect(aliceRes?.correct).toBe(true)
      expect(aliceRes?.points).toBeGreaterThan(0)
    })

    it("Next Screen: rejects during SELECT_ANSWER to prevent silent score bypass", async () => {
      const { round, session, start } = setupGame()
      await start()

      // During SELECT_ANSWER, NEXT_SCREEN must be refused
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      let thrown: unknown = null

      try {
        session?.handleCommand(
          {
            v: 1,
            gameId: "game-1",
            action: "NEXT_SCREEN",
            payload: {},
            requestId: "req-invalid-next",
          },
          true,
          false,
        )
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeDefined()
      expect((thrown as Error).message).toContain(
        "cannotNextScreenDuringAnswers",
      )
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)
    })

    it("Skip Question: skips unscored question without awarding/losing points", async () => {
      const { round, session, playerManager, reachAnswers, start } = setupGame()
      await start()

      expect(round.currentQuestionIndex).toBe(0)

      // Manager skips question 0
      const skipRes = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "SKIP_QUESTION",
          payload: { reason: "Presenter skipped" },
          requestId: "req-skip-q",
        },
        true,
        false,
      )

      expect(skipRes?.success).toBe(true)
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(1)

      // Alice's score must still be 0
      const alice = playerManager.findById("p1")
      expect(alice?.points).toBe(0)

      // History records skipped question with no solutions leaked
      const history = round.getHistory(0) as {
        note?: string
        solutions?: number[]
      } | null
      expect(history?.note).toContain("Skipped: Presenter skipped")
      expect(history?.solutions).toBeUndefined()
    })
  })

  // ── A3: READ-ONLY PREVIOUS & REPLAY FROM CHECKPOINT ───────────────────────

  describe("A3: History Inspection & Safe Rollback (Asana 1219846387400318)", () => {
    it("VIEW_HISTORY: manager-only read-only snapshot does not alter live game state", async () => {
      const { round, session, p1Socket, p2Socket, reachAnswers, start } =
        setupGame()
      await start()

      // Answer Q0 and advance to Q1
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      // Advance to interlude
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      expect(round.currentQuestionIndex).toBe(1)

      // Manager inspects Q0 history
      const res = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "VIEW_HISTORY",
          payload: { questionIndex: 0 },
          requestId: "req-view-hist",
        },
        true,
        false,
      )

      expect(res?.success).toBe(true)
      expect(res?.history).toBeDefined()

      // Manager snapshot contains viewingHistory
      const mgrSnap = session?.getStateSnapshot("manager", [])
      expect(mgrSnap?.extras.viewingHistory).toBeDefined()

      // Player snapshot NEVER leaks viewingHistory
      const playerSnap = session?.getStateSnapshot("player", [])
      expect(playerSnap?.extras.viewingHistory).toBeUndefined()

      // Live game state remains firmly on Q1
      expect(round.currentQuestionIndex).toBe(1)
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      // Return to Live
      session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "VIEW_HISTORY",
          payload: {},
          requestId: "req-return-live",
        },
        true,
        false,
      )

      const liveSnap = session?.getStateSnapshot("manager", [])
      expect(liveSnap?.extras.viewingHistory).toBeUndefined()
    })

    it("REPLAY_FROM_CHECKPOINT: rolls back scores, leaderboard, bumps epoch, and resumes scoring afresh", async () => {
      const {
        round,
        session,
        p1Socket,
        p2Socket,
        playerManager,
        reachAnswers,
        start,
      } = setupGame()
      await start()

      // Q0 answered -> Alice gets points
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      const aliceScoreAfterQ0 = playerManager.findById("p1")?.points ?? 0
      expect(aliceScoreAfterQ0).toBeGreaterThan(0)

      // Advance to interlude
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(1)

      // Q1 answered -> Alice gets more points
      round.selectAnswer(p1Socket, [0, 1, 3])
      round.selectAnswer(p2Socket, [0, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      const aliceScoreAfterQ1 = playerManager.findById("p1")?.points ?? 0
      expect(aliceScoreAfterQ1).toBeGreaterThan(aliceScoreAfterQ0)

      const initialEpoch = session?.currentEpoch ?? 0

      // Replay from Q1 checkpoint (resets Q1 points, restores Q0 points)
      const replaySuccess = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "REPLAY_FROM_CHECKPOINT",
          payload: { questionIndex: 1, confirmed: true },
          requestId: "req-replay-1",
        },
        true,
        false,
      )

      expect(replaySuccess?.success).toBe(true)
      expect(session?.currentEpoch).toBe(initialEpoch + 1)

      // Alice's score must be rolled back to exact score after Q0
      const rolledBackScore = playerManager.findById("p1")?.points ?? 0
      expect(rolledBackScore).toBe(aliceScoreAfterQ0)

      // Replaying progresses through SHOW_PREPARED -> SELECT_ANSWER afresh
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(1)
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      // Alice answers Q1 again and gets scored once more
      round.selectAnswer(p1Socket, [0, 1, 3])
      round.selectAnswer(p2Socket, [0, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      const reScoredScore = playerManager.findById("p1")?.points ?? 0
      expect(reScoredScore).toBeGreaterThan(aliceScoreAfterQ0)
    })
  })

  // ── A4: CINEMATIC REVEAL & IMMEDIATE PERSONAL RESULTS ─────────────────────

  describe("A4: Post-Answer Distribution Data & Immediate Personal Results (Asana 1219846702589614)", () => {
    it("delivers personal results immediately to players without projector delay", async () => {
      const { round, p1Socket, p2Socket, playerResults, start } = setupGame()
      await start()

      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(playerResults.length).toBeGreaterThan(0)
      const isAlicePlayer = (res: { id: string }) => res.id === "p1"
      const r = playerResults.find(isAlicePlayer)
      expect(r?.correct).toBe(true)
      expect(r?.points).toBeGreaterThan(0)
    })

    it("produces immutable reveal distribution for single, multi, and estimation", async () => {
      const { round, p1Socket, p2Socket, reachAnswers, start } = setupGame()
      await start()

      // 1. Single Choice Distribution (Q0)
      // Alice selects 0, Bobby selects 1
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      const singleDist = round.getRevealDistribution()
      expect(singleDist).toBeDefined()
      expect(singleDist?.totalResponders).toBe(2)
      expect(singleDist?.eligiblePlayers).toBe(2)
      expect(singleDist?.options?.[0]?.count).toBe(1)
      expect(singleDist?.options?.[0]?.percentage).toBe(50)
      expect(singleDist?.options?.[0]?.isSolution).toBe(true)
      expect(singleDist?.options?.[1]?.count).toBe(1)
      expect(singleDist?.options?.[1]?.percentage).toBe(50)
      expect(singleDist?.options?.[1]?.isSolution).toBe(false)

      // Advance past interlude to Q1 (Multi)
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      // 2. Multi Choice Distribution (Q1: percentages do NOT force sum=100%)
      // Alice selects options 0 and 1; Bobby selects options 0 and 3
      round.selectAnswer(p1Socket, [0, 1])
      round.selectAnswer(p2Socket, [0, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      const multiDist = round.getRevealDistribution()
      // Distribution percentages for each selected option
      expect(multiDist?.options?.[0]?.percentage).toBe(100)
      expect(multiDist?.options?.[1]?.percentage).toBe(50)
      expect(multiDist?.options?.[3]?.percentage).toBe(50)
      const pctSum =
        (multiDist?.options?.[0]?.percentage ?? 0) +
        (multiDist?.options?.[1]?.percentage ?? 0) +
        (multiDist?.options?.[3]?.percentage ?? 0)
      expect(pctSum).toBe(200)

      // Advance past interlude to Q2 (Estimation)
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      // 3. Estimation Distribution (dedicated numeric contract)
      round.selectAnswer(p1Socket, [325])
      round.selectAnswer(p2Socket, [340])
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      const estDist = round.getRevealDistribution()
      expect(estDist?.estimation).toBeDefined()
      expect(estDist?.estimation?.target).toBe(330)
      expect(estDist?.estimation?.closestGuess).toBe(325)
      expect(estDist?.estimation?.guessesCount).toBe(2)
      expect(estDist?.options).toBeUndefined()
    })

    it("handles survey questions neutrally without solutions or points", async () => {
      const surveyQuiz = createSampleQuiz(QUIZZ_MODES.SURVEY)
      const { round, p1Socket, p2Socket, playerResults, start } =
        setupGame(surveyQuiz)
      await start()

      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [2])
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      const surveyDist = round.getRevealDistribution()
      expect(surveyDist?.solutions).toBeUndefined()
      expect(surveyDist?.options?.[0]?.isSolution).toBeUndefined()
      expect(surveyDist?.options?.[2]?.isSolution).toBeUndefined()

      // In survey, players receive WAIT ("game:answerNoted"), not SHOW_RESULT with points
      expect(playerResults.length).toBe(0)
    })

    it("handles zero answers / empty responses safely without divide-by-zero or crash", async () => {
      const { round, session, start } = setupGame()
      await start()

      // Nobody answers; manager ends timer
      session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "END_ANSWER_TIMER",
          payload: {},
          requestId: "req-zero-ans",
        },
        true,
        false,
      )
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      const zeroDist = round.getRevealDistribution()
      expect(zeroDist).toBeDefined()
      expect(zeroDist?.totalResponders).toBe(0)
      expect(zeroDist?.options?.[0]?.percentage).toBe(0)
      expect(zeroDist?.options?.[1]?.percentage).toBe(0)
    })
  })

  // ── SECURITY & IDEMPOTENCY ────────────────────────────────────────────────

  describe("Security, Epoch & Idempotency", () => {
    it("rejects command if payload contains stale epoch", async () => {
      const { session, start } = setupGame()
      await start()

      let thrown: unknown = null

      try {
        session?.handleCommand(
          {
            v: 1,
            gameId: "game-1",
            action: "NEXT_SCREEN",
            payload: { epoch: 999 },
            requestId: "req-stale-epoch",
          },
          true,
          false,
        )
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeDefined()
      expect((thrown as Error).message).toContain("staleEpoch")
    })

    it("enforces requestId idempotency on duplicate commands", async () => {
      const { session, start } = setupGame()
      await start()

      const res1 = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "SHOW_LEADERBOARD",
          payload: {},
          requestId: "req-idempotent-test",
        },
        true,
        false,
      )

      expect(res1?.success).toBe(true)
      expect(res1?.deduplicated).toBeUndefined()

      // Resending same requestId returns deduplicated: true
      const res2 = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "SHOW_LEADERBOARD",
          payload: {},
          requestId: "req-idempotent-test",
        },
        true,
        false,
      )

      expect(res2?.success).toBe(true)
      expect(res2?.deduplicated).toBe(true)
    })
  })

  // ── LOAD & SCALE ACCEPTANCE ───────────────────────────────────────────────

  describe("Load Acceptance: 100 Concurrent Simulated Participants", () => {
    it("scores 100 concurrent participants without dropped or duplicate answers", async () => {
      const fake = createFakeIo()
      const quizz = createSampleQuiz()
      const playerManager = new PlayerManager({
        io: fake.io,
        gameId: "game-100",
        gameMode: quizz.gameMode,
        getManagerId: () => "mgr-1",
        isStarted: () => true,
      })

      const sockets: Array<{
        id: string
        socket: ReturnType<typeof fake.createSocket>
      }> = []

      for (let i = 0; i < 100; i += 1) {
        const socket = fake.createSocket(`player_${i}`)
        playerManager.join(socket, `User_${i.toString().padStart(3, "0")}`)
        sockets.push({ id: `player_${i}`, socket })
      }

      expect(playerManager.count()).toBe(100)

      const round = new RoundManager({
        quizz,
        players: playerManager,
        cooldown: new CooldownTimer(fake.io, "game-100"),
        io: fake.io,
        gameId: "game-100",
        getManagerId: () => "mgr-1",
        broadcast: () => undefined,
        send: () => undefined,
        onNewQuestion: () => undefined,
        onGameFinished: () => undefined,
        getSettings: () => ({
          answersOnly: false,
          generatedUsernames: false,
          autoAdvance: {
            enable: false,
            responsesDelay: 5,
            leaderboardDelay: 5,
          },
        }),
      })

      const mgrSocket = fake.createSocket("mgr-1")
      void round.start(mgrSocket)

      const advanceToAccepting = async (): Promise<void> => {
        if (round.isCurrentlyAcceptingAnswers) {
          return
        }

        await vi.advanceTimersByTimeAsync(SECOND_MS)

        return advanceToAccepting()
      }

      await advanceToAccepting()

      // 100 concurrent submissions: 60 pick option 0 (correct), 40 pick option 1
      for (let i = 0; i < 100; i += 1) {
        const option = i < 60 ? 0 : 1
        round.selectAnswer(sockets[i].socket, [option])
      }

      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      const dist = round.getRevealDistribution()
      expect(dist?.totalResponders).toBe(100)
      expect(dist?.eligiblePlayers).toBe(100)
      expect(dist?.options?.[0]?.count).toBe(60)
      expect(dist?.options?.[0]?.percentage).toBe(60)
      expect(dist?.options?.[1]?.count).toBe(40)
      expect(dist?.options?.[1]?.percentage).toBe(40)
    })
  })

  // ── A5: UUID MAPPING & COMPOSITE SIDECAR CONSISTENCY ─────────────────────

  describe("A5: UUID Mapping & Sidecar Consistency (Asana 1219846828216071)", () => {
    it("maintains stable question IDs during duplicate, remove, and reorder", () => {
      const qIds = generateQuestionIds(3)
      const perQuestion: Record<string, { note: string }> = {
        [qIds[0]]: { note: "First question" },
        [qIds[1]]: { note: "Second question" },
        [qIds[2]]: { note: "Third question" },
      }

      // Reorder 0 -> 2
      const reordered = reorderQuestionIds(qIds, 0, 2)
      expect(reordered[2]).toBe(qIds[0])
      expect(reordered[0]).toBe(qIds[1])
      expect(perQuestion[reordered[2]].note).toBe("First question")

      // Duplicate question 1
      const dup = duplicateQuestion(qIds, perQuestion, 1)
      expect(dup.questionIds.length).toBe(4)
      expect(dup.questionIds[2]).toBe(dup.newQuestionId)
      expect(dup.perQuestion[dup.newQuestionId].note).toBe("Second question")

      // Remove question 1
      const rem = removeQuestion(qIds, perQuestion, 1)
      expect(rem.questionIds.length).toBe(2)
      expect(rem.removedQuestionId).toBe(qIds[1])
      expect(rem.perQuestion[rem.removedQuestionId]).toBeUndefined()

      // Remap question IDs for bundle import (fresh UUIDs, associations preserved)
      const remapped = remapQuestionIds(qIds, perQuestion)
      expect(remapped.questionIds.length).toBe(3)
      expect(remapped.questionIds[0]).not.toBe(qIds[0])
      const [freshQ0] = remapped.questionIds
      expect(remapped.perQuestion[freshQ0].note).toBe("First question")
    })

    it("rejects composite save when questionIds count does not match base quiz questions", () => {
      const qIds = generateQuestionIds(2)
      const baseQuiz = {
        id: "quiz-mismatch",
        gameMode: "quiz",
        subject: "Mismatch",
        // 3 questions in base quiz
        questions: [{ question: "Q1" }, { question: "Q2" }, { question: "Q3" }],
      }

      const digest = computeCanonicalBaseDigest(baseQuiz)
      // Only 2 question IDs provided
      const extras = createDefaultQuizExtras("quiz-mismatch", qIds, digest)

      const storage = new CompositeStorageService({
        getPath: () => "",
        getQuizzById: () => baseQuiz,
        saveQuizz: () => ({ id: "quiz-mismatch" }),
        updateQuizz: () => ({ id: "quiz-mismatch" }),
        deleteQuizz: () => undefined,
      })

      let thrown: unknown = null

      try {
        storage.saveCompositeQuiz({
          quizId: "quiz-mismatch",
          expectedRevision: 1,
          quizz: baseQuiz,
          extras,
        })
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeDefined()
      expect((thrown as CompositeStorageError).statusCode).toBe(400)
      expect((thrown as Error).message).toContain("Question IDs count mismatch")
    })
  })

  // ── P1: Authoritative Previous Screen Navigation Tests ─────────────────────
  describe("P1: Authoritative Previous Screen Navigation", () => {
    it("requires confirmation when PREVIOUS_SCREEN is requested during active answering with submitted answers", async () => {
      const { round, session, p1Socket, p2Socket, reachAnswers, start } =
        setupGame()
      await start()

      // Complete Q0 and advance to Q1
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")
      round.nextScreen()
      round.endOrSkipInterlude()
      await reachAnswers()

      expect(round.currentQuestionIndex).toBe(1)
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)

      // Submit an answer on Q1
      round.selectAnswer(p1Socket, [0, 1, 3])

      const state = session?.getStateSnapshot("manager", [])
      expect(state?.extras.canPrevious).toBe(true)
      expect(state?.extras.willReopenQuestion).toBe(true)
      expect(state?.extras.answersReceived).toBe(1)

      let thrown: unknown = null

      try {
        session?.handleCommand(
          {
            v: 1,
            gameId: "game-1",
            action: "PREVIOUS_SCREEN",
            payload: {},
            requestId: "req-prev-during-answers",
          },
          true,
          false,
        )
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeDefined()
      expect((thrown as Error).message).toContain(
        "previousScreenConfirmationRequired",
      )

      // With confirmed: true, active vote is cancelled and previous screen is reached
      const confirmedRes = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "PREVIOUS_SCREEN",
          payload: { confirmed: true },
          requestId: "req-prev-confirmed-during-answers",
        },
        true,
        false,
      )

      expect(confirmedRes?.success).toBe(true)
      expect(round.currentQuestionIndex).toBe(0)
    })

    it("rejects non-manager attempts to send PREVIOUS_SCREEN", async () => {
      const { session, start } = setupGame()
      await start()

      let thrown: unknown = null

      try {
        session?.handleCommand(
          {
            v: 1,
            gameId: "game-1",
            action: "PREVIOUS_SCREEN",
            payload: {},
            requestId: "req-malicious-viewer-prev",
          },
          false, // Not manager
          false,
        )
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeDefined()
      expect((thrown as Error).message).toContain("unauthorized")
    })

    it("navigates back from leaderboard to reveal within the same question", async () => {
      const { round, session, p1Socket, p2Socket, start } = setupGame(
        undefined,
        { showLeaderboard: true },
      )
      await start()

      // Answer Q0: 0 is Paris (solution)
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [0])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      // Advance to leaderboard
      round.nextScreen()
      expect(round.currentStepName).toBe("leaderboard")

      // Send PREVIOUS_SCREEN via session
      const prevRes = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "PREVIOUS_SCREEN",
          payload: {},
          requestId: "req-prev-to-reveal",
        },
        true,
        false,
      )

      expect(prevRes?.success).toBe(true)
      expect(round.currentStepName).toBe("reveal")
    })

    it("reopens question for fresh vote, removes old question contribution, and preserves other questions", async () => {
      const {
        round,
        session,
        playerManager,
        p1Socket,
        p2Socket,
        reachAnswers,
        start,
      } = setupGame()
      await start()

      // Q0: Alice scores 1000 points (solution is [0]), Bob scores 0
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1]) // Bob wrong
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")

      const alice = playerManager.findById("p1")
      const bob = playerManager.findById("p2")
      expect(alice?.points).toBe(1000)
      expect(bob?.points).toBe(0)

      // Advance to Q1
      round.nextScreen() // To interlude
      round.endOrSkipInterlude()
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(1)

      // Q1 solutions are [0, 1, 3] (Alice gets 1000, Bob gets 1000)
      round.selectAnswer(p1Socket, [0, 1, 3])
      round.selectAnswer(p2Socket, [0, 1, 3])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")
      expect(round.currentQuestionIndex).toBe(1)

      // Total before stepping back: Alice 2000, Bob 1000
      expect(playerManager.findById("p1")?.points).toBe(2000)
      expect(playerManager.findById("p2")?.points).toBe(1000)

      // Step back from Q1 reveal: reaches Q1 question card, step back again to Q0
      // Calling previousScreen reopens Q0 for a fresh vote!
      round.reopenQuestion(0)
      await reachAnswers()

      expect(round.currentQuestionIndex).toBe(0)
      expect(round.isCurrentlyAcceptingAnswers).toBe(true)
      expect(round.getAnswerCount()).toBe(0)

      // During reopened Q0: Q0's old points are removed, Q1 points are preserved!
      // Alice has 1000 (from Q1), Bob has 1000 (from Q1)
      expect(playerManager.findById("p1")?.points).toBe(1000)
      expect(playerManager.findById("p2")?.points).toBe(1000)

      // Both players answer Q0 afresh! Both answer correctly ([0])
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [0])
      await vi.advanceTimersByTimeAsync(SECOND_MS)

      // Results revealed: newly computed total is new Q0 (1000 each) + original Q1 (1000 each) = 2000 each
      expect(playerManager.findById("p1")?.points).toBe(2000)
      expect(playerManager.findById("p2")?.points).toBe(2000)
    })
  })

  describe("P0 authoritative pause/resume", () => {
    it("freezes the vote deadline, rejects paused votes, and resumes once", async () => {
      const { round, session, p1Socket, p2Socket, playerResults, start } =
        setupGame()
      await start()
      round.selectAnswer(p1Socket, [0])
      const before = round.getPauseSnapshot().remainingMs

      const paused = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "PAUSE_GAME",
          payload: { epoch: session.currentEpoch },
          requestId: "pause-q1",
        },
        true,
      )
      expect(paused?.success).toBe(true)
      expect(round.isPaused).toBe(true)
      expect(session?.getStateSnapshot("manager", []).pause?.paused).toBe(true)

      round.selectAnswer(p2Socket, [1])
      expect(round.getAnswerCount()).toBe(1)
      await vi.advanceTimersByTimeAsync(20 * SECOND_MS)
      expect(round.currentStepName).toBeNull()
      expect(round.getPauseSnapshot().remainingMs).toBe(before)

      const resumed = session?.handleCommand(
        {
          v: 1,
          gameId: "game-1",
          action: "RESUME_GAME",
          payload: { epoch: session.currentEpoch },
          requestId: "resume-q1",
        },
        true,
      )
      expect(resumed?.success).toBe(true)
      expect(round.isPaused).toBe(false)

      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.currentStepName).toBe("reveal")
      expect(playerResults).toHaveLength(2)
    })

    it("freezes and resumes an automatic interlude without stale advancement", async () => {
      const { round, session, p1Socket, p2Socket, start, reachAnswers } =
        setupGame()
      await start()
      round.selectAnswer(p1Socket, [0])
      round.selectAnswer(p2Socket, [1])
      await vi.advanceTimersByTimeAsync(SECOND_MS)
      expect(round.nextScreen()).toBe(true)
      expect(round.currentStepName).toBe("interlude")

      expect(round.pauseGame()).toBe(true)
      const remaining = round.getPauseSnapshot().remainingMs
      expect(remaining).toBe(3000)
      await vi.advanceTimersByTimeAsync(10000)
      expect(round.currentQuestionIndex).toBe(0)
      expect(round.currentStepName).toBe("interlude")

      expect(round.resumeGame()).toBe(true)
      await vi.advanceTimersByTimeAsync(remaining ?? 0)
      await reachAnswers()
      expect(round.currentQuestionIndex).toBe(1)
      expect(session?.currentPhase).toBe("question")
    })
  })
})
