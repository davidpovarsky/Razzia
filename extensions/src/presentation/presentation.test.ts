import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
  assignRoundRobin,
  calculateInterludeRemainingMs,
  clampNormalizedStagePoint,
  computeLateJoinVideoSeekSeconds,
  computeOverlayStageStyle,
  evaluateOverlayPlaybackState,
  formatHistoryItem,
  LottiePlayer,
  processInterludeSkip,
  projectTeamScores,
  resolveAudioCue,
  ScenePresenter,
  shouldAutoAdvanceInterlude,
  shouldDuckMusic,
} from "./index"

describe("PRESENTATION & AUDIO Acceptance Cases & Unit Tests", () => {
  describe("AUDIO01 & AUDIO02: Audio Cues & Ducking", () => {
    it("AUDIO01: resolveAudioCue uses default when no custom extras", () => {
      const cue = resolveAudioCue("start")
      expect(cue.url).toBe("/sounds/boump.mp3")
      expect(cue.enabled).toBe(true)
      expect(cue.volume).toBe(0.8)
      expect(cue.isDefault).toBe(true)
    })

    it("AUDIO01: resolveAudioCue respects volume=0 or enabled=false (mute)", () => {
      const mutedExtras = {
        cues: {
          start: {
            source: "default" as const,
            volume: 0,
            enabled: true,
            loop: false,
          },
          answersMusic: {
            source: "default" as const,
            volume: 0.8,
            enabled: false,
            loop: true,
          },
          showQuestion: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          answerPressed: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          revealResults: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          leaderboard: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium1: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium2: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium3: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
        },
      }

      const startCue = resolveAudioCue("start", mutedExtras)
      expect(startCue.enabled).toBe(false)
      expect(startCue.volume).toBe(0)

      const musicCue = resolveAudioCue("answersMusic", mutedExtras)
      expect(musicCue.enabled).toBe(false)
    })

    it("AUDIO01: custom safe media URL is respected", () => {
      const customExtras = {
        cues: {
          start: {
            source: "media" as const,
            url: "/media/custom-start.mp3",
            volume: 0.9,
            enabled: true,
            loop: false,
          },
          answersMusic: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: true,
          },
          showQuestion: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          answerPressed: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          revealResults: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          leaderboard: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium1: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium2: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
          podium3: {
            source: "default" as const,
            volume: 0.8,
            enabled: true,
            loop: false,
          },
        },
      }

      const startCue = resolveAudioCue("start", customExtras)
      expect(startCue.url).toBe("/media/custom-start.mp3")
      expect(startCue.isDefault).toBe(false)
      expect(startCue.volume).toBe(0.9)
    })

    it("AUDIO02: ducks background music when question media has competing audio/video", () => {
      // Background music ducks when video/audio is active
      expect(shouldDuckMusic(true, "answersMusic")).toBe(true)

      // Background music does not duck when question has image or no media
      expect(shouldDuckMusic(false, "answersMusic")).toBe(false)

      // Other cues (like answer button chime) are not ducked
      expect(shouldDuckMusic(true, "answerPressed")).toBe(false)
    })
  })

  describe("INT01 & INT02: Interlude Lifecycle & Snapshot Resume", () => {
    it("INT01: enforces skipping interlude exactly once (idempotent)", () => {
      const initial = { hasSkipped: false }

      // First skip invocation: should emit
      const step1 = processInterludeSkip(initial, 1000)
      expect(step1.shouldEmitSkip).toBe(true)
      expect(step1.state.hasSkipped).toBe(true)

      // Second skip invocation: must NOT emit again
      const step2 = processInterludeSkip(step1.state, 1500)
      expect(step2.shouldEmitSkip).toBe(false)
      expect(step2.state.hasSkipped).toBe(true)
    })

    it("INT01: shouldAutoAdvanceInterlude evaluates accurately", () => {
      const autoInterlude = {
        kind: "countdown" as const,
        durationMs: 5000,
        advance: "auto" as const,
      }

      const manualInterlude = {
        kind: "title" as const,
        durationMs: 5000,
        advance: "manual" as const,
      }

      const startedAt = 10000

      // At 12000 (2000 elapsed < 5000): should not advance
      expect(shouldAutoAdvanceInterlude(autoInterlude, startedAt, 12000)).toBe(
        false,
      )

      // At 15000 (5000 elapsed >= 5000): auto advances
      expect(shouldAutoAdvanceInterlude(autoInterlude, startedAt, 15000)).toBe(
        true,
      )

      // Manual interlude never auto-advances even when duration elapsed
      expect(
        shouldAutoAdvanceInterlude(manualInterlude, startedAt, 16000),
      ).toBe(false)
    })

    it("INT02: reconnect mid-interlude resumes from server startedAt without resetting", () => {
      const startedAt = 100000
      // 10 seconds total
      const durationMs = 10000

      // Client reconnects at 104000 (4 seconds elapsed)
      const reconnectTime = 104000
      const remaining = calculateInterludeRemainingMs(
        startedAt,
        durationMs,
        reconnectTime,
      )

      // Remaining must be exactly 6000ms (not reset back to 10000ms!)
      expect(remaining).toBe(6000)
    })

    it("INT02: clamp remaining to 0 if reconnected after interlude ended", () => {
      const startedAt = 100000
      const durationMs = 5000
      // 10s elapsed > 5s
      const lateReconnect = 110000

      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, lateReconnect),
      ).toBe(0)
    })

    it("INT03: validates all 4 interlude screen kinds (title, image, video, countdown)", () => {
      const kinds = ["title", "image", "video", "countdown"] as const
      for (const kind of kinds) {
        const item = {
          kind,
          title: `Interlude ${kind}`,
          url:
            kind === "image" || kind === "video"
              ? `/media/test.${kind === "image" ? "png" : "mp4"}`
              : undefined,
          durationMs: 5000,
          advance: "auto" as const,
        }
        expect(item.kind).toBe(kind)
        expect(item.durationMs).toBe(5000)
      }
    })
  })

  describe("TEAM01, TEAM02, TEAM03: Team Assignment & Score Projection", () => {
    const teams = [
      { id: "team-red", name: "Red Dragons", color: "#ef4444" },
      { id: "team-blue", name: "Blue Hawks", color: "#3b82f6" },
      { id: "team-green", name: "Green Vipers", color: "#22c55e" },
    ]

    it("TEAM01: 3 teams, 8 players assigned round-robin -> counts 3/3/2", () => {
      const players = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]
      const assignments = assignRoundRobin(teams, players)

      let redCount = 0
      let blueCount = 0
      let greenCount = 0

      for (const t of Object.values(assignments)) {
        if (t === "team-red") {
          redCount += 1
        } else if (t === "team-blue") {
          blueCount += 1
        } else if (t === "team-green") {
          greenCount += 1
        }
      }

      expect(redCount).toBe(3)
      expect(blueCount).toBe(3)
      expect(greenCount).toBe(2)
    })

    it("TEAM02: handles point ties deterministically (tie by case-insensitive name then ID)", () => {
      const twoTeams = [
        { id: "team-b", name: "Bravo Team", color: "#3b82f6" },
        { id: "team-a", name: "Alpha Team", color: "#ef4444" },
      ]

      const players = [
        { id: "p1", clientId: "c1", username: "Alice", points: 50 },
        { id: "p2", clientId: "c2", username: "Bob", points: 50 },
      ]

      const assignments = {
        c1: "team-b",
        c2: "team-a",
      }

      const result = projectTeamScores(twoTeams, players, assignments)

      expect(result).toHaveLength(2)
      expect(result[0].totalPoints).toBe(50)
      expect(result[1].totalPoints).toBe(50)

      // Both have 50 points -> "Alpha Team" comes before "Bravo Team" alphabetically
      expect(result[0].team.name).toBe("Alpha Team")
      expect(result[1].team.name).toBe("Bravo Team")
      expect(result[0].rank).toBe(1)
      // Rank tie
      expect(result[1].rank).toBe(1)
    })

    it("TEAM02: stable assignment by clientId across socket reconnect", () => {
      const twoTeams = [{ id: "t1", name: "Team 1", color: "#000" }]
      const assignments = { "stable-client-uuid": "t1" }

      // Player reconnects: new socket id "socket-999", but same clientId
      const player = {
        id: "socket-999",
        clientId: "stable-client-uuid",
        username: "Player 1",
        points: 100,
      }

      const result = projectTeamScores(twoTeams, [player], assignments)
      expect(result[0].totalPoints).toBe(100)
      expect(result[0].memberCount).toBe(1)
    })

    it("TEAM03: disconnected players keep earned points; kicked players are removed", () => {
      const twoTeams = [{ id: "t1", name: "Team 1", color: "#000" }]
      const assignments = {
        c1: "t1",
        c2: "t1",
      }

      // C1 is active (50 pts), c2 is disconnected (40 pts)
      const players = [
        {
          id: "p1",
          clientId: "c1",
          username: "Alice",
          points: 50,
          connected: true,
        },
        {
          id: "p2",
          clientId: "c2",
          username: "Bob",
          points: 40,
          connected: false,
        },
      ]

      const resultWithDisconnected = projectTeamScores(
        twoTeams,
        players,
        assignments,
      )
      // Disconnected Bob retains earned points -> 50 + 40 = 90
      expect(resultWithDisconnected[0].totalPoints).toBe(90)
      expect(resultWithDisconnected[0].memberCount).toBe(2)
      expect(resultWithDisconnected[0].connectedCount).toBe(1)

      // When Bob is kicked, he is removed from player list before next projection
      const playersAfterKick = [players[0]]
      const resultAfterKick = projectTeamScores(
        twoTeams,
        playersAfterKick,
        assignments,
      )
      expect(resultAfterKick[0].totalPoints).toBe(50)
      expect(resultAfterKick[0].memberCount).toBe(1)
    })
  })

  describe("HIST01: formatHistoryItem Data Contract Robustness", () => {
    it("safely handles null, undefined, primitives, or empty objects", () => {
      expect(formatHistoryItem(null)).toBeNull()
      expect(formatHistoryItem(undefined)).toBeNull()
      expect(formatHistoryItem("invalid")).toBeNull()
      expect(formatHistoryItem(42)).toBeNull()

      const empty = formatHistoryItem({}, 2)
      expect(empty).not.toBeNull()
      expect(empty?.questionText).toBe("")
      expect(empty?.questionType).toBe("single")
      expect(empty?.playerAnswersCount).toBe(0)
      expect(empty?.questionIndex).toBe(2)
    })

    it("formats raw backend QuestionResult (question, type, playerAnswers array)", () => {
      const rawQuestionResult = {
        question: "What is the capital of France?",
        type: "single",
        answers: ["Paris", "Lyon", "Marseille", "Toulouse"],
        solutions: [0],
        playerAnswers: [
          { playerName: "Alice", answerIds: [0], correct: true, points: 100 },
          { playerName: "Bob", answerIds: [1], correct: false, points: 0 },
          { playerName: "Charlie", answerIds: [0], correct: true, points: 90 },
        ],

        skipped: false,
      }

      const formatted = formatHistoryItem(rawQuestionResult, 0)
      expect(formatted).not.toBeNull()
      expect(formatted?.questionText).toBe("What is the capital of France?")
      expect(formatted?.questionType).toBe("single")
      expect(formatted?.playerAnswersCount).toBe(3)
      expect(formatted?.answers).toEqual([
        "Paris",
        "Lyon",
        "Marseille",
        "Toulouse",
      ])
      expect(formatted?.solutions).toEqual([0])
      expect(formatted?.skipped).toBe(false)
      expect(formatted?.playerAnswers).toHaveLength(3)
    })

    it("formats HistorySummaryItem contract (questionText, questionType, playerAnswersCount)", () => {
      const summaryItem = {
        questionIndex: 3,
        questionText: "Which elements are noble gases?",
        questionType: "multi",
        playerAnswersCount: 8,
        skipped: true,
        skipReason: "host_skip",
      }

      const formatted = formatHistoryItem(summaryItem)
      expect(formatted?.questionIndex).toBe(3)
      expect(formatted?.questionText).toBe("Which elements are noble gases?")
      expect(formatted?.questionType).toBe("multi")
      expect(formatted?.playerAnswersCount).toBe(8)
      expect(formatted?.skipped).toBe(true)
      expect(formatted?.skipReason).toBe("host_skip")
    })
  })

  describe("INT04: Interlude Drift, Reconnect, Double-Click & Epoch Resilience", () => {
    it("handles clock drift: client clock ahead or behind server", () => {
      const startedAt = 50000
      const durationMs = 10000

      // Client clock is behind server (now < startedAt) -> clamps to full duration
      const behindNow = 48000
      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, behindNow),
      ).toBe(10000)

      // Client clock is far ahead of server (now > startedAt + durationMs) -> clamps to 0
      const aheadNow = 65000
      expect(
        calculateInterludeRemainingMs(startedAt, durationMs, aheadNow),
      ).toBe(0)

      // Normal mid-flight
      const midNow = 54000
      expect(calculateInterludeRemainingMs(startedAt, durationMs, midNow)).toBe(
        6000,
      )
    })

    it("double-click skip idempotency: emits skip action exactly once", () => {
      const state = { hasSkipped: false }

      // First click
      const first = processInterludeSkip(state, 1000)
      expect(first.shouldEmitSkip).toBe(true)
      expect(first.state.hasSkipped).toBe(true)
      const { state: updatedState } = first

      // Second click (double click)
      const second = processInterludeSkip(updatedState, 1050)
      expect(second.shouldEmitSkip).toBe(false)
      expect(second.state.hasSkipped).toBe(true)
    })

    it("manual skip near timeout: safe single invocation", () => {
      const startedAt = 10000
      const durationMs = 5000
      // 50ms before expiry
      const nearTimeout = 14950

      const remaining = calculateInterludeRemainingMs(
        startedAt,
        durationMs,
        nearTimeout,
      )
      expect(remaining).toBe(50)

      const skipResult = processInterludeSkip(
        { hasSkipped: false },
        nearTimeout,
      )
      expect(skipResult.shouldEmitSkip).toBe(true)
      expect(skipResult.state.hasSkipped).toBe(true)
    })
  })

  describe("STUDIO01: ScenePresenter & LottiePlayer Rendering", () => {
    it("renders Cumulative Answer Recap scene with winning options, badges, and pagination", () => {
      const html = renderToStaticMarkup(
        React.createElement(ScenePresenter, {
          scene: {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "answerRecap",
            title: "Round 1 Recap",
            subtitle: "Top community answers",
            mode: "mostSelected",
            maxItemsPerPage: 2,
            showCounts: true,
            showPercentages: true,
            durationMs: 8000,
            advance: "auto",
          },
          activeSceneData: {
            answerRecap: {
              totalQuestionsInRange: 3,
              completedQuestionsCount: 3,
              title: "Round 1 Recap",
              subtitle: "Top community answers",
              startQuestionId: "11111111-1111-4111-8111-111111111111",
              endQuestionId: "33333333-3333-4333-8333-333333333333",
              mode: "mostSelected",
              maxItemsPerPage: 2,
              showCounts: true,
              showPercentages: true,
              items: [
                {
                  questionId: "11111111-1111-4111-8111-111111111111",
                  questionNumber: 1,
                  questionText: "Best snack?",
                  playMode: "survey",
                  badgeType: "mostSelected",
                  totalResponders: 10,
                  isTie: false,
                  winningOptions: [
                    {
                      answerIndex: 0,
                      label: "Popcorn",
                      count: 7,
                      percentage: 70,
                    },
                  ],
                },
                {
                  questionId: "22222222-2222-4222-8222-222222222222",
                  questionNumber: 2,
                  questionText: "2 + 2?",
                  playMode: "quiz",
                  badgeType: "correctAnswer",
                  totalResponders: 10,
                  isTie: false,
                  winningOptions: [
                    {
                      answerIndex: 1,
                      label: "4",
                      count: 9,
                      percentage: 90,
                    },
                  ],
                },
                {
                  questionId: "33333333-3333-4333-8333-333333333333",
                  questionNumber: 3,
                  questionText: "Unanswered question?",
                  playMode: "survey",
                  badgeType: "noResponses",
                  totalResponders: 0,
                  isTie: false,
                  winningOptions: [],
                },
              ],
            },
          },
        }),
      )

      expect(html).toContain('data-testid="scene-answer-recap"')
      expect(html).toContain('data-testid="recap-question-card"')
      expect(html).toContain("Best snack?")
      expect(html).toContain("Popcorn")
      expect(html).toContain("70% (7)")
      expect(html).toContain("Correct Answer")
      expect(html).toContain('data-testid="recap-pagination-bar"')
      expect(html).toContain("Page 1 of 2")
    })

    it("renders audio media scene and full-stage cinema opening scene", () => {
      const audioHtml = renderToStaticMarkup(
        React.createElement(ScenePresenter, {
          scene: {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "media",
            title: "Mystery Sound Clip",
            mediaUrl: "/media/fanfare.mp3",
            mediaType: "audio",
            durationMs: 6000,
            advance: "onMediaEnd",
          },
        }),
      )
      expect(audioHtml).toContain('data-testid="scene-audio"')
      expect(audioHtml).toContain("/media/fanfare.mp3")

      const cinemaHtml = renderToStaticMarkup(
        React.createElement(ScenePresenter, {
          scene: {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "opening",
            title: "Grand Finale",
            subtitle: "Welcome Everyone",
            mediaUrl: "/media/intro.mp4",
            mediaType: "video",
            stageLayout: "cinema",
            mediaFit: "cover",
            logoPosition: "top",
            textOverlay: true,
            durationMs: 8000,
            advance: "onMediaEnd",
          },
        }),
      )
      expect(cinemaHtml).toContain('data-layout="cinema"')
      expect(cinemaHtml).toContain('data-testid="scene-cinema-backdrop"')
      expect(cinemaHtml).toContain('data-logo-position="top"')
    })

    it("renders LottiePlayer with valid inline JSON and neutral empty state when omitted", () => {
      const emptyHtml = renderToStaticMarkup(
        React.createElement(LottiePlayer, {
          emptyLabel: "Upload a Lottie JSON file",
        }),
      )
      expect(emptyHtml).toContain('data-testid="lottie-player-empty"')
      expect(emptyHtml).toContain("Upload a Lottie JSON file")

      const validHtml = renderToStaticMarkup(
        React.createElement(LottiePlayer, {
          data: {
            v: "5.7.4",
            fr: 30,
            ip: 0,
            op: 60,
            w: 200,
            h: 200,
            layers: [
              {
                ty: 4,
                nm: "Dot",
                ks: {},
                shapes: [
                  { ty: "el", s: { a: 0, k: [80, 80] } },
                  { ty: "fl", c: { a: 0, k: [1, 0.5, 0, 1] } },
                ],
              },
            ],
          },
        }),
      )
      expect(validHtml).toContain('data-testid="lottie-player-svg"')
    })
  })

  describe("GATE 1, 2, 4: Cinematic Clock, Geometry & Multi-Layer Compositor", () => {
    const overlayA = {
      id: "overlay-a",
      label: "Emblem Hold",
      enabled: true,
      assetUrl: "/media/emblem.json",
      order: 0,
      layer: "aboveTitle" as const,
      timeBase: "video" as const,
      startMs: 2500,
      loop: false,
      speed: 1,
      finish: "holdLastFrame" as const,
      position: { x: 0.5, y: 0.22 },
      anchor: "center" as const,
      widthPct: 28,
      fit: "contain" as const,
      opacity: 1,
      rotationDeg: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
    }

    const overlayB = {
      id: "overlay-b",
      label: "Corner Frame",
      enabled: true,
      assetUrl: "/media/frame.json",
      order: 1,
      layer: "behindTitle" as const,
      timeBase: "video" as const,
      startMs: 0,
      durationMs: 8000,
      loop: true,
      speed: 1,
      finish: "hide" as const,
      position: { x: 0.5, y: 0.5 },
      anchor: "center" as const,
      widthPct: 82,
      fit: "contain" as const,
      opacity: 1,
      rotationDeg: 0,
      fadeInMs: 0,
      fadeOutMs: 0,
    }

    const overlayC = {
      id: "overlay-c",
      label: "Banner Reveal",
      enabled: true,
      assetUrl: "/media/banner.json",
      order: 2,
      layer: "aboveTitle" as const,
      timeBase: "video" as const,
      startMs: 6000,
      durationMs: 2000,
      loop: false,
      speed: 1,
      finish: "hide" as const,
      position: { x: 0.5, y: 0.78 },
      anchor: "center" as const,
      widthPct: 40,
      fit: "contain" as const,
      opacity: 1,
      rotationDeg: 0,
      fadeInMs: 200,
      fadeOutMs: 200,
    }

    const makeClock = (videoTimeMs: number) => ({
      hasVideoBackdrop: true,
      videoTimeMs,
      isVideoPaused: false,
      sceneTimeMs: videoTimeMs,
    })

    it("evaluates Overlay A, B, and C visibility, holdLastFrame, loop, and fade at 0s, 1.5s, 3s, 5.8s, 6.5s, 8s", () => {
      // 0.0s (0ms): B visible, A and C hidden
      const a0 = evaluateOverlayPlaybackState(overlayA, makeClock(0), 3000)
      const b0 = evaluateOverlayPlaybackState(overlayB, makeClock(0), 2000)
      const c0 = evaluateOverlayPlaybackState(overlayC, makeClock(0), 2000)
      expect(a0.visible).toBe(false)
      expect(b0.visible).toBe(true)
      expect(b0.localElapsedMs).toBe(0)
      expect(c0.visible).toBe(false)

      // 1.5s (1500ms): B visible, A and C hidden
      expect(
        evaluateOverlayPlaybackState(overlayA, makeClock(1500), 3000).visible,
      ).toBe(false)
      expect(
        evaluateOverlayPlaybackState(overlayB, makeClock(1500), 2000).visible,
      ).toBe(true)
      expect(
        evaluateOverlayPlaybackState(overlayC, makeClock(1500), 2000).visible,
      ).toBe(false)

      // 3.0s (3000ms): A and B visible, C hidden
      const a3 = evaluateOverlayPlaybackState(overlayA, makeClock(3000), 3000)
      expect(a3.visible).toBe(true)
      expect(a3.phase).toBe("playing")
      expect(a3.localElapsedMs).toBe(500)
      expect(
        evaluateOverlayPlaybackState(overlayB, makeClock(3000), 2000).visible,
      ).toBe(true)
      expect(
        evaluateOverlayPlaybackState(overlayC, makeClock(3000), 2000).visible,
      ).toBe(false)

      // 5.8s (5800ms): A visible and holding last frame (5800 >= 2500 + 3000), B visible, C hidden
      const a58 = evaluateOverlayPlaybackState(overlayA, makeClock(5800), 3000)
      expect(a58.visible).toBe(true)
      expect(a58.phase).toBe("holdingLastFrame")
      expect(a58.seekTimeMs).toBe(3000)
      expect(
        evaluateOverlayPlaybackState(overlayB, makeClock(5800), 2000).visible,
      ).toBe(true)
      expect(
        evaluateOverlayPlaybackState(overlayC, makeClock(5800), 2000).visible,
      ).toBe(false)

      // 6.5s (6500ms): A visible (held), B visible, C visible (6500 in 6000..8000)
      expect(
        evaluateOverlayPlaybackState(overlayA, makeClock(6500), 3000).visible,
      ).toBe(true)
      expect(
        evaluateOverlayPlaybackState(overlayA, makeClock(6500), 3000).phase,
      ).toBe("holdingLastFrame")
      expect(
        evaluateOverlayPlaybackState(overlayB, makeClock(6500), 2000).visible,
      ).toBe(true)
      const c65 = evaluateOverlayPlaybackState(overlayC, makeClock(6500), 2000)
      expect(c65.visible).toBe(true)
      expect(c65.localElapsedMs).toBe(500)
      expect(c65.effectiveOpacity).toBeCloseTo(1, 3)

      // 8.0s (8000ms): A still held (no durationMs cutoff), B and C hidden (durationMs window ended)
      expect(
        evaluateOverlayPlaybackState(overlayA, makeClock(8000), 3000).visible,
      ).toBe(true)
      expect(
        evaluateOverlayPlaybackState(overlayB, makeClock(8000), 2000).visible,
      ).toBe(false)
      expect(
        evaluateOverlayPlaybackState(overlayC, makeClock(8000), 2000).visible,
      ).toBe(false)
    })

    it("computes late-join / reconnect video seek position deterministically", () => {
      const seekSec = computeLateJoinVideoSeekSeconds({
        serverStartedAt: 100000,
        nowMs: 103500,
        videoDurationSeconds: 8,
        loop: false,
      })
      expect(seekSec).toBeCloseTo(3.5, 3)

      const loopedSeek = computeLateJoinVideoSeekSeconds({
        serverStartedAt: 100000,
        nowMs: 110500,
        videoDurationSeconds: 8,
        loop: true,
      })
      expect(loopedSeek).toBeCloseTo(2.5, 3)
    })

    it("computes aspect-preserving stage style and clamps normalized dragging safely", () => {
      const styleA = computeOverlayStageStyle(overlayA, 0.9)
      expect(styleA.left).toBe("50.00%")
      expect(styleA.top).toBe("22.00%")
      expect(styleA.width).toBe("28.00%")
      expect(styleA.opacity).toBe(0.9)
      expect(styleA.transform).toContain("translate(-50%, -50%)")

      const clamped = clampNormalizedStagePoint(-0.2, 1.5)
      expect(clamped.x).toBe(0)
      expect(clamped.y).toBe(1)
    })

    it("renders CinematicLayerStack and ScenePresenter with all 6 composited layers and never links Lottie completion to onMediaEnded", () => {
      const html = renderToStaticMarkup(
        React.createElement(ScenePresenter, {
          scene: {
            id: "11111111-1111-4111-8111-111111111111",
            kind: "opening",
            title: "Grand Showdown",
            subtitle: "Live Broadcast",
            mediaUrl: "/media/intro.mp4",
            mediaType: "video",
            stageLayout: "cinema",
            mediaFit: "cover",
            logoPosition: "center",
            textOverlay: true,
            durationMs: 5000,
            advance: "onMediaEnd",
            overlayAnimations: [overlayA, overlayB, overlayC],
          },
          controlledTimeMs: 3000,
        }),
      )

      expect(html).toContain('data-testid="cinematic-layer-stack-opening"')
      expect(html).toContain('data-testid="scene-cinema-backdrop"')
      expect(html).toContain('data-testid="cinematic-layer-tint-opening"')
      expect(html).toContain('data-testid="cinematic-layer-behind-title"')
      expect(html).toContain('data-testid="cinematic-layer-native-title"')
      expect(html).toContain('data-testid="cinematic-layer-above-title"')
      expect(html).toContain('data-testid="cinematic-layer-interactive"')
      expect(html).toContain('data-testid="cinematic-overlay-overlay-a"')
      expect(html).toContain('data-testid="cinematic-overlay-overlay-b"')
      expect(html).toContain('data-testid="cinematic-overlay-overlay-c"')
      // Overlay A and B are visible at 3000ms, Overlay C is hidden at 3000ms
      expect(html).toContain('data-overlay-id="overlay-a"')
      expect(html).toContain('data-overlay-visible="true"')
      expect(html).toContain('data-overlay-visible="false"')
    })
  })
})
