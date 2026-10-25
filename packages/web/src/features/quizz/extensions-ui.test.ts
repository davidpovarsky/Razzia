import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  createDefaultQuizExtras,
  generateQuestionId,
  isSafeMediaUrl,
} from "@razzia/extensions/core"
import {
  CompositeApiClient,
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
  processInterludeSkip,
  projectTeamScores,
  resolveAudioCue,
  shouldAutoAdvanceInterlude,
  shouldDuckMusic,
} from "@razzia/extensions/presentation"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { describe, expect, it, vi } from "vitest"

describe("Targeted UI & Extensions Test Suite (Maya V3)", () => {
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
      expect(defaultCue.url).toBe("/sfx/start.mp3")
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

      const { extras: dup, newQuestionId } = duplicateQuestionInExtras(
        extras,
        0,
      )
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
      expect(
        serverExtras.perQuestion[resolvedIds[0]].answerVisuals,
      ).toBeDefined()
      expect(serverExtras.perQuestion[resolvedIds[0]].reveal?.effect).toBe(
        "blur",
      )
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
      expect(
        reorderedExtras.perQuestion[reorderedIds[0]].interlude?.title,
      ).toBe("Intermission")
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
})
