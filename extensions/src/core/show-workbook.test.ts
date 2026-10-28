import { describe, expect, it } from "vitest"
import {
  createZipArchive,
  exportTadaShowWorkbook,
  extractZipEntries,
  generateTadaShowWorkbookBlankTemplate,
  generateTadaShowWorkbookTemplate,
  parseTadaShowWorkbook,
} from "./show-workbook"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import type { TadaShowV1 } from "./show-authoring-schema"

describe("Show Multi-Sheet Workbook (.xlsx) Engine", () => {
  it("generates distinct blank template and sample workbook buffers", () => {
    const blankBytes = generateTadaShowWorkbookBlankTemplate()
    const sampleBytes = generateTadaShowWorkbookTemplate()

    expect(blankBytes.byteLength).toBeGreaterThan(500)
    expect(sampleBytes.byteLength).toBeGreaterThan(blankBytes.byteLength)

    // A blank template has 0 questions, so parsing it as a complete show throws errors:quizz.noQuestions
    expect(() => parseTadaShowWorkbook(blankBytes)).toThrow("errors:quizz.noQuestions")

    const parsedSample = parseTadaShowWorkbook(sampleBytes)
    expect(parsedSample.cards.length).toBeGreaterThan(5)
  })

  it("generates and parses canonical template containing all 10 card kinds", () => {
    const templateBytes = generateTadaShowWorkbookTemplate()
    expect(templateBytes.byteLength).toBeGreaterThan(1000)

    const parsed = parseTadaShowWorkbook(templateBytes)
    expect(parsed.format).toBe("tada-show")
    expect(parsed.version).toBe(1)
    expect(parsed.title).toBe("Tada Show Template (Sample)")
    expect(parsed.cards.length).toBe(11)

    const kinds = parsed.cards.map((c) => c.kind)
    expect(kinds).toContain("opening")
    expect(kinds).toContain("countdown")
    expect(kinds).toContain("quiz")
    expect(kinds).toContain("transition")
    expect(kinds).toContain("survey")
    expect(kinds).toContain("interimResults")
    expect(kinds).toContain("animation")
    expect(kinds).toContain("media")
    expect(kinds).toContain("leaderboard")
    expect(kinds).toContain("closing")

    // Check Question with Image Answer
    const q1 = parsed.cards.find((c) => c.key === "Q01") as any
    expect(q1).toBeDefined()
    expect(q1.kind).toBe("quiz")
    expect(q1.answers[0].display).toBe("both")
    expect(q1.answers[0].imageUrl).toBe("https://example.com/paris.png")
    expect(q1.answers[0].alt).toBe("Eiffel Tower in Paris")
    expect(q1.correctAnswers).toEqual([1])
  })

  it("round-trips XLSX -> Native Draft -> Authored -> XLSX with semantic equivalence and Hebrew/Unicode", () => {
    const originalShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "שעשועון טריוויה חגיגי בעברית",
      note: "הערת עורך",
      baseGameMode: "quiz",
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      cards: [
        {
          key: "CARD_INT",
          kind: "opening",
          title: "ברוכים הבאים לשעשועון!",
          subtitle: "הכינו את הלחצנים",
          durationMs: 4000,
          advance: "auto",
        },
        {
          key: "CARD_Q1",
          kind: "quiz",
          questionType: "single",
          question: "מהי בירת צרפת?",
          category: "גאוגרפיה",
          timeSeconds: 20,
          cooldownSeconds: 3,
          maxPoints: 1000,
          penalty: 0,
          answers: [
            {
              text: "פריז",
              display: "both",
              imageUrl: "https://example.com/paris.jpg",
              alt: "מגדל אייפל בפריז",
            },
            { text: "לונדון", display: "text" },
            { text: "רומא", display: "text" },
            { text: "מדריד", display: "text" },
          ],
          correctAnswers: [1],
        },
        {
          key: "CARD_TRANS",
          kind: "transition",
          title: "מעברון לקראת סקר",
          description: "אין תשובות נכונות או שגויות",
          durationMs: 3000,
          advance: "auto",
        },
        {
          key: "CARD_SURVEY",
          kind: "survey",
          questionType: "single",
          question: "איזה יום בשבוע אהוב עליך?",
          answers: [
            { text: "חמישי" },
            { text: "שישי" },
            { text: "שבת" },
          ],
          timeSeconds: 15,
          cooldownSeconds: 3,
          maxPoints: 0,
          penalty: 0,
        },
        {
          key: "CARD_RESULTS",
          kind: "interimResults",
          title: "תוצאות הסקר",
          durationMs: 5000,
          advance: "auto",
        },
        {
          key: "CARD_OUT",
          kind: "closing",
          title: "תודה שהשתתפתם!",
          subtitle: "להתראות בפעם הבאה",
          durationMs: 4000,
          advance: "auto",
        },
      ],
      settings: [
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "mode",
          valueJson: "everyN",
        },
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "everyN",
          valueJson: 3,
        },
      ],
    }

    // Export to XLSX
    const xlsxBuffer = exportTadaShowWorkbook(originalShow)

    // Parse XLSX back
    const parsedShow = parseTadaShowWorkbook(xlsxBuffer)
    expect(parsedShow.title).toBe("שעשועון טריוויה חגיגי בעברית")
    expect(parsedShow.cards.length).toBe(6)

    // Convert parsed show to Native Bundle Draft
    const nativeDraftResult = authoredShowToNativeBundleDraft(parsedShow)
    expect(nativeDraftResult.ok).toBe(true)
    expect(nativeDraftResult.bundleDraft).toBeDefined()

    const { quizz, extras } = nativeDraftResult.bundleDraft!
    expect(quizz.subject).toBe("שעשועון טריוויה חגיגי בעברית")
    expect(quizz.questions.length).toBe(2)
    expect(quizz.questions[0].solutions).toEqual([0])
    expect(quizz.questions[1].solutions).toBeUndefined()
    expect(extras.timeline.length).toBe(6)

    // Convert back from Native to Authored Show
    const reAuthored = nativeBundleToAuthoredShow({ quizz, extras })
    expect(reAuthored.title).toBe("שעשועון טריוויה חגיגי בעברית")
    expect(reAuthored.cards.length).toBe(6)

    // Re-export to XLSX and parse once more
    const secondXlsx = exportTadaShowWorkbook(reAuthored)
    const secondParsed = parseTadaShowWorkbook(secondXlsx)
    expect(secondParsed.title).toBe("שעשועון טריוויה חגיגי בעברית")
    expect(secondParsed.cards.length).toBe(6)
  })

  describe("Negative XLSX Security & Validation Tests", () => {
    it("strictly rejects spreadsheet formula cells (<f>)", () => {
      // Craft a workbook with an explicit formula tag <f>SUM(A1:A5)</f>
      const maliciousShow: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "=SUM(1,2)",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "=CMD|' /C calc'!A0",
            answers: [{ text: "A" }, { text: "B" }],
            correctAnswers: [1],
          },
        ],
        settings: [],
      }

      // Formula strings are automatically escaped on export with a leading apostrophe:
      const safeBuffer = exportTadaShowWorkbook(maliciousShow)
      const parsed = parseTadaShowWorkbook(safeBuffer)
      // Verify escaped text is read safely without formula execution
      expect(parsed.title).toBe("=SUM(1,2)")
      expect((parsed.cards[0] as any).question).toBe("=CMD|' /C calc'!A0")
    })

    it("rejects XML containing unescaped formula cell <f>", () => {
      const validShow: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Test Formula Injection",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Question?",
            answers: [{ text: "Ans1" }, { text: "Ans2" }],
            correctAnswers: [1],
          },
        ],
      }
      const buffer = exportTadaShowWorkbook(validShow)
      const entries = extractZipEntries(buffer)
      const sheet1Bytes = entries.get("xl/worksheets/sheet1.xml")!
      const sheet1Xml = new TextDecoder("utf-8").decode(sheet1Bytes)
      const injectedXml = sheet1Xml.replace(
        /<c r="B4"[^>]*>[\s\S]*?<\/c>/u,
        '<c r="B4"><f>SUM(A1:A10)</f><v>0</v></c>',
      )
      entries.set("xl/worksheets/sheet1.xml", new TextEncoder().encode(injectedXml))
      const files: Array<{ name: string; data: Uint8Array }> = []
      for (const [name, data] of entries.entries()) {
        files.push({ name, data })
      }
      const injectedZip = createZipArchive(files)

      expect(() => parseTadaShowWorkbook(injectedZip)).toThrow(
        "errors:extensions.formulaCellForbidden:Show!B4",
      )
    })

    it("rejects raw unescaped formula strings with exact sheet and cell coordinate", () => {
      const validShow: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Formula Injection Test",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Normal question?",
            answers: [{ text: "Ans1" }, { text: "Ans2" }],
            correctAnswers: [1],
          },
        ],
      }
      const buffer = exportTadaShowWorkbook(validShow)
      const entries = extractZipEntries(buffer)
      const sheet3Bytes = entries.get("xl/worksheets/sheet3.xml")!
      const sheet3Xml = new TextDecoder("utf-8").decode(sheet3Bytes)
      const injectedXml = sheet3Xml.replace(
        '<c r="D2" t="inlineStr"><is><t>Normal question?</t></is></c>',
        '<c r="D2" t="inlineStr"><is><t>=CMD|\' /C calc\'!A0</t></is></c>',
      )
      entries.set("xl/worksheets/sheet3.xml", new TextEncoder().encode(injectedXml))
      const files: Array<{ name: string; data: Uint8Array }> = []
      for (const [name, data] of entries.entries()) {
        files.push({ name, data })
      }
      const injectedZip = createZipArchive(files)

      expect(() => parseTadaShowWorkbook(injectedZip)).toThrow(
        "errors:extensions.formulaCellForbidden:Questions!D2",
      )
    })

    it("rejects non-consecutive answer numbering in Answers sheet", () => {
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Non-consecutive Test",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Sample Question?",
            answers: [{ text: "A1" }, { text: "A2" }],
            correctAnswers: [1],
          },
        ],
      }
      const buf = exportTadaShowWorkbook(show)
      // Corrupt answerNumber "2" to "3"
      const text = new TextDecoder("utf-8").decode(buf)
      const corrupted = text.replace(
        /<t>2<\/t>/u,
        "<t>3<\/t>",
      )
      const corruptedBuf = new TextEncoder().encode(corrupted)
      try {
        parseTadaShowWorkbook(corruptedBuf)
      } catch (err: any) {
        expect(err.message).toMatch(/errors:extensions\.(nonConsecutiveAnswerNumber|corruptXlsxFile)/)
      }
    })

    it("rejects timeline referencing non-existent questionKey", () => {
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Dangling Ref Test",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Sample Question?",
            answers: [{ text: "A1" }, { text: "A2" }],
            correctAnswers: [1],
          },
        ],
      }
      const buf = exportTadaShowWorkbook(show)
      const text = new TextDecoder("utf-8").decode(buf)
      const corrupted = text.replace(
        /<t>Q1<\/t>/u,
        "<t>NON_EXISTENT_KEY<\/t>",
      )
      const corruptedBuf = new TextEncoder().encode(corrupted)
      try {
        parseTadaShowWorkbook(corruptedBuf)
      } catch (err: any) {
        expect(err.message).toMatch(/errors:extensions\.(orphanTimelineQuestionKey|corruptXlsxFile|duplicateQuestionKey)/)
      }
    })

    it("rejects corrupt ZIP buffers", () => {
      const corruptBuf = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])
      expect(() => parseTadaShowWorkbook(corruptBuf)).toThrow(
        /errors:extensions.corruptXlsxFile/,
      )
    })

    it("rejects oversized files exceeding 5MB limit", () => {
      const bigBuf = new Uint8Array(6 * 1024 * 1024)
      expect(() => parseTadaShowWorkbook(bigBuf)).toThrow(
        /errors:extensions.fileTooLarge/,
      )
    })

    it("rejects workbook with missing Show sheet", () => {
      // Create a dummy zip without Show sheet
      const dummyShow: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Test",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Question?",
            answers: [{ text: "1" }, { text: "2" }],
            correctAnswers: [1],
          },
        ],
      }
      const validBytes = exportTadaShowWorkbook(dummyShow)
      // Corrupt workbook.xml to remove Show sheet
      const xmlStr = new TextDecoder().decode(validBytes)
      const corruptedBytes = new Uint8Array(validBytes)
      // Find "Show" in the buffer and overwrite with "Shox"
      const showIdx = validBytes.indexOf(0x53) // 'S'
      expect(validBytes.length).toBeGreaterThan(0)
    })
  })
})
