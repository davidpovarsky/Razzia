import { describe, expect, it } from "vitest"
import { preflightShowImport } from "./show-import-preflight"
import { generateTadaShowWorkbookTemplate } from "./show-workbook"
import { authoredShowToNativeBundleDraft } from "./show-authoring-convert"
import type { TadaShowV1 } from "./show-authoring-schema"

describe("Show Import Preflight & Format Detection", () => {
  it("detects and validates legacy JSON quiz", () => {
    const legacy = {
      subject: "Legacy Trivia Quiz",
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Question 1?",
          answers: ["A1", "A2"],
          solutions: [0],
          time: 20,
          cooldown: 3,
        },
        {
          type: "single",
          playMode: "survey",
          question: "Question 2 (Survey)?",
          answers: ["S1", "S2"],
          time: 15,
          cooldown: 3,
        },
      ],
    }

    const result = preflightShowImport(JSON.stringify(legacy), "legacy.json")
    expect(result.ok).toBe(true)
    expect(result.format).toBe("legacy-json")
    expect(result.summary).toBeDefined()
    expect(result.summary?.title).toBe("Legacy Trivia Quiz")
    expect(result.summary?.totalCards).toBe(2)
    expect(result.summary?.quizCount).toBe(1)
    expect(result.summary?.surveyCount).toBe(1)
    expect(result.legacyQuizzDraft).toBeDefined()
  })

  it("detects and validates friendly Tada JSON (.tada.json)", () => {
    const tadaShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Friendly Showcase",
      cards: [
        {
          key: "INTRO",
          kind: "opening",
          title: "Welcome!",
          durationMs: 3000,
          advance: "auto",
        },
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "What is 5 x 5?",
          answers: [
            {
              text: "25",
              display: "both",
              imageUrl: "https://example.com/25.jpg",
              alt: "Number 25",
            },
            { text: "50", display: "text" },
          ],
          correctAnswers: [1],
          timeSeconds: 15,
          cooldownSeconds: 3,
        },
      ],
      settings: [],
    }

    const result = preflightShowImport(
      JSON.stringify(tadaShow),
      "show.tada.json",
    )
    expect(result.ok).toBe(true)
    expect(result.format).toBe("tada-json")
    expect(result.summary?.title).toBe("Friendly Showcase")
    expect(result.summary?.totalCards).toBe(2)
    expect(result.summary?.quizCount).toBe(1)
    expect(result.summary?.sceneCount).toBe(1)
    expect(result.summary?.answerImageCount).toBe(1)
    expect(result.normalizedBundleDraft).toBeDefined()

    // Warning for remote HTTPS image
    expect(
      result.issues.some(
        (i) => i.severity === "warning" && i.code === "REMOTE_ANSWER_IMAGE",
      ),
    ).toBe(true)
  })

  it("detects and validates multi-sheet Excel workbook (.xlsx)", () => {
    const xlsxBuffer = generateTadaShowWorkbookTemplate()
    const result = preflightShowImport(xlsxBuffer, "template.xlsx")

    expect(result.ok).toBe(true)
    expect(result.format).toBe("tada-xlsx")
    expect(result.summary?.title).toBe("Tada Show Template (Sample)")
    expect(result.summary?.totalCards).toBe(11)
    expect(result.summary?.quizCount).toBe(2)
    expect(result.summary?.surveyCount).toBe(1)
    expect(result.summary?.sceneCount).toBe(8)
    expect(result.summary?.answerImageCount).toBe(1)
    expect(result.normalizedBundleDraft).toBeDefined()
  })

  it("fails gracefully with clean actionable issues on malformed inputs", () => {
    // Malformed JSON syntax
    const badJson = preflightShowImport("{ not valid json ", "test.json")
    expect(badJson.ok).toBe(false)
    expect(badJson.issues[0].code).toBe("JSON_SYNTAX_ERROR")

    // Empty object
    const emptyObj = preflightShowImport("{}", "empty.json")
    expect(emptyObj.ok).toBe(false)
    expect(emptyObj.issues.length).toBeGreaterThan(0)

    // Corrupt zip
    const badXlsx = preflightShowImport(
      new Uint8Array([1, 2, 3]),
      "corrupt.xlsx",
    )
    expect(badXlsx.ok).toBe(false)
    expect(badXlsx.issues[0].code).toBe("WORKBOOK_PARSE_ERROR")
  })

  it("strictly rejects unsafe media URLs across tada-json, legacy-json, and enhanced-bundle", () => {
    // 1. tada-json with javascript: url
    const badTadaJson = {
      format: "tada-show",
      version: 1,
      title: "Unsafe Media Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Dangerous question?",
          media: {
            type: "image",
            url: "javascript:alert(1)",
          },
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
    }
    const tadaResult = preflightShowImport(
      JSON.stringify(badTadaJson),
      "unsafe.tada.json",
    )
    expect(tadaResult.ok).toBe(false)
    expect(
      tadaResult.issues.some((i) =>
        i.messageKey.includes("errors:extensions.invalidMediaUrl"),
      ),
    ).toBe(true)

    // 2. legacy-json with unsafe media url
    const badLegacyJson = {
      subject: "Unsafe Legacy",
      gameMode: "quiz",
      questions: [
        {
          type: "single",
          question: "Question?",
          answers: ["A", "B"],
          solutions: [0],
          time: 20,
          cooldown: 3,
          media: {
            type: "image",
            url: "http://insecure.example.com/pic.png",
          },
        },
      ],
    }
    const legacyResult = preflightShowImport(
      JSON.stringify(badLegacyJson),
      "unsafe-legacy.json",
    )
    expect(legacyResult.ok).toBe(false)
    expect(
      legacyResult.issues.some(
        (i) =>
          i.code === "UNSAFE_MEDIA_URL" &&
          i.messageKey === "errors:extensions.invalidMediaUrl",
      ),
    ).toBe(true)

    // 3. enhanced-bundle with unsafe question media
    const validShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Valid Bundle Source",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
      ],
      settings: [],
    }
    const validDraft = authoredShowToNativeBundleDraft(validShow).bundleDraft!
    const badBundle = {
      bundleVersion: 1,
      quizz: {
        ...validDraft.quizz,
        questions: [
          {
            ...validDraft.quizz.questions[0],
            media: {
              type: "image",
              url: "javascript:alert('pwn')",
            },
          },
        ],
      },
      extras: validDraft.extras,
    }
    const bundleResult = preflightShowImport(
      JSON.stringify(badBundle),
      "unsafe.bundle.json",
    )
    expect(bundleResult.ok).toBe(false)
    expect(bundleResult.issues.some((i) => i.code === "UNSAFE_MEDIA_URL")).toBe(
      true,
    )
  })

  it("normalizes pre-modern legacy quiz missing gameMode cleanly", () => {
    const preModernLegacy = {
      subject: "Pre-modern Quiz",
      questions: [
        {
          type: "single",
          question: "Legacy question?",
          answers: ["A", "B"],
          solutions: [0],
          time: 20,
          cooldown: 3,
        },
      ],
    }
    const result = preflightShowImport(
      JSON.stringify(preModernLegacy),
      "old-quiz.json",
    )
    expect(result.ok).toBe(true)
    expect(result.format).toBe("legacy-json")
    expect(result.legacyQuizzDraft?.gameMode).toBe("quiz")
  })
})
