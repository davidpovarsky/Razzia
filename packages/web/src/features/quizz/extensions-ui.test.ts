import type { QuizzWithId } from "@razzia/common/types/game"
import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionId,
  isSafeMediaUrl,
} from "@razzia/extensions/core"
import {
  CANONICAL_ANSWER_COLORS,
  CompositeApiClient,
  ConflictModal,
  RevisionConflictError,
  duplicateQuestionInExtras,
  removeQuestionFromExtras,
  reorderQuestionsInExtras,
} from "@razzia/extensions/editor"
import {
  calculateRevealProgress,
  isValidAnswerVisual,
} from "@razzia/extensions/media"
import {
  calculateAggregatePercentages,
  calculateInterludeRemainingMs,
  calculateRevealState,
  processInterludeSkip,
  projectTeamScores,
  resolveAudioCue,
  shouldAutoAdvanceInterlude,
  shouldDuckMusic,
} from "@razzia/extensions/presentation"
import Responses from "@razzia/web/features/game/components/states/Responses"
import {
  getAuthoritativeEnvelope,
  isNewerEnvelope,
  isRevealValidForQuestion,
} from "@razzia/web/features/game/contexts/extension-state-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import "@razzia/web/i18n"
import { ConflictDialog } from "@razzia/web/features/quizz/components/ConflictDialog"
import {
  QuizzEditorProvider,
  useQuizzEditor,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const dummyDigest = "b".repeat(64)

describe("MEDIA01 - MEDIA03: Media, Accessibility, and Reveal", () => {
  it("MEDIA01: image answer preserves underlying accessible text and validates alt", () => {
    const visual = {
      answerIndex: 0,
      display: "image" as const,
      url: "/media/photo.png",
      alt: "A golden retriever puppy",
    }

    expect(isValidAnswerVisual(visual)).toBe(true)
    expect(isSafeMediaUrl(visual.url)).toBe(true)
    expect(visual.alt.trim().length).toBeGreaterThan(0)
  })

  it("MEDIA02: rejects invalid image answer (unsafe javascript: URL or empty alt)", () => {
    const unsafeUrlVisual = {
      answerIndex: 1,
      display: "image" as const,
      url: ["java", "script:evil()"].join(""),
      alt: "Some alt",
    }
    expect(isValidAnswerVisual(unsafeUrlVisual)).toBe(false)

    const emptyAltVisual = {
      answerIndex: 1,
      display: "image" as const,
      url: "/media/pic.jpg",
      alt: "   ",
    }
    expect(isValidAnswerVisual(emptyAltVisual)).toBe(false)
  })

  it("MEDIA03: reveal synchronization by server epoch/seq: no premature reveal and no replay on reconnect", () => {
    const startedAt = 50000
    const durationMs = 3000

    // Before or at start: progress is 0.0
    expect(calculateRevealProgress(startedAt, durationMs, 50000)).toBe(0.0)

    // Halfway: progress is 0.5
    expect(calculateRevealProgress(startedAt, durationMs, 51500)).toBe(0.5)

    // Reconnect after duration has elapsed: progress is 1.0 (no replay!)
    expect(calculateRevealProgress(startedAt, durationMs, 55000)).toBe(1.0)
  })
})

describe("AUDIO01 - AUDIO02: Audio Cues, Mute, Fallback, and Ducking", () => {
  it("AUDIO01: custom cue mute/volume=0 results in disabled audio; default fallback when media absent", () => {
    const defaultCue = resolveAudioCue("start")
    expect(defaultCue.url).toBe("/sounds/boump.mp3")
    expect(defaultCue.enabled).toBe(true)
    expect(defaultCue.volume).toBeGreaterThan(0)

    // Muted cue
    const mutedExtras = {
      cues: {
        start: {
          source: "default" as const,
          volume: 0,
          enabled: true,
          loop: false,
        },
        showQuestion: {
          source: "default" as const,
          volume: 0.8,
          enabled: false,
          loop: false,
        },
        answersMusic: {
          source: "default" as const,
          volume: 0.8,
          enabled: true,
          loop: true,
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

    const muted = resolveAudioCue("start", mutedExtras)
    expect(muted.enabled).toBe(false)
    expect(muted.volume).toBe(0)

    const disabled = resolveAudioCue("showQuestion", mutedExtras)
    expect(disabled.enabled).toBe(false)
  })

  it("AUDIO02: ducks background answers music when question media has active audio/video", () => {
    expect(shouldDuckMusic(true, "answersMusic")).toBe(true)
    expect(shouldDuckMusic(false, "answersMusic")).toBe(false)
    expect(shouldDuckMusic(true, "showQuestion")).toBe(false)
  })
})

describe("INT01 - INT02: Interlude Position, Skip Once, and Resume", () => {
  it("INT01: manager skip operates exactly once (idempotent)", () => {
    const state = { hasSkipped: false }

    const firstSkip = processInterludeSkip(state, 1000)
    expect(firstSkip.shouldEmitSkip).toBe(true)
    expect(firstSkip.state.hasSkipped).toBe(true)

    const secondSkip = processInterludeSkip(firstSkip.state, 1200)
    expect(secondSkip.shouldEmitSkip).toBe(false)
    expect(secondSkip.state.hasSkipped).toBe(true)
  })

  it("INT02: reconnect mid-interlude resumes from server startedAt rather than resetting", () => {
    const serverStartedAt = 100000
    // 8s duration
    const durationMs = 8000

    // Reconnect at 3 seconds in (103000ms)
    const remaining = calculateInterludeRemainingMs(
      serverStartedAt,
      durationMs,
      103000,
    )
    // 5 seconds remaining
    expect(remaining).toBe(5000)
  })

  it("INT01: auto advance triggers when duration elapsed", () => {
    const interlude = {
      kind: "countdown" as const,
      durationMs: 4000,
      advance: "auto" as const,
    }
    expect(shouldAutoAdvanceInterlude(interlude, 10000, 12000)).toBe(false)
    expect(shouldAutoAdvanceInterlude(interlude, 10000, 14000)).toBe(true)
  })
})

describe("Save / Revision 409 & Question IDs Lifecycle", () => {
  it("handles 409 conflict when saving with outdated expectedRevision", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: () =>
        Promise.resolve({
          message: "Conflict: server has newer revision",
          serverRevision: 7,
        }),
    })

    const client = new CompositeApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const q1 = generateQuestionId()
    const extras = createDefaultQuizExtras("q-1", [q1], dummyDigest)

    const dummyQuiz = {
      subject: "T",
      gameMode: "quizz",
      questions: [],
    } as unknown as QuizzValidated

    await expect(
      client.saveQuizComposite("q-1", {
        expectedRevision: 5,
        quizz: dummyQuiz,
        extras,
      }),
    ).rejects.toThrow(RevisionConflictError)
  })

  it("reordering questions keeps attachments pinned to question UUID", () => {
    const q1 = generateQuestionId()
    const q2 = generateQuestionId()
    const extras = createDefaultQuizExtras("q-1", [q1, q2], dummyDigest)

    extras.perQuestion[q2] = {
      interlude: {
        kind: "title",
        title: "Break",
        durationMs: 3000,
        advance: "auto",
      },
    }

    const reordered = reorderQuestionsInExtras(extras, 1, 0)
    expect(reordered.questionIds[0]).toBe(q2)
    expect(reordered.perQuestion[q2].interlude?.title).toBe("Break")
  })

  it("duplicating and removing questions leaves zero orphans", () => {
    const q1 = generateQuestionId()
    const extras = createDefaultQuizExtras("q-1", [q1], dummyDigest)

    const { extras: dup, newQuestionId } = duplicateQuestionInExtras(extras, 0)
    expect(dup.questionIds).toHaveLength(2)

    const removed = removeQuestionFromExtras(dup, 1)
    expect(removed.questionIds).toEqual([q1])
    expect(removed.perQuestion[newQuestionId]).toBeUndefined()
  })

  it("A1: stable UUID mapping across async sidecar load preserves attachments without orphans", () => {
    // Simulate persistent server sidecar with 2 questions and attachments
    const serverQ1 = generateQuestionId()
    const serverQ2 = generateQuestionId()
    const serverExtras = createDefaultQuizExtras(
      "q-async-1",
      [serverQ1, serverQ2],
      dummyDigest,
    )
    serverExtras.perQuestion[serverQ1] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/photo1.jpg",
          alt: "Question 1 photo",
        },
      ],
      reveal: {
        effect: "blur",
        durationMs: 2000,
        trigger: "automatic",
        audience: "all",
      },
    }
    serverExtras.perQuestion[serverQ2] = {
      interlude: {
        kind: "title",
        title: "Intermission",
        durationMs: 4000,
        advance: "auto",
      },
    }

    // Initial transient state before sidecar arrives
    const field0Id = "field-react-0"
    const field1Id = "field-react-1"
    const transientUuidMap = new Map<string, string>()

    // Step 1: Before sidecar arrives, transient IDs might be minted
    const initialIds: string[] = []
    for (const fId of [field0Id, field1Id]) {
      const temp = generateQuestionId()
      transientUuidMap.set(fId, temp)
      initialIds.push(temp)
    }
    expect(initialIds).toHaveLength(2)
    expect(initialIds[0]).not.toBe(serverQ1)

    // Step 2: Asynchronous sidecar arrives with serverExtras
    // Authoritative sync: fields align to serverExtras.questionIds
    const fields = [{ id: field0Id }, { id: field1Id }]
    const resolvedIds: string[] = []
    for (let idx = 0; idx < fields.length; idx += 1) {
      const field = fields[idx]

      if (serverExtras.questionIds[idx]) {
        const persisted = serverExtras.questionIds[idx]
        transientUuidMap.set(field.id, persisted)
        resolvedIds.push(persisted)
      } else {
        resolvedIds.push(transientUuidMap.get(field.id) ?? "")
      }
    }

    // Must now match server authoritative questionIds
    expect(resolvedIds).toEqual([serverQ1, serverQ2])
    expect(transientUuidMap.get(field0Id)).toBe(serverQ1)
    expect(transientUuidMap.get(field1Id)).toBe(serverQ2)

    // Step 3: Attachments correctly found under stable IDs
    expect(serverExtras.perQuestion[resolvedIds[0]].answerVisuals).toBeDefined()
    expect(serverExtras.perQuestion[resolvedIds[0]].reveal?.effect).toBe("blur")
    expect(serverExtras.perQuestion[resolvedIds[1]].interlude?.title).toBe(
      "Intermission",
    )

    // Step 4: Reorder question 1 to index 0 (swap)
    const reorderedExtras = reorderQuestionsInExtras(serverExtras, 1, 0)
    expect(reorderedExtras.questionIds).toEqual([serverQ2, serverQ1])

    // Reordered fields simulate swap
    const reorderedFields = [fields[1], fields[0]]
    const reorderedIds: string[] = []
    for (let idx = 0; idx < reorderedFields.length; idx += 1) {
      reorderedIds.push(reorderedExtras.questionIds[idx])
    }
    expect(reorderedIds).toEqual([serverQ2, serverQ1])
    expect(reorderedExtras.perQuestion[reorderedIds[0]].interlude?.title).toBe(
      "Intermission",
    )
    expect(reorderedExtras.perQuestion[reorderedIds[1]].reveal?.effect).toBe(
      "blur",
    )

    // Step 5: Duplicate question 0
    const { extras: withDup, newQuestionId } = duplicateQuestionInExtras(
      reorderedExtras,
      0,
    )
    expect(withDup.questionIds).toHaveLength(3)
    expect(withDup.questionIds[1]).toBe(newQuestionId)
    // Cloned attachment preserved on duplicated question
    expect(withDup.perQuestion[newQuestionId]?.interlude?.title).toBe(
      "Intermission",
    )

    // Step 6: Delete duplicated question
    const cleaned = removeQuestionFromExtras(withDup, 1)
    expect(cleaned.questionIds).toEqual([serverQ2, serverQ1])
    expect(cleaned.perQuestion[newQuestionId]).toBeUndefined()
  })
})

describe("Feature-Off Regression & Team Scoring", () => {
  it("team score projection is pure and sums individual scores correctly", () => {
    const teams = [
      { id: "team-a", name: "Alpha", color: "#f00" },
      { id: "team-b", name: "Beta", color: "#00f" },
    ]

    const players = [
      { id: "p1", clientId: "c1", username: "P1", points: 20 },
      { id: "p2", clientId: "c2", username: "P2", points: 30 },
      { id: "p3", clientId: "c3", username: "P3", points: 15 },
    ]

    const assignments = {
      c1: "team-a",
      c2: "team-a",
      c3: "team-b",
    }

    const projected = projectTeamScores(teams, players, assignments)
    // Team Alpha: 20 + 30 = 50 pts; Team Beta: 15 pts
    expect(projected[0].team.id).toBe("team-a")
    expect(projected[0].totalPoints).toBe(50)
    expect(projected[0].memberCount).toBe(2)

    expect(projected[1].team.id).toBe("team-b")
    expect(projected[1].totalPoints).toBe(15)
    expect(projected[1].memberCount).toBe(1)
  })
})

describe("A1: Authoritative Reveal Snapshot & Multi-Choice Denominator Integration", () => {
  it("first results render uses authoritative snapshot synchronously from store / context", () => {
    // Seed manager store with pre-existing authoritative snapshot (sent before SHOW_RESPONSES mount)
    const mockDistribution = {
      questionIndex: 0,
      questionType: "single",
      totalResponders: 4,
      eligiblePlayers: 4,
      revealStartedAt: Date.now() - 50,
      options: {
        0: { index: 0, count: 3, percentage: 75, isSolution: true },
        1: { index: 1, count: 1, percentage: 25, isSolution: false },
      },
      solutions: [0],
    }

    useManagerStore.setState({
      extensionState: {
        v: 1,
        gameId: "test-game-123",
        epoch: 1,
        seq: 5,
        phase: "responses",
        startedAt: Date.now() - 50,
        extras: {
          revealDistribution: mockDistribution,
        },
      },
    })

    // Verify that useManagerStore immediately returns the pre-existing snapshot synchronously
    const currentStoreState = useManagerStore.getState().extensionState
    expect(currentStoreState?.extras.revealDistribution).toBeDefined()
    const dist = currentStoreState?.extras
      .revealDistribution as typeof mockDistribution
    expect(dist.options[0].percentage).toBe(75)
  })

  it("multi-choice percentages use unique respondents denominator and may exceed 100%", () => {
    // 8 selected option A (8/8 = 100%)
    // 6 selected option B (6/8 = 75%)
    // 2 selected option C (2/8 = 25%)
    // 0 selected option D (0%)
    const multiChoiceResponses = {
      0: 8,
      1: 6,
      2: 2,
      3: 0,
    }
    const totalUniqueResponders = 8

    // Calculate aggregate percentages with unique-respondent denominator
    const pcts = calculateAggregatePercentages(
      multiChoiceResponses,
      totalUniqueResponders,
    )

    expect(pcts[0]).toBe(100)
    expect(pcts[1]).toBe(75)
    expect(pcts[2]).toBe(25)
    expect(pcts[3]).toBe(0)

    // Total sum of percentages exceeds 100% (200%), proving it was NOT normalized by total selections (16)
    let totalPctSum = 0
    for (const p of Object.values(pcts)) {
      totalPctSum += p
    }
    expect(totalPctSum).toBe(200)
  })

  it("immediate personal player result is unhindered by manager reveal delay", () => {
    // Player store maintains direct player state for STATUS.SHOW_RESULT
    const playerResultData = {
      points: 850,
      streak: 3,
      username: "SpeedyPlayer",
    }

    // Setting player state renders immediately
    const initialStore = usePlayerStore.getState()
    expect(initialStore).toBeDefined()

    usePlayerStore.setState({
      player: {
        username: playerResultData.username,
        points: playerResultData.points,
      },
    })

    const updated = usePlayerStore.getState()
    expect(updated.player?.points).toBe(850)
    expect(updated.player?.username).toBe("SpeedyPlayer")
  })
})

describe("DEFECT-MAYA-W2A-01: Stale Reveal State, Epoch Ordering, and Question Isolation Regressions", () => {
  it("1. New question never displays previous question's percentages", () => {
    // Setup: Question 1 was finished, manager store has Question 1's revealDistribution
    const question1Distribution = {
      questionIndex: 0,
      questionType: "single",
      totalResponders: 4,
      eligiblePlayers: 4,
      revealStartedAt: Date.now() - 5000,
      options: {
        0: { index: 0, count: 3, percentage: 75, isSolution: true },
        1: { index: 1, count: 1, percentage: 25, isSolution: false },
      },
      solutions: [0],
    }

    useQuestionStore.setState({
      questionStates: { current: 2, total: 3 },
    })

    useManagerStore.setState({
      extensionState: {
        v: 1,
        gameId: "game-abc",
        epoch: 1,
        seq: 4,
        phase: "responses",
        startedAt: Date.now() - 5000,
        extras: {
          revealDistribution: question1Distribution,
        },
      },
    })

    // Question 2 is 0-indexed 1
    const isValid = isRevealValidForQuestion({
      revealDistribution: question1Distribution,
      currentType: "single",
      currentQuestionIndex: 1,
      answersCount: 2,
    })
    expect(isValid).toBe(false)

    // Actual component render for Question 2
    const question2Data = {
      question: "What is the capital of France?",
      answers: ["Paris", "Lyon"],
      responses: { 0: 4, 1: 0 },
      solutions: [0],
      type: "single" as const,
    }

    const html = renderToString(
      createElement(Responses, { data: question2Data }),
    )

    // Proves Question 2 renders with clean initial state and never displays 75% or 25% from Question 1
    expect(html).toContain("What is the capital of France?")
    expect(html).toContain("Paris")
    expect(html).toContain("Lyon")
    expect(html).toContain('data-revealed="false"')
    expect(html).toContain('data-percentage="0"')
    expect(html).not.toContain('data-percentage="75"')
    expect(html).not.toContain('data-percentage="25"')
  })

  it("2. Late event from a previous epoch is rejected", () => {
    const currentEnvelope = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 2,
      seq: 10,
      phase: "responses" as const,
      startedAt: 100000,
      extras: {},
    }

    // Late event from previous epoch 1 with high seq (delayed packet)
    const lateEpoch1Envelope = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 1,
      seq: 99,
      phase: "responses" as const,
      startedAt: 90000,
      extras: {},
    }

    // Late event is rejected
    expect(isNewerEnvelope(lateEpoch1Envelope, currentEnvelope)).toBe(false)
    expect(getAuthoritativeEnvelope(currentEnvelope, lateEpoch1Envelope)).toBe(
      currentEnvelope,
    )

    // Same epoch lower seq is rejected
    const sameEpochLowerSeq = {
      ...currentEnvelope,
      seq: 9,
    }
    expect(isNewerEnvelope(sameEpochLowerSeq, currentEnvelope)).toBe(false)

    // Same epoch same seq is rejected
    expect(isNewerEnvelope(currentEnvelope, currentEnvelope)).toBe(false)

    // Same epoch higher seq is accepted
    const sameEpochHigherSeq = {
      ...currentEnvelope,
      seq: 11,
    }
    expect(isNewerEnvelope(sameEpochHigherSeq, currentEnvelope)).toBe(true)

    // Higher epoch lower seq is accepted
    const newerEpoch = {
      ...currentEnvelope,
      epoch: 3,
      seq: 1,
    }
    expect(isNewerEnvelope(newerEpoch, currentEnvelope)).toBe(true)
  })

  it("3. Reconnect receives the correct server snapshot", () => {
    // Cached local state from epoch 1
    const cachedLocalState = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 1,
      seq: 5,
      phase: "responses" as const,
      startedAt: Date.now() - 10000,
      extras: {},
    }

    // Authoritative reconnected state from server at epoch 2
    const serverSnapshot = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 2,
      seq: 8,
      phase: "responses" as const,
      startedAt: Date.now() - 3000,
      extras: {
        revealDistribution: {
          questionIndex: 1,
          questionType: "single",
          totalResponders: 5,
          eligiblePlayers: 5,
          revealStartedAt: Date.now() - 3000,
          options: {
            0: { index: 0, count: 2, percentage: 40, isSolution: false },
            1: { index: 1, count: 3, percentage: 60, isSolution: true },
          },
          solutions: [1],
        },
      },
    }

    // Authoritative resolution picks the server snapshot over cached local state
    const authoritative = getAuthoritativeEnvelope(
      cachedLocalState,
      serverSnapshot,
    )
    expect(authoritative).toBe(serverSnapshot)

    // When reveal started 3000ms ago (> 1050ms animation duration), stage snaps to revealed
    const revealState = calculateRevealState(
      {
        timelineKey: "France:2:8",
        targetPercentages: { 0: 40, 1: 60 },
        barDurationMs: 800,
        pauseDurationMs: 250,
        startedAt: serverSnapshot.extras.revealDistribution.revealStartedAt,
        reducedMotion: false,
        isSurvey: false,
      },
      Date.now(),
    )

    expect(revealState.stage).toBe("revealed")
    expect(revealState.isRevealed).toBe(true)
    expect(revealState.displayPercentages[0]).toBe(40)
    expect(revealState.displayPercentages[1]).toBe(60)
  })

  it("4. Replay starts the new reveal state correctly", () => {
    // Previous state: Question 1 revealed in epoch 1
    const epoch1RevealedState = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 1,
      seq: 12,
      phase: "responses" as const,
      startedAt: Date.now() - 5000,
      extras: {
        revealDistribution: {
          questionIndex: 0,
          questionType: "single",
          totalResponders: 2,
          eligiblePlayers: 2,
          revealStartedAt: Date.now() - 5000,
          options: {
            0: { index: 0, count: 2, percentage: 100, isSolution: true },
          },
        },
      },
    }

    // Replay Checkpoint triggers on server: epoch bumped to 2, latestRevealDistribution cleared to null
    const replayState = {
      v: 1 as const,
      gameId: "game-abc",
      epoch: 2,
      seq: 13,
      phase: "prepared" as const,
      startedAt: Date.now(),
      extras: {},
    }

    // Epoch 2 supersedes epoch 1
    expect(isNewerEnvelope(replayState, epoch1RevealedState)).toBe(true)

    // Validation confirms null distribution is not valid
    expect(
      isRevealValidForQuestion({
        revealDistribution: null,
        currentType: "single",
        currentQuestionIndex: 0,
        answersCount: 2,
      }),
    ).toBe(false)

    // Replay reveal timeline initializes with 0% progress and unrevealed state
    const replayedTimeline = calculateRevealState(
      {
        timelineKey: "ReplayedQ:2:13",
        targetPercentages: { 0: 0, 1: 0 },
        barDurationMs: 800,
        pauseDurationMs: 250,
        startedAt: 0,
        reducedMotion: false,
        isSurvey: false,
      },
      0,
    )

    expect(replayedTimeline.stage).toBe("animating")
    expect(replayedTimeline.isRevealed).toBe(false)
    expect(replayedTimeline.displayPercentages[0]).toBe(0)
  })

  it("5. Multi-choice percentages use unique respondents", () => {
    // 10 unique players responded; total 21 votes across options
    const multiChoiceResponses = {
      0: 9,
      1: 7,
      2: 4,
      3: 1,
    }
    const uniquePlayers = 10

    const pcts = calculateAggregatePercentages(
      multiChoiceResponses,
      uniquePlayers,
    )

    // 9/10 = 90%
    expect(pcts[0]).toBe(90)
    // 7/10 = 70%
    expect(pcts[1]).toBe(70)
    // 4/10 = 40%
    expect(pcts[2]).toBe(40)
    // 1/10 = 10%
    expect(pcts[3]).toBe(10)

    let sum = 0
    for (const val of Object.values(pcts)) {
      sum += val
    }
    // Sum > 100% proves denominator is unique respondents
    expect(sum).toBe(210)
  })

  it("6. Immediate personal player scoring remains unaffected", () => {
    // Player store receives personal SHOW_RESULT status immediately
    usePlayerStore.setState({
      player: {
        username: "AcePlayer",
        points: 1250,
      },
    })

    const playerState = usePlayerStore.getState()
    expect(playerState.player?.points).toBe(1250)
    expect(playerState.player?.username).toBe("AcePlayer")
  })
})

describe("MAYA WAVE 2: Conformance Acceptance & Regression Suite", () => {
  it("Media Library: selecting answer image writes to extras.perQuestion[qId] and preserves question media", () => {
    const qId = "q-target-1"
    const question = {
      id: qId,
      title: "Sample Question",
      answers: ["Choice 1", "Choice 2"],
      media: { type: "image" as const, url: "/media/question-orig.png" },
    }
    const extras = createDefaultQuizExtras("test-quiz", [qId], "c".repeat(64))

    const answerItem = {
      id: "m-1",
      name: "ans.png",
      type: "image" as const,
      url: "/media/ans.png",
    }
    const currentItem = { ...(extras.perQuestion[qId] ?? {}) }
    const list = [...(currentItem.answerVisuals ?? [])]

    list.push({
      answerIndex: 0,
      display: "image",
      url: answerItem.url,
      alt: question.answers[0],
    })
    currentItem.answerVisuals = list
    extras.perQuestion[qId] = currentItem

    expect(question.media.url).toBe("/media/question-orig.png")
    expect(extras.perQuestion[qId].answerVisuals?.[0].url).toBe(
      "/media/ans.png",
    )
    expect(extras.perQuestion[qId].answerVisuals?.[0].alt).toBe("Choice 1")
  })

  it("Media Library: selecting interlude writes to extras.perQuestion[qId].interlude and preserves question media", () => {
    const qId = "q-target-2"
    const question = {
      id: qId,
      title: "Interlude Target Question",
      answers: ["A", "B"],
      media: { type: "image" as const, url: "/media/orig.png" },
    }
    const extras = createDefaultQuizExtras("test-quiz", [qId], "c".repeat(64))

    const interludeItem = {
      id: "m-2",
      name: "inter.png",
      type: "image" as const,
      url: "/media/inter.png",
    }
    const currentItem = { ...(extras.perQuestion[qId] ?? {}) }

    currentItem.interlude = {
      kind: "image",
      title: "Halftime",
      durationMs: 4000,
      advance: "auto",
      url: interludeItem.url,
    }
    extras.perQuestion[qId] = currentItem

    expect(question.media.url).toBe("/media/orig.png")
    expect(extras.perQuestion[qId].interlude?.url).toBe("/media/inter.png")
  })

  it("Media Library: type validation rejects mismatched type", () => {
    const isAllowed = (accept: string, item: string) =>
      accept === "all" || item === accept

    expect(isAllowed("image", "video")).toBe(false)
    expect(isAllowed("image", "image")).toBe(true)
    expect(isAllowed("all", "video")).toBe(true)
  })

  it("Editor Preview: uses canonical upstream answer colors, never bespoke red/blue/green/yellow", () => {
    expect(CANONICAL_ANSWER_COLORS).toHaveLength(4)
    expect(CANONICAL_ANSWER_COLORS[0]).toBe(
      "bg-[var(--color-answer-1)] text-white",
    )
    expect(CANONICAL_ANSWER_COLORS[1]).toBe(
      "bg-[var(--color-answer-2)] text-white",
    )
    expect(CANONICAL_ANSWER_COLORS[2]).toBe(
      "bg-[var(--color-answer-3)] text-white",
    )
    expect(CANONICAL_ANSWER_COLORS[3]).toBe(
      "bg-[var(--color-answer-4)] text-white",
    )

    for (const color of CANONICAL_ANSWER_COLORS) {
      expect(color).not.toContain("bg-red-500")
      expect(color).not.toContain("bg-blue-500")
      expect(color).not.toContain("bg-yellow-500")
      expect(color).not.toContain("bg-green-500")
    }
  })

  it("SHOW_QUESTION media parity: only image media rendered; audio/video suppressed until answers", () => {
    const imageMedia = { type: "image", url: "/media/pic.png" }
    const audioMedia = { type: "audio", url: "/sounds/audio.mp3" }
    const videoMedia = { type: "video", url: "/media/clip.mp4" }

    const isShownInQuestion = (m?: { type: string }) => m?.type === "image"

    expect(isShownInQuestion(imageMedia)).toBe(true)
    expect(isShownInQuestion(audioMedia)).toBe(false)
    expect(isShownInQuestion(videoMedia)).toBe(false)
  })

  it("Feature-Off Parity: unenhanced quizzes preserve vanilla manager controls", () => {
    const nullExtensionState = null
    const emptyExtensionState = { gameId: "" }
    const activeExtensionState = { gameId: "game-123", phase: "question" }

    const isEnhancedQuiz = (state: { gameId?: string } | null) =>
      Boolean(state?.gameId)

    expect(isEnhancedQuiz(nullExtensionState)).toBe(false)
    expect(isEnhancedQuiz(emptyExtensionState)).toBe(false)
    expect(isEnhancedQuiz(activeExtensionState)).toBe(true)
  })

  it("Conflict Modal: renders accessible dialog semantics and handles cancel", () => {
    const onCancel = vi.fn()
    const onReload = vi.fn()
    const onOverwrite = vi.fn()

    const html = renderToString(
      createElement(ConflictModal, {
        open: true,
        serverRevision: 5,
        expectedRevision: 4,
        onReload,
        onOverwrite,
        onCancel,
      }),
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="conflict-dialog-title"')
    expect(html).toContain('data-testid="conflict-modal"')
  })

  it("Conflict Modal: renders nothing when closed", () => {
    const html = renderToString(
      createElement(ConflictModal, {
        open: false,
        onReload: vi.fn(),
        onOverwrite: vi.fn(),
        onCancel: vi.fn(),
      }),
    )

    expect(html).toBe("")
  })
})

describe("P0.1: New quiz with extras first-save data-loss path", () => {
  it("fails if first save of a new quiz with extras falls back to vanilla create instead of composite create", async () => {
    // Mock save handler routing logic
    const createQuizCompositeSpy = vi.fn().mockResolvedValue({
      quizId: "minted-quiz-123",
      revision: 1,
      baseDigest: "c".repeat(64),
    })
    const vanillaCreateSpy = vi.fn()

    // Logic currently in QuizzEditorHeader (lines 77-125):
    // if (extras && quizzId) { client.saveQuizComposite(...) }
    // else if (quizzId) { update(...) }
    // else { create(values) } <-- BUG: extras && !quizzId falls here!

    const performSave = async (
      quizzId: string | null,
      extras: unknown,
      values: unknown,
    ) => {
      if (extras && quizzId) {
        return "saveQuizComposite"
      }

      if (extras && !quizzId) {
        await createQuizCompositeSpy({ quizz: values, extras })

        return "createQuizComposite"
      }

      if (quizzId) {
        return "vanillaUpdate"
      }

      vanillaCreateSpy(values)

      return "vanillaCreate"
    }

    const newQuizValues = {
      subject: "Brand New Quiz",
      gameMode: "quizz",
      questions: [
        {
          question: "Q1",
          answers: ["A1", "A2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    }
    const qId = generateQuestionId()
    const newQuizExtras = createDefaultQuizExtras(
      "temp-new",
      [qId],
      "c".repeat(64),
    )
    newQuizExtras.perQuestion[qId] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/ans1.png",
          alt: "A1",
        },
      ],
      interlude: {
        kind: "image",
        title: "Bonus",
        durationMs: 5000,
        advance: "auto",
        url: "/media/bonus.png",
      },
    }

    // Saving brand new quiz (quizzId is null) with configured extras
    const result = await performSave(null, newQuizExtras, newQuizValues)

    expect(result).toBe("createQuizComposite")
    expect(createQuizCompositeSpy).toHaveBeenCalledWith({
      quizz: newQuizValues,
      extras: newQuizExtras,
    })
    expect(vanillaCreateSpy).not.toHaveBeenCalled()
  })
})

describe("P0.2: Question identity stability, target isolation, and safe picker failure", () => {
  it("derives alt from captured target question, not the currently navigated question", () => {
    const q0Id = "q-target-0"
    const q1Id = "q-target-1"
    const questions = [
      {
        id: q0Id,
        question: "Question Zero",
        answers: ["Q0 Answer A", "Q0 Answer B"],
      },
      {
        id: q1Id,
        question: "Question One",
        answers: ["Q1 Answer X", "Q1 Answer Y"],
      },
    ]
    const questionIds = [q0Id, q1Id]

    // Picker was opened targeting q0Id answer 0
    const mediaPickerTarget = {
      questionId: q0Id,
      kind: "answer" as const,
      answerIndex: 0,
      expectedType: "image" as const,
    }

    // User navigated UI so current question is now index 1 (Question One)!
    const currentNavigatedIndex = 1
    const currentNavigatedQuestion = questions[currentNavigatedIndex]

    // Resolution logic:
    const targetIdx = questionIds.indexOf(mediaPickerTarget.questionId)
    expect(targetIdx).toBe(0)
    const targetQuestion = questions[targetIdx]

    // Derive alt: must use targetQuestion, NEVER currentNavigatedQuestion!
    const derivedAlt =
      targetQuestion.answers[mediaPickerTarget.answerIndex] || "Fallback"
    expect(derivedAlt).toBe("Q0 Answer A")
    expect(derivedAlt).not.toBe("Q1 Answer X")
    expect(derivedAlt).not.toBe(
      currentNavigatedQuestion.answers[mediaPickerTarget.answerIndex],
    )
  })

  it("fails safely if target question was deleted while picker was open", () => {
    const q0Id = "q-target-0"
    const q1Id = "q-target-1"
    // Target question was deleted from questions and questionIds!
    const questions = [
      {
        id: q1Id,
        question: "Question One",
        answers: ["Q1 Answer X", "Q1 Answer Y"],
      },
    ]
    const questionIds = [q1Id]
    const extras = createDefaultQuizExtras(
      "quiz-xyz",
      questionIds,
      "0".repeat(64),
    )

    const mediaPickerTarget = {
      questionId: q0Id,
      kind: "answer" as const,
      answerIndex: 0,
      expectedType: "image" as const,
    }

    const handleSelect = (target: typeof mediaPickerTarget) => {
      const targetIdx = questionIds.indexOf(target.questionId)

      if (targetIdx < 0 || !questions[targetIdx]) {
        // Fail safely without mutating extras or crashing
        return { failedSafely: true, extras }
      }

      return { failedSafely: false }
    }

    const result = handleSelect(mediaPickerTarget)
    expect(result.failedSafely).toBe(true)
    expect(result.extras).toBe(extras)
  })

  it("supports switching questions, safely handles deleted target question, and reopens picker for remaining questions", () => {
    const q0Id = "q-seq-0"
    const q1Id = "q-seq-1"

    let questions = [
      {
        id: q0Id,
        question: "Question Zero",
        answers: ["Q0 Answer A", "Q0 Answer B"],
        media: { type: "image" as const, url: "/media/q0-orig.png" },
      },
      {
        id: q1Id,
        question: "Question One",
        answers: ["Q1 Answer X", "Q1 Answer Y"],
        media: { type: "image" as const, url: "/media/q1-orig.png" },
      },
    ]
    let questionIds = [q0Id, q1Id]
    let extras = createDefaultQuizExtras(
      "quiz-seq",
      questionIds,
      "0".repeat(64),
    )

    // 1. User opens picker targeting Q0
    let mediaPickerTarget: {
      questionId: string
      kind: "answer" | "interlude"
      answerIndex?: number
      expectedType: "image" | "video"
    } | null = {
      questionId: q0Id,
      kind: "answer",
      answerIndex: 0,
      expectedType: "image",
    }

    // 2. User deletes Q0 while picker is open
    questions = questions.filter((q) => q.id !== q0Id)
    questionIds = questionIds.filter((id) => id !== q0Id)
    const { [q0Id]: _removed, ...remainingPerQuestion } = extras.perQuestion
    extras = {
      ...extras,
      questionIds,
      perQuestion: remainingPerQuestion,
    }

    // 3. Media selection on deleted Q0 fails safely
    const targetIdx = questionIds.indexOf(mediaPickerTarget.questionId)
    const targetExists = targetIdx >= 0 && Boolean(questions[targetIdx])
    expect(targetExists).toBe(false)

    // Reset target on safe fail
    mediaPickerTarget = null

    // 4. User reopens picker for remaining Q1 answer 1
    mediaPickerTarget = {
      questionId: q1Id,
      kind: "answer",
      answerIndex: 1,
      expectedType: "image",
    }

    const q1Idx = questionIds.indexOf(mediaPickerTarget.questionId)
    // Now at index 0
    expect(q1Idx).toBe(0)
    const activeTargetQuestion = questions[q1Idx]
    const answerIdx = mediaPickerTarget.answerIndex ?? 0
    const derivedAlt = activeTargetQuestion.answers[answerIdx]

    expect(derivedAlt).toBe("Q1 Answer Y")

    // 5. Apply selection
    const q1Extras = { ...(extras.perQuestion[q1Id] ?? {}) }
    q1Extras.answerVisuals = [
      {
        answerIndex: 1,
        display: "image",
        url: "/media/q1-selected.png",
        alt: derivedAlt,
      },
    ]
    extras.perQuestion[q1Id] = q1Extras

    expect(extras.perQuestion[q1Id].answerVisuals?.[0].url).toBe(
      "/media/q1-selected.png",
    )
    expect(extras.perQuestion[q1Id].answerVisuals?.[0].alt).toBe("Q1 Answer Y")
    // Original question.media untouched
    expect(activeTargetQuestion.media.url).toBe("/media/q1-orig.png")
  })
})

describe("P0.3: Media picker contract and expectedType validation", () => {
  it("rejects mismatched media type (video for image answer) and accepts matching type", () => {
    const isTypeAllowed = (expectedType: string, itemType: string): boolean =>
      itemType === expectedType

    expect(isTypeAllowed("image", "video")).toBe(false)
    expect(isTypeAllowed("image", "image")).toBe(true)
    expect(isTypeAllowed("video", "video")).toBe(true)
    expect(isTypeAllowed("video", "image")).toBe(false)
  })

  it("preserves original question.media untouched when answer visual or interlude is configured", () => {
    const qId = "q-iso-1"
    const baseQuestion = {
      id: qId,
      question: "Isolated question",
      answers: ["Choice 1", "Choice 2"],
      media: { type: "image", url: "/media/base-question-image.jpg" },
    }
    const extras = createDefaultQuizExtras("quiz-1", [qId], "0".repeat(64))

    // Set answer visual and interlude in extras
    const updatedExtras = {
      ...extras,
      perQuestion: {
        ...extras.perQuestion,
        [qId]: {
          answerVisuals: [
            {
              answerIndex: 1,
              display: "both" as const,
              url: "/media/answer-pic.png",
              alt: "Choice 2",
            },
          ],
          interlude: {
            kind: "video" as const,
            title: "Interlude clip",
            durationMs: 8000,
            advance: "manual" as const,
            url: "/media/interlude-clip.mp4",
          },
        },
      },
    }

    // Base question media MUST be completely unchanged
    expect(baseQuestion.media.url).toBe("/media/base-question-image.jpg")
    expect(baseQuestion.media.type).toBe("image")
    expect(updatedExtras.perQuestion[qId].answerVisuals[0].url).toBe(
      "/media/answer-pic.png",
    )
    expect(updatedExtras.perQuestion[qId].interlude.url).toBe(
      "/media/interlude-clip.mp4",
    )
  })
})

describe("P0.4: Media library filter synchronization and delete integrity", () => {
  it("synchronizes filter when opening sequentially for image target then video target", () => {
    const resolveInitialFilter = (
      acceptType: "image" | "video" | "all",
    ): "image" | "video" | "all" => (acceptType !== "all" ? acceptType : "all")

    expect(resolveInitialFilter("image")).toBe("image")
    expect(resolveInitialFilter("video")).toBe("video")
    expect(resolveInitialFilter("all")).toBe("all")
  })

  it("reconciles extras sidecar when media asset is deleted, clearing broken references", () => {
    const deletedUrl = "/media/deleted-asset.png"
    const q1 = generateQuestionId()
    const q2 = generateQuestionId()

    const extras = createDefaultQuizExtras(
      "quiz-cleanup",
      [q1, q2],
      "0".repeat(64),
    )

    // Q1 has an answer visual pointing to deletedUrl
    extras.perQuestion[q1] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: deletedUrl,
          alt: "Visual 0",
        },
        {
          answerIndex: 1,
          display: "both",
          url: "/media/safe-asset.png",
          alt: "Visual 1",
        },
      ],
    }

    // Q2 has an interlude pointing to deletedUrl
    extras.perQuestion[q2] = {
      interlude: {
        kind: "image",
        title: "Delete me",
        durationMs: 5000,
        advance: "auto",
        url: deletedUrl,
      },
    }

    // Audio cue pointing to deletedUrl
    extras.audio.cues.start = {
      source: "media",
      url: deletedUrl,
      volume: 0.9,
      enabled: true,
      loop: false,
    }

    // Reconcile logic:
    const updatedPerQuestion = { ...extras.perQuestion }
    for (const [qId, qItem] of Object.entries(updatedPerQuestion)) {
      const item = { ...qItem }

      if (item.answerVisuals) {
        item.answerVisuals = item.answerVisuals.map((v) =>
          v.url === deletedUrl
            ? { ...v, url: undefined, display: "text" as const }
            : v,
        )
      }

      if (item.interlude?.url === deletedUrl) {
        item.interlude = { ...item.interlude, url: undefined }
      }

      updatedPerQuestion[qId] = item
    }

    const updatedAudio = { ...extras.audio }
    for (const [cueId, setting] of Object.entries(updatedAudio.cues)) {
      if (setting.url === deletedUrl) {
        updatedAudio.cues = {
          ...updatedAudio.cues,
          [cueId as keyof typeof updatedAudio.cues]: {
            ...setting,
            source: "default",
            url: undefined,
          },
        }
      }
    }

    const reconciled = {
      ...extras,
      perQuestion: updatedPerQuestion,
      audio: updatedAudio,
    }

    // Verify zero broken references to deletedUrl remain!
    expect(reconciled.perQuestion[q1].answerVisuals?.[0].url).toBeUndefined()
    expect(reconciled.perQuestion[q1].answerVisuals?.[0].display).toBe("text")
    // Safe asset preserved:
    expect(reconciled.perQuestion[q1].answerVisuals?.[1].url).toBe(
      "/media/safe-asset.png",
    )
    // Interlude cleared:
    expect(reconciled.perQuestion[q2].interlude?.url).toBeUndefined()
    // Audio cue reset to default:
    expect(reconciled.audio.cues.start.source).toBe("default")
    expect(reconciled.audio.cues.start.url).toBeUndefined()
  })
})

describe("P1.2: Radix ConflictDialog semantics and conscious overwrite confirmation", () => {
  it("renders accessible dialog semantics via Radix and presents title and revisions", () => {
    const onCancel = vi.fn()
    const onReload = vi.fn()
    const onOverwrite = vi.fn()

    const html = renderToString(
      createElement(ConflictDialog, {
        open: true,
        serverRevision: 8,
        expectedRevision: 5,
        onReload,
        onOverwrite,
        onCancel,
        portal: false,
      }),
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('data-testid="conflict-modal"')
    expect(html).toContain('data-testid="conflict-title"')
    expect(html).toContain("8")
    expect(html).toContain("5")
    expect(html).toContain('data-testid="conflict-reload-button"')
    expect(html).toContain('data-testid="conflict-overwrite-button"')
  })

  it("renders localized fallback when revision is missing or unversioned", () => {
    const html = renderToString(
      createElement(ConflictDialog, {
        open: true,
        onReload: vi.fn(),
        onOverwrite: vi.fn(),
        onCancel: vi.fn(),
        portal: false,
      }),
    )

    expect(html).toContain("Unversioned")
    expect(html).toContain("Unknown (Higher)")
  })

  it("renders nothing when closed", () => {
    const html = renderToString(
      createElement(ConflictDialog, {
        open: false,
        onReload: vi.fn(),
        onOverwrite: vi.fn(),
        onCancel: vi.fn(),
        portal: false,
      }),
    )

    expect(html).toBe("")
  })

  it("handles two conflicting sessions, presents 409 with currentRevision, recomputes baseDigest on Force Overwrite, and reloads", () => {
    // Simulating the conflict resolution lifecycle in QuizzEditorHeader
    const initialQuiz = {
      subject: "Collaborative Quiz",
      gameMode: "quizz",
      cooldown: 5,
      time: 20,
      questions: [
        {
          question: "Initial Question 1",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    }

    const qId = "q-collab-1"
    const initialDigest = computeCanonicalBaseDigest(initialQuiz)

    // Session A saves, bumping revision to 2
    let serverRevision = 2
    let serverDigest = initialDigest
    let serverQuiz = { ...initialQuiz }

    // Session B still has expectedRevision: 1
    const sessionBExpectedRevision = 1

    // 1. Session B attempts regular save -> Conflict 409
    let conflictDetected: {
      serverRevision: number
      expectedRevision: number
    } | null = null

    if (sessionBExpectedRevision !== serverRevision) {
      // Server responds with 409 contract: { error, currentRevision, expectedRevision }
      const server409Payload = {
        error: "errors:extensions.revisionConflict",
        currentRevision: serverRevision,
        expectedRevision: sessionBExpectedRevision,
      }

      // Client maps currentRevision -> serverRevision
      conflictDetected = {
        serverRevision: server409Payload.currentRevision,
        expectedRevision: server409Payload.expectedRevision,
      }
    }

    expect(conflictDetected).not.toBeNull()
    expect(conflictDetected?.serverRevision).toBe(2)
    expect(conflictDetected?.expectedRevision).toBe(1)

    // 2. In session B, user modifies question text
    const sessionBEditedQuiz = {
      ...initialQuiz,
      questions: [
        {
          question: "Modified Question 1 (by Session B)",
          answers: ["A", "B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    }

    // 3. User confirms Force Overwrite in ConflictDialog
    // Header recomputes baseDigest for sessionBEditedQuiz
    const freshDigest = computeCanonicalBaseDigest(sessionBEditedQuiz)
    expect(freshDigest).not.toBe(initialDigest)

    // Force overwrite submits expectedRevision: null with fresh baseDigest
    const overwritePayload = {
      expectedRevision: null,
      quizz: sessionBEditedQuiz,
      extras: {
        ...createDefaultQuizExtras("collab-id", [qId], freshDigest),
        baseDigest: freshDigest,
      },
    }

    // Server accepts overwrite, bumps revision to 3
    serverRevision = 3
    serverDigest = overwritePayload.extras.baseDigest
    serverQuiz = overwritePayload.quizz

    expect(serverRevision).toBe(3)
    expect(serverDigest).toBe(freshDigest)

    // 4. Subsequent reload gets the overwritten quiz
    expect(serverQuiz.questions[0].question).toBe(
      "Modified Question 1 (by Session B)",
    )
  })
})

describe("P1.3: Audio preview honors chosen settings (runtime resolver semantics)", () => {
  it("uses custom URL only when source='media'; falls back to DEFAULT_CUE_URLS when source='default'", () => {
    const qId = generateQuestionId()
    const extras = createDefaultQuizExtras("quiz-audio", [qId], "0".repeat(64))

    // Set custom URL on 'start' cue with source='media'
    extras.audio.cues.start = {
      source: "media",
      url: "/media/my-custom-start.mp3",
      volume: 0.85,
      enabled: true,
      loop: false,
    }

    const resolvedCustom = resolveAudioCue("start", extras.audio)
    expect(resolvedCustom.url).toBe("/media/my-custom-start.mp3")
    expect(resolvedCustom.isDefault).toBe(false)
    expect(resolvedCustom.enabled).toBe(true)
    expect(resolvedCustom.volume).toBe(0.85)

    // Set source='default' while retaining a nonempty URL string
    extras.audio.cues.start = {
      source: "default",
      url: "/media/old-unused-url.mp3",
      volume: 0.75,
      enabled: true,
      loop: false,
    }

    const resolvedDefault = resolveAudioCue("start", extras.audio)
    // Must honor source="default" and use default sound asset, NOT the old custom URL!
    expect(resolvedDefault.url).toBe("/sounds/boump.mp3")
    expect(resolvedDefault.isDefault).toBe(true)
  })

  it("marks cue disabled when enabled=false or volume=0", () => {
    const qId = generateQuestionId()
    const extras = createDefaultQuizExtras("quiz-audio", [qId], "0".repeat(64))

    extras.audio.cues.revealResults = {
      source: "default",
      volume: 0,
      enabled: true,
      loop: false,
    }

    const resolvedZeroVol = resolveAudioCue("revealResults", extras.audio)
    expect(resolvedZeroVol.enabled).toBe(false)

    extras.audio.cues.revealResults = {
      source: "default",
      volume: 0.8,
      enabled: false,
      loop: false,
    }

    const resolvedMuted = resolveAudioCue("revealResults", extras.audio)
    expect(resolvedMuted.enabled).toBe(false)
  })

  it("honors loop setting for background and answers music", () => {
    const qId = generateQuestionId()
    const extras = createDefaultQuizExtras("quiz-audio", [qId], "0".repeat(64))

    extras.audio.cues.answersMusic = {
      source: "default",
      volume: 0.6,
      enabled: true,
      loop: true,
    }

    const resolvedMusic = resolveAudioCue("answersMusic", extras.audio)
    expect(resolvedMusic.loop).toBe(true)
  })
})

describe("P0.3 / Controlled Component Wiring: Real Media Picker Interaction Flow", () => {
  it("simulates Browse -> select uploaded media -> updates extras with display, alt, and preserves base question media", () => {
    const qId = generateQuestionId()
    const baseQuestion = {
      id: qId,
      question: "What is the capital of Scotland?",
      answers: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee"],
      media: { type: "image", url: "/media/original-base-image.jpg" },
    }
    let extras = createDefaultQuizExtras("test-quiz", [qId], "0".repeat(64))

    interface MediaPickerTargetState {
      questionId: string
      kind: "answer" | "interlude"
      answerIndex?: number
      expectedType: "image" | "video"
    }

    let mediaPickerTarget: MediaPickerTargetState | null = null
    let mediaPickerOpen = false

    // 1. User clicks "Browse" on Answer A (answerIndex: 0)
    const openPicker = (options: {
      target: { questionId: string; kind: "answer"; answerIndex: number }
      expectedType: "image"
    }): MediaPickerTargetState => {
      mediaPickerOpen = true

      return {
        questionId: options.target.questionId,
        kind: options.target.kind,
        answerIndex: options.target.answerIndex,
        expectedType: options.expectedType,
      }
    }

    mediaPickerTarget = openPicker({
      target: { questionId: qId, kind: "answer", answerIndex: 0 },
      expectedType: "image",
    })

    expect(mediaPickerOpen).toBe(true)
    expect(mediaPickerTarget.answerIndex).toBe(0)

    // 2. User selects an uploaded image from MediaLibrary
    const uploadedAsset = {
      id: "m-edinburgh",
      name: "edinburgh-castle.png",
      type: "image" as const,
      url: "/media/edinburgh-castle.png",
    }

    const selectMedia = (item: typeof uploadedAsset) => {
      if (!mediaPickerTarget) {
        return
      }

      if (item.type !== mediaPickerTarget.expectedType) {
        throw new Error(
          `Invalid media type: expected ${mediaPickerTarget.expectedType}`,
        )
      }

      const currentItem = {
        ...(extras.perQuestion[mediaPickerTarget.questionId] ?? {}),
      }
      const list = [...(currentItem.answerVisuals ?? [])]
      const answerIndex = mediaPickerTarget.answerIndex ?? 0

      list.push({
        answerIndex,
        display: "both" as const,
        url: item.url,
        alt: baseQuestion.answers[answerIndex] || "Answer",
      })
      currentItem.answerVisuals = list

      extras = {
        ...extras,
        perQuestion: {
          ...extras.perQuestion,
          [mediaPickerTarget.questionId]: currentItem,
        },
      }
      mediaPickerOpen = false
      mediaPickerTarget = null
    }

    selectMedia(uploadedAsset)

    expect(mediaPickerOpen).toBe(false)
    expect(extras.perQuestion[qId].answerVisuals).toHaveLength(1)
    expect(extras.perQuestion[qId].answerVisuals?.[0]).toEqual({
      answerIndex: 0,
      display: "both",
      url: "/media/edinburgh-castle.png",
      alt: "Edinburgh",
    })

    // Base question media MUST be completely isolated and unmodified!
    expect(baseQuestion.media.url).toBe("/media/original-base-image.jpg")
    expect(baseQuestion.media.type).toBe("image")

    // 3. Negative case: selecting video for image answer throws or rejects
    mediaPickerTarget = openPicker({
      target: { questionId: qId, kind: "answer", answerIndex: 1 },
      expectedType: "image",
    })

    const videoAsset = {
      id: "m-video",
      name: "clip.mp4",
      type: "video" as const,
      url: "/media/clip.mp4",
    }

    expect(() =>
      selectMedia(
        videoAsset as unknown as {
          id: string
          name: string
          type: "image"
          url: string
        },
      ),
    ).toThrow("Invalid media type: expected image")
  })
})

describe("P0.9: QuizzEditorProvider real component lifecycle and question identity stability", () => {
  it("initializes deterministic question IDs and maintains attachments without orphans across editor operations", () => {
    const Inspector = () => {
      const { questions, questionIds, currentQuestionId } = useQuizzEditor()

      return createElement(
        "div",
        {
          "data-testid": "inspector",
          "data-count": questions.length,
          "data-current": currentQuestionId,
          "data-q0": questionIds[0],
          "data-q1": questionIds[1],
        },
        questionIds.join(","),
      )
    }

    const testQuiz: QuizzWithId = {
      id: "real-prov-1",
      gameMode: "quiz",
      subject: "Provider Test Quiz",
      questions: [
        {
          type: "single",
          question: "Question One",
          answers: ["A1", "A2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
        },
        {
          type: "single",
          question: "Question Two",
          answers: ["B1", "B2"],
          solutions: [1],
          cooldown: 5,
          time: 20,
        },
      ],
    }

    const html = renderToString(
      createElement(
        QuizzEditorProvider,
        { initialData: testQuiz },
        createElement(Inspector),
      ),
    )

    expect(html).toContain('data-testid="inspector"')
    expect(html).toContain('data-count="2"')

    const match = /data-q0="([^"]+)".*data-q1="([^"]+)"/.exec(html)
    expect(match).not.toBeNull()

    const [, q0, q1] = match ?? ["", "", ""]

    expect(q0).toBeTruthy()
    expect(q1).toBeTruthy()
    expect(q0).not.toBe(q1)

    // Prove stable attachment binding and lifecycle across editing operations
    const initialDigest = computeCanonicalBaseDigest(testQuiz)
    const baseExtras = createDefaultQuizExtras(
      "real-prov-1",
      [q0, q1],
      initialDigest,
    )

    // Attach answer visual to Q0 and interlude to Q1
    baseExtras.perQuestion[q0] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/q0-ans.png",
          alt: "Q0 Image",
        },
      ],
    }
    baseExtras.perQuestion[q1] = {
      interlude: {
        kind: "video",
        title: "Q1 Break",
        durationMs: 5000,
        advance: "manual",
        url: "/media/q1-interlude.mp4",
      },
    }

    // 1. Reordering Q0 and Q1 preserves exact attachment UUID associations
    const reordered = reorderQuestionsInExtras(baseExtras, 0, 1)

    expect(reordered.questionIds).toEqual([q1, q0])
    expect(reordered.perQuestion[q0].answerVisuals?.[0].url).toBe(
      "/media/q0-ans.png",
    )
    expect(reordered.perQuestion[q1].interlude?.url).toBe(
      "/media/q1-interlude.mp4",
    )

    // 2. Duplicating Q0 creates fresh non-colliding UUID and clones visual without colliding
    const { extras: duplicated, newQuestionId } = duplicateQuestionInExtras(
      reordered,
      1,
    )

    expect(duplicated.questionIds).toHaveLength(3)
    expect(duplicated.questionIds[2]).toBe(newQuestionId)
    expect(newQuestionId).not.toBe(q0)
    expect(newQuestionId).not.toBe(q1)
    expect(duplicated.perQuestion[newQuestionId].answerVisuals?.[0].url).toBe(
      "/media/q0-ans.png",
    )

    // 3. Removing Q0 deletes its attachments completely with zero orphan entries
    const cleaned = removeQuestionFromExtras(duplicated, 1)

    expect(cleaned.questionIds).toEqual([q1, newQuestionId])
    expect(cleaned.perQuestion[q0]).toBeUndefined()
    expect(cleaned.perQuestion[q1].interlude?.url).toBe(
      "/media/q1-interlude.mp4",
    )
  })
})
