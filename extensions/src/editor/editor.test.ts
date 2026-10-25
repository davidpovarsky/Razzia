import type { QuizzValidated } from "@razzia/common/validators/quizz"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionId,
  type QuizExtrasV1,
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

    const extras = createDefaultQuizExtras("quiz-1", [q1, q2, q3], dummyDigest)

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

    const extras = createDefaultQuizExtras("quiz-1", [q1, q2, q3], dummyDigest)
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

  it("P0.1: createQuizComposite normalizes baseDigest and posts to /api/extensions/quizzes", async () => {
    let postedBody: {
      extras: { baseDigest: string; quizId: string }
    } | null = null
    let postedUrl = ""
    const mockFetch = vi
      .fn()
      .mockImplementation((url: unknown, init: { body: string }) => {
        postedUrl = String(url)
        postedBody = JSON.parse(init.body) as {
          extras: { baseDigest: string; quizId: string }
        }

        return Promise.resolve({
          status: 201,
          ok: true,
          json: () =>
            Promise.resolve({
              quizId: "new-minted-quiz-999",
              revision: 1,
              baseDigest: postedBody?.extras.baseDigest,
            }),
        })
      })

    const client = new CompositeApiClient({
      baseUrl: "http://localhost:3000",
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const q1 = generateQuestionId()
    const extras = createDefaultQuizExtras("temp-quiz", [q1], "0".repeat(64))
    extras.perQuestion[q1] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/ans.png",
          alt: "Alt text",
        },
      ],
      interlude: {
        kind: "image",
        title: "Interlude",
        durationMs: 4000,
        advance: "auto",
        url: "/media/slide.jpg",
      },
    }

    const newQuiz = {
      subject: "Brand New Quiz With Extras",
      gameMode: "quizz",
      questions: [
        {
          question: "Sample Q",
          answers: ["Ans 1", "Ans 2"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    } as unknown as QuizzValidated

    const result = await client.createQuizComposite({
      quizz: newQuiz,
      extras,
    })

    expect(postedUrl).toBe("http://localhost:3000/api/extensions/quizzes")
    const capturedExtras = (
      postedBody as unknown as {
        extras: { baseDigest: string; quizId: string }
      }
    ).extras
    expect(capturedExtras.baseDigest).toHaveLength(64)
    expect(capturedExtras.baseDigest).not.toBe("0".repeat(64))
    expect(capturedExtras.quizId).toBe("temp-quiz")
    expect(result.quizId).toBe("new-minted-quiz-999")
    expect(result.revision).toBe(1)
  })

  it("P0.1: createQuizComposite throws on server failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 500,
      ok: false,
      json: () => Promise.resolve({ error: "Internal server error" }),
    })

    const client = new CompositeApiClient({
      baseUrl: "http://localhost:3000",
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const q1 = generateQuestionId()
    const extras = createDefaultQuizExtras("temp-quiz", [q1], "0".repeat(64))
    const dummyQuiz = {
      subject: "Fail Quiz",
      gameMode: "quizz",
      questions: [],
    } as unknown as QuizzValidated

    await expect(
      client.createQuizComposite({ quizz: dummyQuiz, extras }),
    ).rejects.toThrow("Failed to create composite quiz: HTTP 500")
  })

  it("P0: saveQuizComposite correctly parses currentRevision from real server 409 conflict payload", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 409,
      ok: false,
      json: () =>
        Promise.resolve({
          error: "errors:extensions.revisionConflict",
          currentRevision: 7,
          expectedRevision: 4,
        }),
    })

    const client = new CompositeApiClient({
      baseUrl: "http://localhost:3000",
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const qId = generateQuestionId()
    const extras = createDefaultQuizExtras(
      "quiz-conflict",
      [qId],
      "0".repeat(64),
    )
    const quiz = {
      subject: "Conflict Quiz",
      gameMode: "quizz",
      questions: [],
    } as unknown as QuizzValidated

    try {
      await client.saveQuizComposite("quiz-conflict", {
        expectedRevision: 4,
        quizz: quiz,
        extras,
      })
      expect.unreachable("Should have thrown RevisionConflictError")
    } catch (err) {
      expect(err).toBeInstanceOf(RevisionConflictError)
      const conflictErr = err as RevisionConflictError
      expect(conflictErr.currentRevision).toBe(7)
      expect(conflictErr.serverRevision).toBe(7)
      expect(conflictErr.expectedRevision).toBe(4)
    }
  })

  it("P0: saveQuizComposite recomputes baseDigest matching modified quiz questions on force overwrite", async () => {
    let capturedBody: {
      expectedRevision: number | null
      quizz: QuizzValidated
      extras: { baseDigest: string }
    } | null = null

    const mockFetch = vi
      .fn()
      .mockImplementation((_url: unknown, init: { body: string }) => {
        capturedBody = JSON.parse(init.body) as typeof capturedBody

        return Promise.resolve({
          status: 200,
          ok: true,
          json: () =>
            Promise.resolve({
              quizId: "quiz-edit",
              revision: 3,
              baseDigest: capturedBody?.extras.baseDigest,
            }),
        })
      })

    const client = new CompositeApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const qId = generateQuestionId()
    const extras = createDefaultQuizExtras("quiz-edit", [qId], "a".repeat(64))

    const modifiedQuiz = {
      subject: "Updated Quiz Subject",
      gameMode: "quizz",
      questions: [
        {
          question: "Updated Question Text Here",
          answers: ["Ans A", "Ans B"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    } as unknown as QuizzValidated

    const expectedFreshDigest = computeCanonicalBaseDigest(modifiedQuiz)

    const result = await client.saveQuizComposite("quiz-edit", {
      expectedRevision: null,
      quizz: modifiedQuiz,
      extras,
    })

    const finalBody = capturedBody as unknown as {
      expectedRevision: number | null
      extras: { baseDigest: string }
    }
    expect(finalBody.expectedRevision).toBeNull()
    expect(finalBody.extras.baseDigest).toBe(expectedFreshDigest)
    expect(finalBody.extras.baseDigest).not.toBe("a".repeat(64))
    expect(result.baseDigest).toBe(expectedFreshDigest)
  })

  it("P0: creates new quiz composite with image and interlude, then reloads attachments intact", async () => {
    const inMemoryDb = new Map<
      string,
      { quizz: QuizzValidated; extras: QuizExtrasV1 }
    >()

    const mockFetch = vi
      .fn()
      .mockImplementation(
        (url: unknown, init: { method?: string; body?: string }) => {
          const urlStr = String(url)

          if (
            init.method === "POST" &&
            urlStr.endsWith("/api/extensions/quizzes")
          ) {
            const body = JSON.parse(String(init.body)) as {
              quizz: QuizzValidated
              extras: QuizExtrasV1
            }
            const mintedId = `minted-${Math.random().toString(36).slice(2, 8)}`
            const savedExtras = {
              ...body.extras,
              quizId: mintedId,
              revision: 1,
            }

            inMemoryDb.set(mintedId, {
              quizz: body.quizz,
              extras: savedExtras,
            })

            return Promise.resolve({
              status: 201,
              ok: true,
              json: () =>
                Promise.resolve({
                  quizId: mintedId,
                  revision: 1,
                  baseDigest: body.extras.baseDigest,
                }),
            })
          }

          if (
            init.method === "GET" &&
            urlStr.includes("/api/extensions/quizzes/")
          ) {
            const id = urlStr.split("/").pop() ?? ""
            const record = inMemoryDb.get(id)

            if (!record) {
              return Promise.resolve({
                status: 404,
                ok: false,
                json: () => Promise.resolve({}),
              })
            }

            return Promise.resolve({
              status: 200,
              ok: true,
              json: () =>
                Promise.resolve({
                  quizId: id,
                  exists: true,
                  extras: record.extras,
                  baseDigest: record.extras.baseDigest,
                }),
            })
          }

          return Promise.reject(new Error(`Unhandled request to: ${urlStr}`))
        },
      )

    const client = new CompositeApiClient({
      fetchFn: mockFetch as unknown as typeof fetch,
    })

    const q0 = generateQuestionId()
    const newQuiz = {
      subject: "Full Round-Trip New Quiz",
      gameMode: "quizz",
      questions: [
        {
          question: "What is the capital of Scotland?",
          answers: ["Edinburgh", "Glasgow", "Aberdeen", "Dundee"],
          solutions: [0],
          cooldown: 5,
          time: 20,
          type: "single",
        },
      ],
    } as unknown as QuizzValidated

    const extras = createDefaultQuizExtras("temp-id", [q0], "0".repeat(64))
    extras.perQuestion[q0] = {
      answerVisuals: [
        {
          answerIndex: 0,
          display: "image",
          url: "/media/edinburgh.png",
          alt: "Edinburgh Castle",
        },
      ],
      interlude: {
        kind: "image",
        title: "Halftime Break",
        durationMs: 5000,
        advance: "auto",
        url: "/media/halftime.jpg",
      },
    }

    // 1. Create new composite quiz
    const created = await client.createQuizComposite({
      quizz: newQuiz,
      extras,
    })
    expect(created.quizId).toMatch(/^minted-/)
    expect(created.revision).toBe(1)

    // 2. Reload and assert attachments
    const reloaded = await client.getQuizComposite(created.quizId)
    expect(reloaded.exists).toBe(true)
    expect(reloaded.extras).not.toBeNull()
    expect(reloaded.extras?.quizId).toBe(created.quizId)
    expect(reloaded.extras?.perQuestion[q0].answerVisuals?.[0].url).toBe(
      "/media/edinburgh.png",
    )
    expect(reloaded.extras?.perQuestion[q0].answerVisuals?.[0].alt).toBe(
      "Edinburgh Castle",
    )
    expect(reloaded.extras?.perQuestion[q0].interlude?.url).toBe(
      "/media/halftime.jpg",
    )
    expect(reloaded.extras?.perQuestion[q0].interlude?.title).toBe(
      "Halftime Break",
    )
    expect(reloaded.baseDigest).toBe(computeCanonicalBaseDigest(newQuiz))
  })
})
