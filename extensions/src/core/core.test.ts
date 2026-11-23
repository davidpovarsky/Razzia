import crypto from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  answerVisualSchema,
  assertRevisionMatch,
  canonicalJsonStringify,
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  createEnhancedBundle,
  CUE_IDS,
  duplicateQuestion,
  enhancedBundleSchema,
  ensureQuestionIds,
  extensionCommandSchema,
  extensionStateEnvelopeSchema,
  generateQuestionId,
  generateQuestionIds,
  interludeSchema,
  isEnhancedBundle,
  isSafeMediaUrl,
  nextRevision,
  questionRevealSchema,
  quizExtrasV1Schema,
  remapQuestionIds,
  removeQuestion,
  reorderQuestionIds,
  RevisionConflictError,
  safeMediaUrlSchema,
  sha256Hex,
  validateRevision,
  verifyBaseDigest,
} from "./index"

describe("Core Contracts & Schemas (V1)", () => {
  const sampleQuiz = {
    gameMode: "quiz",
    subject: "British History",
    questions: [
      {
        question: "Who was the first Prime Minister of Great Britain?",
        answers: [
          "Robert Walpole",
          "William Pitt",
          "Benjamin Disraeli",
          "Winston Churchill",
        ],
        solutions: [0],
        cooldown: 5,
        time: 20,
      },
      {
        question: "In which year did the Battle of Hastings take place?",
        answers: ["1066", "1215", "1485", "1603"],
        solutions: [0],
        cooldown: 5,
        time: 15,
      },
    ],
  }

  describe("Deterministic Canonical Base Digest", () => {
    it("computes deterministic SHA-256 identical to Node crypto", () => {
      const canonicalStr = canonicalJsonStringify(sampleQuiz)
      const pureSha = sha256Hex(canonicalStr)
      const nodeSha = crypto
        .createHash("sha256")
        .update(canonicalStr)
        .digest("hex")

      expect(pureSha).toBe(nodeSha)
      expect(pureSha).toHaveLength(64)
    })

    it("produces identical digest regardless of object key order", () => {
      const quizA = {
        subject: "History",
        gameMode: "quiz",
        questions: [{ time: 10, question: "Q1", answers: ["A", "B"] }],
      }
      const quizB = {
        questions: [{ answers: ["A", "B"], question: "Q1", time: 10 }],
        gameMode: "quiz",
        subject: "History",
      }

      const digestA = computeCanonicalBaseDigest(quizA)
      const digestB = computeCanonicalBaseDigest(quizB)

      expect(digestA).toBe(digestB)
      expect(verifyBaseDigest(quizA, digestA)).toBe(true)
      expect(verifyBaseDigest(quizB, digestA)).toBe(true)
    })

    it("produces a different digest when content changes", () => {
      const digest1 = computeCanonicalBaseDigest(sampleQuiz)
      const modifiedQuiz = {
        ...sampleQuiz,
        subject: "Modified Subject",
      }
      const digest2 = computeCanonicalBaseDigest(modifiedQuiz)

      expect(digest1).not.toBe(digest2)
      expect(verifyBaseDigest(modifiedQuiz, digest1)).toBe(false)
    })
  })

  describe("Safe Media URLs & Alt Validation", () => {
    it("accepts root-relative /media/ and https:// URLs", () => {
      expect(isSafeMediaUrl("/media/image.png")).toBe(true)
      expect(isSafeMediaUrl("/media/sub/audio.mp3")).toBe(true)
      expect(isSafeMediaUrl("https://images.example.com/pic.jpg")).toBe(true)
      expect(safeMediaUrlSchema.safeParse("/media/test.png").success).toBe(true)
    })

    it("rejects unsafe URLs (script, data, file, directory traversal)", () => {
      const jsScheme = [
        "j",
        "a",
        "v",
        "a",
        "s",
        "c",
        "r",
        "i",
        "p",
        "t",
        ":",
      ].join("")
      const jsUrl = `${jsScheme}alert(1)`
      const voidUrl = `${jsScheme}void(0)`

      expect(isSafeMediaUrl(jsUrl)).toBe(false)
      expect(isSafeMediaUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false)
      expect(isSafeMediaUrl("file:///C:/passwords.txt")).toBe(false)
      expect(isSafeMediaUrl("http://insecure.example.com/pic.jpg")).toBe(false)
      expect(isSafeMediaUrl("/media/../secret.txt")).toBe(false)
      expect(isSafeMediaUrl("")).toBe(false)
      expect(isSafeMediaUrl("relative/path.png")).toBe(false)
      expect(safeMediaUrlSchema.safeParse(voidUrl).success).toBe(false)
    })

    it("enforces non-empty alt text and valid URL when display is image or both", () => {
      const jsScheme = [
        "j",
        "a",
        "v",
        "a",
        "s",
        "c",
        "r",
        "i",
        "p",
        "t",
        ":",
      ].join("")

      // Valid text-only answer
      expect(
        answerVisualSchema.safeParse({
          answerIndex: 0,
          display: "text",
          alt: "",
        }).success,
      ).toBe(true)

      // Valid image answer
      expect(
        answerVisualSchema.safeParse({
          answerIndex: 1,
          display: "image",
          url: "/media/pic.png",
          alt: "Portrait of Robert Walpole",
        }).success,
      ).toBe(true)

      // Invalid image answer: missing alt
      const noAlt = answerVisualSchema.safeParse({
        answerIndex: 1,
        display: "image",
        url: "/media/pic.png",
        alt: "   ",
      })

      expect(noAlt.success).toBe(false)

      // Invalid image answer: unsafe URL
      const unsafeUrl = answerVisualSchema.safeParse({
        answerIndex: 1,
        display: "image",
        url: `${jsScheme}alert('xss')`,
        alt: "Description",
      })

      expect(unsafeUrl.success).toBe(false)

      // Invalid both answer: missing URL
      const noUrl = answerVisualSchema.safeParse({
        answerIndex: 1,
        display: "both",
        alt: "Description",
      })

      expect(noUrl.success).toBe(false)
    })

    it("validates reveal and interlude boundaries", () => {
      expect(
        questionRevealSchema.safeParse({
          effect: "blur",
          durationMs: 3000,
          trigger: "automatic",
          audience: "all",
        }).success,
      ).toBe(true)

      // Too short duration
      expect(
        questionRevealSchema.safeParse({
          effect: "blur",
          durationMs: 100,
          trigger: "automatic",
          audience: "all",
        }).success,
      ).toBe(false)

      // Valid interlude
      expect(
        interludeSchema.safeParse({
          kind: "title",
          title: "Round 2",
          durationMs: 5000,
          advance: "auto",
        }).success,
      ).toBe(true)

      // Interlude with unsafe URL
      expect(
        interludeSchema.safeParse({
          kind: "image",
          url: "data:text/html,bad",
          durationMs: 5000,
          advance: "auto",
        }).success,
      ).toBe(false)
    })
  })

  describe("QuizExtrasV1 Schemas & Defaults", () => {
    it("creates valid default QuizExtrasV1", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const defaults = createDefaultQuizExtras("quiz-123", qIds, digest)
      const parsed = quizExtrasV1Schema.safeParse(defaults)

      expect(parsed.success).toBe(true)
      expect(defaults.schemaVersion).toBe(1)
      expect(defaults.revision).toBe(1)
      expect(defaults.leaderboard.mode).toBe("upstream")
      expect(defaults.teams.enabled).toBe(false)
      expect(defaults.teams.autoAssign).toBe("roundRobin")
      expect(Object.keys(defaults.audio.cues)).toHaveLength(CUE_IDS.length)
      expect(defaults.audio.cues.answersMusic.loop).toBe(true)
      expect(defaults.audio.cues.start.loop).toBe(false)
    })

    it("rejects schema with duplicate questionIds", () => {
      const duplicateId = generateQuestionId()
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras(
        "quiz-123",
        [duplicateId, duplicateId],
        digest,
      )
      const result = quizExtrasV1Schema.safeParse(extras)

      expect(result.success).toBe(false)
    })

    it("rejects orphan perQuestion keys not in questionIds", () => {
      const qIds = generateQuestionIds(1)
      const orphanId = generateQuestionId()
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("quiz-123", qIds, digest)

      extras.perQuestion[orphanId] = {
        reveal: {
          effect: "blur",
          durationMs: 2000,
          trigger: "automatic",
          audience: "all",
        },
      }

      const result = quizExtrasV1Schema.safeParse(extras)

      expect(result.success).toBe(false)
    })

    it("rejects everyN leaderboard mode without everyN value", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("quiz-123", qIds, digest)

      extras.leaderboard = { mode: "everyN" }

      const result = quizExtrasV1Schema.safeParse(extras)

      expect(result.success).toBe(false)
    })

    it("rejects enabled teams when team count is < 2", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("quiz-123", qIds, digest)

      extras.teams = {
        enabled: true,
        teams: [{ id: "t1", name: "Red", color: "#ff0000" }],
        autoAssign: "roundRobin",
      }

      const result = quizExtrasV1Schema.safeParse(extras)

      expect(result.success).toBe(false)
    })

    it("accepts enabled teams when team count is between 2 and 12", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("quiz-123", qIds, digest)

      extras.teams = {
        enabled: true,
        teams: [
          { id: "t1", name: "Red", color: "#ff0000" },
          { id: "t2", name: "Blue", color: "#0000ff" },
        ],
        autoAssign: "roundRobin",
      }

      const result = quizExtrasV1Schema.safeParse(extras)

      expect(result.success).toBe(true)
    })
  })

  describe("Question Identity Lifecycle (Reorder, Duplicate, Remove)", () => {
    it("reorders question IDs while keeping perQuestion attachments pinned to UUIDs (CORE02)", () => {
      const qIds = generateQuestionIds(3)
      const [id0, id1, id2] = qIds

      const perQuestion = {
        [id0]: {
          reveal: {
            effect: "blur" as const,
            durationMs: 2000,
            trigger: "automatic" as const,
            audience: "all" as const,
          },
        },
        [id1]: {
          answerVisuals: [
            {
              answerIndex: 0,
              display: "image" as const,
              url: "/media/walpole.png",
              alt: "Walpole",
            },
          ],
        },
      }

      // Reorder index 1 (id1) to index 0
      const reordered = reorderQuestionIds(qIds, 1, 0)

      expect(reordered).toEqual([id1, id0, id2])

      // Attachments remain accessed by UUID - Walpole stays with id1
      expect(perQuestion[reordered[0]].answerVisuals?.[0]?.alt).toBe("Walpole")
      expect(perQuestion[reordered[1]].reveal?.effect).toBe("blur")
    })

    it("duplicates question: mints fresh UUID, clones attachments, no orphans (CORE03)", () => {
      const qIds = generateQuestionIds(2)
      const [id0, id1] = qIds

      const perQuestion = {
        [id0]: {
          reveal: {
            effect: "zoom" as const,
            durationMs: 1500,
            trigger: "manual" as const,
            audience: "manager" as const,
          },
        },
      }

      const {
        questionIds: newIds,
        perQuestion: newPerQuestion,
        newQuestionId,
      } = duplicateQuestion(qIds, perQuestion, 0)

      expect(newIds).toHaveLength(3)
      expect(newIds[0]).toBe(id0)
      expect(newIds[1]).toBe(newQuestionId)
      expect(newIds[2]).toBe(id1)
      expect(newQuestionId).not.toBe(id0)

      // Cloned attachments
      expect(newPerQuestion[newQuestionId]).toEqual(perQuestion[id0])
      expect(newPerQuestion[newQuestionId]).not.toBe(perQuestion[id0])
    })

    it("removes question: cleans up perQuestion to prevent orphan records (CORE03)", () => {
      const qIds = generateQuestionIds(3)
      const [id0, id1, id2] = qIds

      const perQuestion = {
        [id0]: {
          reveal: {
            effect: "blur" as const,
            durationMs: 2000,
            trigger: "automatic" as const,
            audience: "all" as const,
          },
        },
        [id1]: {
          reveal: {
            effect: "tiles" as const,
            durationMs: 3000,
            trigger: "manual" as const,
            audience: "all" as const,
          },
        },
        [id2]: {
          reveal: {
            effect: "zoom" as const,
            durationMs: 1000,
            trigger: "automatic" as const,
            audience: "all" as const,
          },
        },
      }

      const {
        questionIds: survivingIds,
        perQuestion: survivingPerQuestion,
        removedQuestionId,
      } = removeQuestion(qIds, perQuestion, 1)

      expect(survivingIds).toEqual([id0, id2])
      expect(removedQuestionId).toBe(id1)
      expect(survivingPerQuestion[id1]).toBeUndefined()
      expect(survivingPerQuestion[id0]).toBeDefined()
      expect(survivingPerQuestion[id2]).toBeDefined()
    })

    it("remaps question IDs for bundle import (CORE06)", () => {
      const oldIds = generateQuestionIds(2)
      const perQuestion = {
        [oldIds[0]]: {
          interlude: {
            kind: "title" as const,
            title: "Imported Interlude",
            durationMs: 4000,
            advance: "auto" as const,
          },
        },
      }

      const {
        questionIds: freshIds,
        perQuestion: freshPerQuestion,
        idMap,
      } = remapQuestionIds(oldIds, perQuestion)

      expect(freshIds).toHaveLength(2)
      expect(freshIds[0]).not.toBe(oldIds[0])
      expect(idMap.get(oldIds[0])).toBe(freshIds[0])
      expect(freshPerQuestion[freshIds[0]].interlude.title).toBe(
        "Imported Interlude",
      )
    })

    it("ensures question IDs pads missing UUIDs to match quiz count", () => {
      const initial = [generateQuestionId()]
      const ensured = ensureQuestionIds(initial, 3)

      expect(ensured).toHaveLength(3)
      expect(ensured[0]).toBe(initial[0])
      expect(new Set(ensured).size).toBe(3)
    })
  })

  describe("Revision Checks & Monotonic Increments (CORE04)", () => {
    it("validates matching revision and allows null expectedRevision", () => {
      expect(validateRevision(4, 4).valid).toBe(true)
      expect(validateRevision(1, null).valid).toBe(true)
      assertRevisionMatch(4, 4)
    })

    it("rejects mismatched revision and throws RevisionConflictError", () => {
      const check = validateRevision(5, 4)

      expect(check.valid).toBe(false)
      expect(check.reason).toContain("Revision mismatch")

      let thrown: unknown = null

      try {
        assertRevisionMatch(5, 4)
      } catch (err) {
        thrown = err
      }

      expect(thrown).toBeInstanceOf(RevisionConflictError)
      const conflict = thrown as RevisionConflictError

      expect(conflict.currentRevision).toBe(5)
      expect(conflict.expectedRevision).toBe(4)
    })

    it("increments revision monotonically", () => {
      expect(nextRevision(1)).toBe(2)
      expect(nextRevision(4)).toBe(5)
      expect(nextRevision(0)).toBe(1)
    })
  })

  describe("Extension State Envelope & Manager Commands", () => {
    it("validates extension state envelope", () => {
      const validEnvelope = {
        v: 1,
        gameId: "game-abc",
        seq: 42,
        epoch: 3,
        questionId: generateQuestionId(),
        phase: "question",
        startedAt: Date.now(),
        extras: {
          currentTeamScores: { team1: 100 },
        },
      }

      const parsed = extensionStateEnvelopeSchema.safeParse(validEnvelope)

      expect(parsed.success).toBe(true)

      // Invalid phase
      const invalidPhase = { ...validEnvelope, phase: "unknown_phase" }

      expect(extensionStateEnvelopeSchema.safeParse(invalidPhase).success).toBe(
        false,
      )

      // Negative sequence
      const negSeq = { ...validEnvelope, seq: -1 }

      expect(extensionStateEnvelopeSchema.safeParse(negSeq).success).toBe(false)
    })

    it("validates manager command discriminated union", () => {
      // SHOW_LEADERBOARD
      const cmd1 = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "SHOW_LEADERBOARD",
        requestId: "req-1",
      })

      expect(cmd1.success).toBe(true)

      // SKIP_INTERLUDE
      const cmd2 = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "SKIP_INTERLUDE",
        payload: { interludeId: "int-1" },
        requestId: "req-2",
      })

      expect(cmd2.success).toBe(true)

      // REVEAL_MEDIA
      const cmd3 = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "REVEAL_MEDIA",
        payload: { questionId: "q-1" },
        requestId: "req-3",
      })

      expect(cmd3.success).toBe(true)

      // ASSIGN_TEAM
      const cmd4 = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "ASSIGN_TEAM",
        payload: { clientId: "c1", teamId: "team-red" },
        requestId: "req-4",
      })

      expect(cmd4.success).toBe(true)

      // Unknown action
      const badAction = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "INVALID_ACTION",
        requestId: "req-5",
      })

      expect(badAction.success).toBe(false)

      // Missing required payload for ASSIGN_TEAM
      const badAssign = extensionCommandSchema.safeParse({
        v: 1,
        gameId: "g1",
        action: "ASSIGN_TEAM",
        payload: {},
        requestId: "req-6",
      })

      expect(badAssign.success).toBe(false)
    })
  })

  describe("Enhanced Bundle Import/Export (CORE06)", () => {
    it("creates and parses enhanced bundle", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("q1", qIds, digest)
      const bundle = createEnhancedBundle(sampleQuiz, extras)

      expect(isEnhancedBundle(bundle)).toBe(true)
      const parsed = enhancedBundleSchema.safeParse(bundle)

      expect(parsed.success).toBe(true)

      if (parsed.success) {
        expect(parsed.data.bundleVersion).toBe(1)
        expect(parsed.data.extras.quizId).toBe("q1")
      }
    })

    it("rejects invalid bundle version", () => {
      const qIds = generateQuestionIds(2)
      const digest = computeCanonicalBaseDigest(sampleQuiz)
      const extras = createDefaultQuizExtras("q1", qIds, digest)
      const invalidBundle = {
        bundleVersion: 2,
        quizz: sampleQuiz,
        extras,
      }

      expect(isEnhancedBundle(invalidBundle)).toBe(false)
      expect(enhancedBundleSchema.safeParse(invalidBundle).success).toBe(false)
    })
  })
})
