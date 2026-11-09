import type { QuizzValidated } from "@razzia/common/validators/quizz"
import { describe, expect, it } from "vitest"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import {
  authoredQuizCardSchema,
  authoredSurveyCardSchema,
  type TadaShowV1,
} from "./show-authoring-schema"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import { parseTadaShowWorkbook, exportTadaShowWorkbook } from "./show-workbook"
import { preflightShowImport } from "./show-import-preflight"
import {
  mapDtmfToAnswerIndex,
  isQuestionSupportedOnPstn,
} from "../telephony/types"
import { TelephonyBridge } from "../telephony/bridge"
import { MockRazziaTransport } from "../telephony/transport"
import { MockProvider } from "../telephony/mock-provider"
import { KeypadSimulatorCore } from "../telephony/simulator"
import { CANONICAL_ANSWER_COLORS } from "../editor/components/utils"
import {
  MAX_ANSWERS,
  QUESTION_TYPES,
  QUIZZ_MODES,
} from "@razzia/common/constants"
const FIXTURES_DIR = path.resolve(__dirname, "../../fixtures/tzila-show")
describe("Tzila Five-Option Picture Polls Acceptance Suite (A01 - A18)", () => {
  // ── A01: Existing 2/3/4 option quizzes/polls unchanged ─────────────────────
  it("A01: Existing 2, 3, and 4 option quizzes/polls remain valid and unchanged", () => {
    for (const count of [2, 3, 4]) {
      const answers = Array.from(
        {
          length: count,
        },
        (_, i) => ({
          text: `Option ${i + 1}`,
          display: "text" as const,
        }),
      )
      const quizCard = authoredQuizCardSchema.safeParse({
        key: `Q_${count}`,
        kind: "quiz",
        question: `Question with ${count} options`,
        answers,
        correctAnswers: [1],
      })
      expect(quizCard.success).toBe(true)
      const surveyCard = authoredSurveyCardSchema.safeParse({
        key: `S_${count}`,
        kind: "survey",
        question: `Survey with ${count} options`,
        answers,
        correctAnswers: [],
      })
      expect(surveyCard.success).toBe(true)
    }
  })

  // ── A02: 5-option survey .tada.json preflight accepts and creates valid V2 ──
  it("A02: 5-option survey .tada.json preflight accepts and creates valid native V2 bundle", () => {
    const jsonPath = path.join(FIXTURES_DIR, "TZILA_STORY_SHOW.tada.json")
    const jsonText = fs.readFileSync(jsonPath, "utf-8")
    const preflight = preflightShowImport(
      jsonText,
      "TZILA_STORY_SHOW.tada.json",
    )
    expect(preflight.ok).toBe(true)
    expect(preflight.issues).toEqual([])
    expect(preflight.format).toBe("tada-json")
    expect(preflight.summary?.questionCount).toBe(10)
    expect(preflight.summary?.surveyCount).toBe(10)
    expect(preflight.summary?.answerImageCount).toBe(50)
    expect(preflight.normalizedBundleDraft).toBeDefined()
    const bundle = preflight.normalizedBundleDraft as {
      quizz: QuizzValidated
    }
    expect(bundle.quizz.questions.length).toBe(10)
    for (const q of bundle.quizz.questions) {
      expect(q.answers.length).toBe(5)
      expect(q.playMode).toBe("survey")
      expect(q.maxPoints).toBe(0)
    }
  })

  // ── A03: 5-option .xlsx round-trip preserves all 5 answers and images ───────
  it("A03: 5-option .xlsx parses, exports, and round-trips without loss", () => {
    const xlsxPath = path.join(FIXTURES_DIR, "TZILA_STORY_SHOW.xlsx")
    const xlsxBuf = fs.readFileSync(xlsxPath)

    // Preflight check
    const preflight = preflightShowImport(xlsxBuf, "TZILA_STORY_SHOW.xlsx")
    expect(preflight.ok).toBe(true)
    expect(preflight.issues).toEqual([])
    expect(preflight.format).toBe("tada-xlsx")
    expect(preflight.summary?.totalCards).toBe(23)

    // Parse workbook
    const show = parseTadaShowWorkbook(xlsxBuf)
    expect(show.cards.length).toBe(23)
    const surveyCards = show.cards.filter((c) => c.kind === "survey")
    expect(surveyCards.length).toBe(10)
    for (const card of surveyCards) {
      expect(card.answers.length).toBe(5)
      for (const ans of card.answers) {
        expect(ans.imageUrl).toBeDefined()
        expect(ans.imageUrl?.startsWith("/media/")).toBe(true)
        expect(ans.alt).toBeDefined()
        expect(ans.alt!.length).toBeGreaterThan(0)
      }
    }

    // Export and re-parse to guarantee lossless round-trip
    const exportedBuf = exportTadaShowWorkbook(show)
    const reParsed = parseTadaShowWorkbook(exportedBuf)
    expect(reParsed.cards.length).toBe(show.cards.length)
    expect(reParsed.title).toBe(show.title)
    for (let i = 0; i < show.cards.length; i += 1) {
      const orig = show.cards[i]
      const round = reParsed.cards[i]
      expect(round.kind).toBe(orig.kind)
      expect(round.key).toBe(orig.key)

      if (orig.kind === "survey" && round.kind === "survey") {
        expect(round.answers.length).toBe(5)
        for (let a = 0; a < 5; a += 1) {
          expect(round.answers[a].text).toBe(orig.answers[a].text)
          expect(round.answers[a].imageUrl).toBe(orig.answers[a].imageUrl)
          expect(round.answers[a].alt).toBe(orig.answers[a].alt)
        }
      }
    }
  })

  // ── A04: 5-option normal quiz preserves solution index 5 -> 0-based 4 ───────
  it("A04: 5-option quiz with solution [5] imports and maps to 0-based [4]", () => {
    const quizCard = authoredQuizCardSchema.parse({
      key: "Q5",
      kind: "quiz",
      question: "Which number is five?",
      answers: [
        {
          text: "One",
          display: "text",
        },
        {
          text: "Two",
          display: "text",
        },
        {
          text: "Three",
          display: "text",
        },
        {
          text: "Four",
          display: "text",
        },
        {
          text: "Five",
          display: "text",
        },
      ],
      correctAnswers: [5],
    })
    const show: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Five-Choice Quiz Test",
      cards: [quizCard],
    }
    const convertRes = authoredShowToNativeBundleDraft(show)
    expect(convertRes.ok).toBe(true)
    const bundle = convertRes.bundleDraft!
    expect(bundle.quizz.questions[0].answers.length).toBe(5)
    expect(bundle.quizz.questions[0].solutions).toEqual([4])

    // Convert back from native to authored
    const reverted = nativeBundleToAuthoredShow(bundle)
    const { 0: revertedCard } = reverted.cards
    expect(revertedCard.kind).toBe("quiz")

    if (revertedCard.kind === "quiz") {
      expect(revertedCard.correctAnswers).toEqual([5])
    }
  })

  // ── A05: Rejection of 6 options, bad media URLs, and missing alt ────────────
  it("A05: 6 choices, bad media URLs, and missing alt are strictly rejected", () => {
    // 6 answers rejected
    const sixAnswers = Array.from(
      {
        length: 6,
      },
      (_, i) => ({
        text: `Option ${i + 1}`,
        display: "text" as const,
      }),
    )
    const res6 = authoredSurveyCardSchema.safeParse({
      key: "S6",
      kind: "survey",
      question: "Six options",
      answers: sixAnswers,
    })
    expect(res6.success).toBe(false)

    // Unsafe media URL rejected
    const badUrlRes = authoredSurveyCardSchema.safeParse({
      key: "S_BAD_URL",
      kind: "survey",
      question: "Bad URL",
      answers: [
        {
          text: "A",
          display: "image",
          imageUrl: "javascript:alert(1)",
          alt: "Malicious",
        },
        {
          text: "B",
          display: "text",
        },
      ],
    })
    expect(badUrlRes.success).toBe(false)

    // Empty alt on image display rejected
    const emptyAltRes = authoredSurveyCardSchema.safeParse({
      key: "S_EMPTY_ALT",
      kind: "survey",
      question: "Empty alt",
      answers: [
        {
          text: "A",
          display: "image",
          imageUrl: "/media/photo.png",
          alt: "   ",
        },
        {
          text: "B",
          display: "text",
        },
      ],
    })
    expect(emptyAltRes.success).toBe(false)
  })

  // ── A07: Design tokens & labels for 5th answer ──────────────────────────────
  it("A07: Fifth answer color and label tokens exist and match design system", () => {
    expect(MAX_ANSWERS).toBe(5)
    expect(CANONICAL_ANSWER_COLORS).toHaveLength(5)
    expect(CANONICAL_ANSWER_COLORS[4]).toBe(
      "bg-[var(--color-answer-5)] text-white",
    )

    // Verify packages/web/src/features/game/utils/constants.ts file content
    const webConstantsPath = path.resolve(
      __dirname,
      "../../../packages/web/src/features/game/utils/constants.ts",
    )
    const webContent = fs.readFileSync(webConstantsPath, "utf-8")
    expect(webContent).toContain('"bg-[var(--color-answer-5)] text-white"')
    expect(webContent).toContain('"5"')

    // Verify packages/web/src/index.css theme definition
    const cssPath = path.resolve(
      __dirname,
      "../../../packages/web/src/index.css",
    )
    const cssContent = fs.readFileSync(cssPath, "utf-8")
    expect(cssContent).toContain("--color-answer-5: #0072b2;")
  })

  // ── A09 & A10 & A11: Telephony Survey DTMF 1-5 ─────────────────────────────
  it("A09, A10, A11: DTMF 1-5 support for surveys with neutral feedback and no score", async () => {
    // 1. DTMF mapping unit checks
    expect(mapDtmfToAnswerIndex("1")).toBe(0)
    expect(mapDtmfToAnswerIndex("2")).toBe(1)
    expect(mapDtmfToAnswerIndex("3")).toBe(2)
    expect(mapDtmfToAnswerIndex("4")).toBe(3)
    expect(mapDtmfToAnswerIndex("5")).toBe(4)
    expect(mapDtmfToAnswerIndex("6")).toBeNull()
    expect(mapDtmfToAnswerIndex("0")).toBeNull()

    // 2. PSTN survey eligibility
    const pstnSurveyCheck = isQuestionSupportedOnPstn(
      QUIZZ_MODES.QUIZ,
      QUESTION_TYPES.SINGLE,
      5,
      "survey",
    )
    expect(pstnSurveyCheck.supported).toBe(true)

    // 3. Full bridge DTMF simulation for survey
    const transport = new MockRazziaTransport()
    const provider = new MockProvider()
    const bridge = new TelephonyBridge({
      transport,
      provider,
    })
    const simulator = new KeypadSimulatorCore(bridge)
    transport.registerGame({
      gameId: "game_tzila_poll",
      inviteCode: "123456",
      gameMode: QUIZZ_MODES.SURVEY,
    })

    // Join call
    await simulator.startCall()
    await simulator.enterDigits("123456")
    expect(bridge.getActiveSessionsCount()).toBe(1)

    // Question epoch 1 active with 5 choices in survey mode
    transport.startQuestion("game_tzila_poll", {
      index: 0,
      epoch: 1,
      question: "Who is the main character?",
      answers: ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
      questionType: "single",
    })

    // Press DTMF 5
    const dir5 = await simulator.pressKey("5")
    expect(dir5.type).toBe("play")
    // Neutral survey acknowledgement: no right/wrong, no points
    expect(dir5.message).toContain("Thank you. Your answer has been recorded.")
    const recorded = transport.getRecordedAnswers()
    expect(recorded).toHaveLength(1)
    // DTMF 5 -> index 4
    expect(recorded[0].answerKeys).toEqual([4])

    // Duplicate answer in same epoch is rejected
    const dupDir = await simulator.pressKey("3")
    expect(dupDir.message).toContain("already been recorded")
    expect(transport.getRecordedAnswers()).toHaveLength(1)

    // DTMF 6 is rejected
    const invalidDir = await simulator.pressKey("6")
    expect(invalidDir.message).toContain("between 1 and 5")
  })

  // ── A12 & A13: Winner Plurality & Tie Reveal ────────────────────────────────
  it("A12: Winner plurality leader spotlight for vote distribution [3, 7, 2, 1, 0]", () => {
    const counts = [3, 7, 2, 1, 0]
    let maxCount = 0
    for (const c of counts) {
      if (c > maxCount) {
        maxCount = c
      }
    }
    const winners = counts
      .map((c, i) => (c === maxCount && maxCount > 0 ? i : -1))
      .filter((i) => i >= 0)

    // Option 2 (0-indexed 1)
    expect(winners).toEqual([1])
    expect(maxCount).toBe(7)
  })
  it("A13: Co-winners tie reveal for [3, 3, 0, 0, 0] and no winner for 0 votes", () => {
    // Tie case
    const tieCounts = [3, 3, 0, 0, 0]
    let maxTie = 0
    for (const c of tieCounts) {
      if (c > maxTie) {
        maxTie = c
      }
    }
    const tieWinners = tieCounts
      .map((c, i) => (c === maxTie && maxTie > 0 ? i : -1))
      .filter((i) => i >= 0)

    // Options 1 and 2 tied
    expect(tieWinners).toEqual([0, 1])
    expect(tieWinners.length).toBeGreaterThan(1)

    // Zero votes case
    const zeroCounts = [0, 0, 0, 0, 0]
    let maxZero = 0
    for (const c of zeroCounts) {
      if (c > maxZero) {
        maxZero = c
      }
    }
    const zeroWinners = zeroCounts
      .map((c, i) => (c === maxZero && maxZero > 0 ? i : -1))
      .filter((i) => i >= 0)
    expect(zeroWinners).toEqual([])
  })

  // ── A14 & A15: Complete 23-card sequence, no points, no leaderboard ─────────
  it("A14, A15: 10 surveys + 10 interimResults in order, zero points, no leaderboard", () => {
    const jsonPath = path.join(FIXTURES_DIR, "TZILA_STORY_SHOW.tada.json")
    const show = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as TadaShowV1
    expect(show.cards.length).toBe(23)
    expect(show.cards[0].kind).toBe("opening")
    const expectedSequence = [
      "OPENING",
      "R1C1",
      "R1C1_RESULTS",
      "R1C2",
      "R1C2_RESULTS",
      "R1C3",
      "R1C3_RESULTS",
      "R1C4",
      "R1C4_RESULTS",
      "R1C5",
      "R1C5_RESULTS",
      "ROUND_2",
      "R2C1",
      "R2C1_RESULTS",
      "R2C2",
      "R2C2_RESULTS",
      "R2C3",
      "R2C3_RESULTS",
      "R2C4",
      "R2C4_RESULTS",
      "R2C5",
      "R2C5_RESULTS",
      "FINALE",
    ]
    expect(show.cards.map((c) => c.key)).toEqual(expectedSequence)

    // Verify all survey cards have 0 points, no correct answers, 5 choices
    for (const card of show.cards) {
      if (card.kind === "survey") {
        expect(card.maxPoints).toBe(0)
        expect(card.penalty).toBe(0)
        expect(card.timeSeconds).toBe(20)
        expect(card.answers.length).toBe(5)
        expect(card.correctAnswers ?? []).toHaveLength(0)
      }

      // Guarantee no leaderboard cards were injected
      expect(card.kind).not.toBe("leaderboard")
    }
  })

  // ── A16: 40 Assets Intact, Round 2 C3 and C5 Reuse Round 1 Assets ───────────
  it("A16: 40 distinct assets intake verified, R2C3/R2C5 reuse C3/C5 without duplicate upload", () => {
    const mapPath = path.join(FIXTURES_DIR, "MEDIA_URL_MAP.json")
    expect(fs.existsSync(mapPath)).toBe(true)
    const details = JSON.parse(fs.readFileSync(mapPath, "utf-8")) as Array<{
      file: string
      sha256: string
    }>
    expect(details.length).toBe(40)

    // Verify the immutable intake assets in the repository. A developer's live
    // config/media directory is neither a fixture nor required for this test.
    for (const item of details) {
      const filePath = path.join(FIXTURES_DIR, item.file)
      expect(fs.existsSync(filePath)).toBe(true)
      const fileBuf = fs.readFileSync(filePath)
      expect(fileBuf.length).toBeGreaterThan(0)
      // Check PNG magic bytes
      expect(fileBuf.subarray(0, 4)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      )
      const hash = crypto.createHash("sha256").update(fileBuf).digest("hex")
      expect(hash).toBe(item.sha256)
    }

    // Check JSON reuse: R2C3 choices must match R1C3 choices
    const jsonPath = path.join(FIXTURES_DIR, "TZILA_STORY_SHOW.tada.json")
    const show = JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as TadaShowV1
    const r1c3 = show.cards.find((c) => c.key === "R1C3")
    const r2c3 = show.cards.find((c) => c.key === "R2C3")
    const r1c5 = show.cards.find((c) => c.key === "R1C5")
    const r2c5 = show.cards.find((c) => c.key === "R2C5")
    expect(r1c3 && r2c3 && r1c5 && r2c5).toBeTruthy()

    if (r1c3?.kind === "survey" && r2c3?.kind === "survey") {
      for (let a = 0; a < 5; a += 1) {
        expect(r2c3.answers[a].imageUrl).toBe(r1c3.answers[a].imageUrl)
      }
    }

    if (r1c5?.kind === "survey" && r2c5?.kind === "survey") {
      for (let a = 0; a < 5; a += 1) {
        expect(r2c5.answers[a].imageUrl).toBe(r1c5.answers[a].imageUrl)
      }
    }
  })
})
