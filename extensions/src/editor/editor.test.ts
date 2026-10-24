import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  createDefaultQuizExtras,
  generateQuestionId,
} from "@razzia/extensions/core"
import { describe, expect, it, vi } from "vitest"
import {
  CompositeApiClient,
  duplicateQuestionInExtras,
  removeQuestionFromExtras,
  reorderQuestionsInExtras,
  RevisionConflictError,
  synchronizeQuestionIds,
} from "./index"

describe("EDITOR & COMPOSITE API Acceptance Cases & Unit Tests", () => {
  const dummyDigest = "a".repeat(64)

  describe("CORE02 & CORE03: Stable Question UUID Lifecycle", () => {
    it("synchronizeQuestionIds maintains existing IDs and mints missing ones", () => {
      const q1 = generateQuestionId()
      const q2 = generateQuestionId()

      const synced = synchronizeQuestionIds([q1, q2], 4)
      expect(synced).toHaveLength(4)
      expect(synced[0]).toBe(q1)
      expect(synced[1]).toBe(q2)
      expect(synced[2]).not.toBe(synced[3])
    })

    it("CORE02: reordering question 1 -> 0 preserves question UUIDs and perQuestion attachments", () => {
      const q1 = generateQuestionId()
      const q2 = generateQuestionId()
      const q3 = generateQuestionId()

      const extras = createDefaultQuizExtras(
        "quiz-1",
        [q1, q2, q3],
        dummyDigest,
      )

      // Attach visual to q2 (originally at index 1)
      extras.perQuestion[q2] = {
        answerVisuals: [
          {
            answerIndex: 0,
            display: "image",
            url: "/media/pic.jpg",
            alt: "Photo",
          },
        ],
      }

      // Reorder index 1 (q2) to index 0
      const reordered = reorderQuestionsInExtras(extras, 1, 0)

      expect(reordered.questionIds).toEqual([q2, q1, q3])
      // Q2 still has its attachment intact!
      expect(reordered.perQuestion[q2].answerVisuals?.[0].alt).toBe("Photo")
      // Q1 and q3 have no orphan attachments
      expect(reordered.perQuestion[q1]).toBeUndefined()
    })

    it("CORE03: duplicate question mints a fresh UUID, copies attachments, and inserts after target", () => {
      const q1 = generateQuestionId()
      const q2 = generateQuestionId()

      const extras = createDefaultQuizExtras("quiz-1", [q1, q2], dummyDigest)
      extras.perQuestion[q1] = {
        interlude: {
          kind: "title",
          title: "Halftime",
          durationMs: 4000,
          advance: "auto",
        },
      }

      // Duplicate question at index 0 (q1)
      const { extras: duplicated, newQuestionId } = duplicateQuestionInExtras(
        extras,
        0,
      )

      expect(duplicated.questionIds).toHaveLength(3)
      expect(duplicated.questionIds[0]).toBe(q1)
      expect(duplicated.questionIds[1]).toBe(newQuestionId)
      expect(duplicated.questionIds[2]).toBe(q2)
      expect(newQuestionId).not.toBe(q1)

      // Duplicated question inherited the attachment
      expect(duplicated.perQuestion[newQuestionId]?.interlude?.title).toBe(
        "Halftime",
      )
    })

    it("CORE03: remove question cleans up perQuestion attachments with zero orphans", () => {
      const q1 = generateQuestionId()
      const q2 = generateQuestionId()
      const q3 = generateQuestionId()

      const extras = createDefaultQuizExtras(
        "quiz-1",
        [q1, q2, q3],
        dummyDigest,
      )
      extras.perQuestion[q2] = {
        reveal: {
          effect: "blur",
          durationMs: 3000,
          trigger: "automatic",
          audience: "all",
        },
      }

      // Remove middle question (index 1 = q2)
      const removed = removeQuestionFromExtras(extras, 1)

      expect(removed.questionIds).toEqual([q1, q3])
      // Attachment for q2 removed completely -> ZERO orphans!
      expect(removed.perQuestion[q2]).toBeUndefined()
    })
  })

  describe("CORE04: Revision Conflict 409 Handling in CompositeApiClient", () => {
    it("throws RevisionConflictError on HTTP 409 with revision details", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: () =>
          Promise.resolve({
            message: "Conflict: server revision is 5 but expected 4",
            serverRevision: 5,
          }),
      })

      const client = new CompositeApiClient({
        baseUrl: "http://localhost:3000",
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      const q1 = generateQuestionId()
      const extras = createDefaultQuizExtras("quiz-123", [q1], dummyDigest)

      const dummyQuiz = {
        subject: "Sample",
        gameMode: "quizz",
        questions: [],
      } as unknown as QuizzValidated

      await expect(
        client.saveQuizComposite("quiz-123", {
          expectedRevision: 4,
          quizz: dummyQuiz,
          extras,
        }),
      ).rejects.toThrow(RevisionConflictError)

      try {
        await client.saveQuizComposite("quiz-123", {
          expectedRevision: 4,
          quizz: dummyQuiz,
          extras,
        })
      } catch (err: unknown) {
        const conflictErr = err as RevisionConflictError
        expect(conflictErr.status).toBe(409)
        expect(conflictErr.serverRevision).toBe(5)
        expect(conflictErr.expectedRevision).toBe(4)
      }
    })

    it("successful save returns quizId and updated revision", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: () =>
          Promise.resolve({
            quizId: "quiz-123",
            revision: 5,
            baseDigest: dummyDigest,
          }),
      })

      const client = new CompositeApiClient({
        baseUrl: "http://localhost:3000",
        fetchFn: mockFetch as unknown as typeof fetch,
      })

      const q1 = generateQuestionId()
      const extras = createDefaultQuizExtras("quiz-123", [q1], dummyDigest)

      const dummyQuiz = {
        subject: "Sample",
        gameMode: "quizz",
        questions: [],
      } as unknown as QuizzValidated

      const result = await client.saveQuizComposite("quiz-123", {
        expectedRevision: 4,
        quizz: dummyQuiz,
        extras,
      })

      expect(result.quizId).toBe("quiz-123")
      expect(result.revision).toBe(5)
      expect(result.baseDigest).toBe(dummyDigest)
    })
  })
})
