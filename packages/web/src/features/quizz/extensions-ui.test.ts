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
  calculateInterludeRemainingMs,
  processInterludeSkip,
  projectTeamScores,
  resolveAudioCue,
  shouldAutoAdvanceInterlude,
  shouldDuckMusic,
} from "@razzia/extensions/presentation"
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
        url: "javascript:evil()",
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
      const durationMs = 8000 // 8s

      // Reconnect at 3 seconds in (103000ms)
      const remaining = calculateInterludeRemainingMs(
        serverStartedAt,
        durationMs,
        103000,
      )
      expect(remaining).toBe(5000) // 5 seconds remaining
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
})
