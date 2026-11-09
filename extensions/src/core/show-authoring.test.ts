// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import type { QuizExtrasV2 } from "./index"
import { describe, expect, it } from "vitest"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import {
  isTadaShowV1,
  tadaShowV1Schema,
  type TadaShowV1,
  type AuthoredQuizCard,
  type AuthoredSurveyCard,
  type AuthoredOpeningCard,
  type AuthoredMediaCard,
  type AuthoredClosingCard,
} from "./show-authoring-schema"
describe("Show Authoring Schema & Converters", () => {
  const minimalValidShow: TadaShowV1 = {
    format: "tada-show",
    version: 1,
    title: "Minimal Test Show",
    baseGameMode: "quiz",
    cards: [
      {
        key: "Q1",
        kind: "quiz",
        questionType: "single",
        question: "What is 2 + 2?",
        answers: [
          {
            text: "3",
            display: "text",
          },
          {
            text: "4",
            display: "text",
          },
        ],
        correctAnswers: [2],
        timeSeconds: 20,
        cooldownSeconds: 3,
        maxPoints: 1000,
        penalty: 0,
      },
    ],
    settings: [],
  }
  it("validates minimal friendly show schema", () => {
    expect(isTadaShowV1(minimalValidShow)).toBe(true)
    const parsed = tadaShowV1Schema.safeParse(minimalValidShow)
    expect(parsed.success).toBe(true)
  })
  it("rejects show with duplicate card keys", () => {
    const invalidShow = {
      ...minimalValidShow,
      cards: [
        minimalValidShow.cards[0],
        {
          ...minimalValidShow.cards[0],
          question: "Another question",
        },
      ],
    }
    const result = tadaShowV1Schema.safeParse(invalidShow)
    expect(result.success).toBe(false)

    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("duplicateCardKey:Q1"),
        ),
      ).toBe(true)
    }
  })
  it("rejects show with no question cards", () => {
    const sceneOnlyShow = {
      format: "tada-show",
      version: 1,
      title: "Scene Only",
      cards: [
        {
          key: "INTRO",
          kind: "opening",
          title: "Welcome",
          durationMs: 3000,
          advance: "auto",
        },
      ],
    }
    const result = tadaShowV1Schema.safeParse(sceneOnlyShow)
    expect(result.success).toBe(false)
  })
  it("rejects quiz card with out-of-bounds correct answer", () => {
    const invalidAnsShow = {
      ...minimalValidShow,
      cards: [
        {
          ...minimalValidShow.cards[0],
          // Only 2 answers!
          correctAnswers: [5],
        },
      ],
    }
    const result = tadaShowV1Schema.safeParse(invalidAnsShow)
    expect(result.success).toBe(false)

    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("solutionOutOfBounds:5"),
        ),
      ).toBe(true)
    }
  })
  it("rejects image answer missing required alt text", () => {
    const missingAltShow = {
      ...minimalValidShow,
      cards: [
        {
          ...minimalValidShow.cards[0],
          answers: [
            {
              text: "Paris",
              display: "image",
              imageUrl: "https://example.com/paris.jpg",
              // Empty alt
              alt: "",
            },
            {
              text: "London",
              display: "text",
            },
          ],
        },
      ],
    }
    const result = tadaShowV1Schema.safeParse(missingAltShow)
    expect(result.success).toBe(false)

    if (!result.success) {
      expect(
        result.error.issues.some((i) =>
          i.message.includes("altRequiredForImage"),
        ),
      ).toBe(true)
    }
  })
  it("rejects unsafe media URLs", () => {
    const unsafeUrlShow = {
      ...minimalValidShow,
      cards: [
        {
          ...minimalValidShow.cards[0],
          answers: [
            {
              text: "Unsafe",
              display: "image",
              imageUrl: "javascript:alert(1)",
              alt: "Malicious",
            },
            {
              text: "Safe",
              display: "text",
            },
          ],
        },
      ],
    }
    const result = tadaShowV1Schema.safeParse(unsafeUrlShow)
    expect(result.success).toBe(false)

    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.message.includes("invalidMediaUrl")),
      ).toBe(true)
    }
  })
  it("converts complete 10-kind show and preserves exact chronological order and 0-based solution mapping", () => {
    const fullShow: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Complete 10-Kind Show",
      baseGameMode: "quiz",
      defaults: {
        newQuestionMode: "quiz",
        leaderboardPolicy: "cardOnly",
        advanceMode: "auto",
      },
      cards: [
        {
          key: "CARD_01",
          kind: "opening",
          title: "Show Start",
          subtitle: "Welcome everyone",
          durationMs: 4000,
          advance: "auto",
        },
        {
          key: "CARD_02",
          kind: "countdown",
          title: "Get Ready",
          durationSeconds: 5,
          advance: "auto",
        },
        {
          key: "CARD_03",
          kind: "quiz",
          questionType: "single",
          question: "Capital of France?",
          answers: [
            {
              text: "Paris",
              display: "both",
              imageUrl: "https://example.com/paris.png",
              alt: "Eiffel tower",
            },
            {
              text: "London",
              display: "text",
            },
            {
              text: "Berlin",
              display: "text",
            },
          ],
          // 1-based answer 1 -> 0-based solution 0
          correctAnswers: [1],
          timeSeconds: 20,
          cooldownSeconds: 3,
          maxPoints: 1000,
          penalty: 0,
        },
        {
          key: "CARD_04",
          kind: "transition",
          title: "Section Two",
          description: "Moving forward",
          durationMs: 3000,
          advance: "auto",
        },
        {
          key: "CARD_05",
          kind: "animation",
          preset: "confetti",
          title: "Celebration",
          durationMs: 2500,
          advance: "auto",
        },
        {
          key: "CARD_06",
          kind: "media",
          mediaUrl: "https://example.com/clip.mp4",
          mediaType: "video",
          title: "Video Interlude",
          durationMs: 10000,
          advance: "manual",
        },
        {
          key: "CARD_07",
          kind: "survey",
          questionType: "single",
          question: "How do you feel?",
          answers: [
            {
              text: "Great",
            },
            {
              text: "Good",
            },
            {
              text: "Okay",
            },
          ],
          timeSeconds: 15,
          cooldownSeconds: 3,
          maxPoints: 0,
          penalty: 0,
        },
        {
          key: "CARD_08",
          kind: "interimResults",
          title: "Mood Survey Results",
          durationMs: 5000,
          advance: "auto",
        },
        {
          key: "CARD_09",
          kind: "leaderboard",
          title: "Current Standings",
          durationMs: 6000,
          advance: "manual",
        },
        {
          key: "CARD_10",
          kind: "closing",
          title: "Goodbye!",
          subtitle: "Thanks for joining",
          durationMs: 4000,
          advance: "auto",
        },
      ],
      settings: [],
    }
    const conversion = authoredShowToNativeBundleDraft(fullShow)
    expect(conversion.ok).toBe(true)
    expect(conversion.bundleDraft).toBeDefined()
    const { quizz, extras } = conversion.bundleDraft!
    expect(quizz.subject).toBe("Complete 10-Kind Show")
    expect(quizz.questions.length).toBe(2)

    // Check Question 1 (Quiz)
    const { 0: q1 } = quizz.questions
    expect(q1.question).toBe("Capital of France?")
    expect(q1.playMode).toBe("quiz")
    // 1-based answer 1 converted to 0-based solution 0
    expect(q1.solutions).toEqual([0])

    // Check Question 2 (Survey)
    const { 1: q2 } = quizz.questions
    expect(q2.question).toBe("How do you feel?")
    expect(q2.playMode).toBe("survey")
    expect(q2.solutions).toBeUndefined()

    // Check Timeline Order
    expect(extras.timeline.length).toBe(10)
    const timelineKinds = extras.timeline.map((item) =>
      item.kind === "question"
        ? quizz.questions[extras.questionIds.indexOf(item.questionId)].playMode
        : item.kind,
    )
    expect(timelineKinds).toEqual([
      "opening",
      "countdown",
      "quiz",
      "transition",
      "animation",
      "media",
      "survey",
      "interimResults",
      "leaderboard",
      "closing",
    ])

    // Check Answer Visuals in perQuestion
    const { 0: q1Id } = extras.questionIds
    expect(extras.perQuestion[q1Id]).toBeDefined()
    expect(extras.perQuestion[q1Id].answerVisuals).toEqual([
      {
        answerIndex: 0,
        display: "both",
        url: "https://example.com/paris.png",
        alt: "Eiffel tower",
      },
    ])

    // Check Roundtrip: nativeBundleToAuthoredShow
    const backToAuthored = nativeBundleToAuthoredShow({
      quizz,
      extras,
    })
    expect(backToAuthored.format).toBe("tada-show")
    expect(backToAuthored.version).toBe(1)
    expect(backToAuthored.title).toBe("Complete 10-Kind Show")
    expect(backToAuthored.cards.length).toBe(10)
    expect(backToAuthored.cards.map((c) => c.kind)).toEqual([
      "opening",
      "countdown",
      "quiz",
      "transition",
      "animation",
      "media",
      "survey",
      "interimResults",
      "leaderboard",
      "closing",
    ])
    const roundtripQ1 = backToAuthored.cards[2] as AuthoredQuizCard
    expect(roundtripQ1.correctAnswers).toEqual([1])
    expect(roundtripQ1.answers[0].display).toBe("both")
    expect(roundtripQ1.answers[0].imageUrl).toBe(
      "https://example.com/paris.png",
    )
    expect(roundtripQ1.answers[0].alt).toBe("Eiffel tower")
  })
  it("losslessly roundtrips audio cues including non-default volume (0.37)", () => {
    const showWithAudio: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Audio Cue Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Test Question?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "audio",
          targetKey: "show",
          property: "cues",
          valueJson: {
            start: {
              source: "media",
              url: "https://example.com/start.mp3",
              volume: 0.37,
              enabled: true,
              loop: false,
            },
          },
        },
      ],
    }
    const conversion = authoredShowToNativeBundleDraft(showWithAudio)
    expect(conversion.ok).toBe(true)
    expect(conversion.bundleDraft?.extras.audio?.cues?.start.volume).toBe(0.37)
    expect(conversion.bundleDraft?.extras.audio?.cues?.start.url).toBe(
      "https://example.com/start.mp3",
    )
    const backToAuthored = nativeBundleToAuthoredShow(conversion.bundleDraft!)
    const audioSetting = backToAuthored.settings?.find(
      (s) => s.scope === "audio" && s.property === "cues",
    )
    expect(audioSetting).toBeDefined()
    expect(
      (audioSetting?.valueJson as QuizExtrasV2["audio"]["cues"])?.start?.volume,
    ).toBe(0.37)
    expect(
      (audioSetting?.valueJson as QuizExtrasV2["audio"]["cues"])?.start?.url,
    ).toBe("https://example.com/start.mp3")
  })
  it("losslessly preserves teams configuration even when enabled is false", () => {
    const showWithTeams: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Disabled Teams Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Test Question?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "team",
          targetKey: "show",
          property: "config",
          valueJson: {
            enabled: false,
            autoAssign: "roundRobin",
            teams: [
              {
                id: "t1",
                name: "Red Team",
                color: "#FF0000",
              },
              {
                id: "t2",
                name: "Blue Team",
                color: "#0000FF",
              },
            ],
          },
        },
      ],
    }
    const conversion = authoredShowToNativeBundleDraft(showWithTeams)
    expect(conversion.ok).toBe(true)
    expect(conversion.bundleDraft?.extras.teams?.enabled).toBe(false)
    expect(conversion.bundleDraft?.extras.teams?.teams).toHaveLength(2)
    const backToAuthored = nativeBundleToAuthoredShow(conversion.bundleDraft!)
    const teamSetting = backToAuthored.settings?.find(
      (s) => s.scope === "team" && s.property === "config",
    )
    expect(teamSetting).toBeDefined()
    expect((teamSetting?.valueJson as QuizExtrasV2["teams"])?.enabled).toBe(
      false,
    )
    expect(
      (teamSetting?.valueJson as QuizExtrasV2["teams"])?.teams,
    ).toHaveLength(2)
  })
  it("bidirectionally remaps leaderboard afterQuestionIds between card keys and native UUIDs", () => {
    const showWithLeaderboard: TadaShowV1 = {
      format: "tada-show",
      version: 1,
      title: "Leaderboard Key Remapping",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question 1?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
        },
        {
          key: "Q02",
          kind: "quiz",
          questionType: "single",
          question: "Question 2?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [2],
        },
      ],
      settings: [
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "afterQuestionIds",
          valueJson: ["Q01", "Q02"],
        },
      ],
    }
    const conversion = authoredShowToNativeBundleDraft(showWithLeaderboard)
    expect(conversion.ok).toBe(true)
    const { extras } = conversion.bundleDraft!

    // Verify native extras uses generated question UUIDs, NOT raw authoring keys "Q01", "Q02"
    expect(extras.leaderboard?.afterQuestionIds).toEqual(extras.questionIds)
    expect(extras.leaderboard?.afterQuestionIds).not.toContain("Q01")

    // Verify converting back to authored show maps UUIDs back to card keys "Q01", "Q02"
    const backToAuthored = nativeBundleToAuthoredShow(conversion.bundleDraft!)
    const lbSetting = backToAuthored.settings?.find(
      (s) => s.scope === "leaderboard" && s.property === "afterQuestionIds",
    )
    expect(lbSetting?.valueJson).toEqual(["Q01", "Q02"])
  })
  it("strictly rejects unknown setting scopes and properties during preflight validation", () => {
    const unknownScopeShow = {
      format: "tada-show",
      version: 1,
      title: "Unknown Scope Test",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "maliciousOrTypo",
          targetKey: "show",
          property: "hack",
          valueJson: "payload",
        },
      ],
    }
    const parseResult = tadaShowV1Schema.safeParse(unknownScopeShow)
    expect(parseResult.success).toBe(false)

    if (!parseResult.success) {
      expect(
        parseResult.error.issues.some((i) =>
          i.message.includes("unsupportedSettingScope:maliciousOrTypo"),
        ),
      ).toBe(true)
    }

    const unknownPropShow = {
      ...unknownScopeShow,
      settings: [
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "nonExistentSetting",
          valueJson: 42,
        },
      ],
    }
    const parseResult2 = tadaShowV1Schema.safeParse(unknownPropShow)
    expect(parseResult2.success).toBe(false)

    if (!parseResult2.success) {
      expect(
        parseResult2.error.issues.some((i) =>
          i.message.includes(
            "unsupportedSettingProperty:leaderboard.nonExistentSetting",
          ),
        ),
      ).toBe(true)
    }
  })
  it("strictly rejects non-empty extraJson on authored cards", () => {
    const showWithExtraJson = {
      format: "tada-show",
      version: 1,
      title: "ExtraJson Rejection Test",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
          extraJson: {
            untypedPayload: 123,
          },
        },
      ],
    }
    const parseResult = tadaShowV1Schema.safeParse(showWithExtraJson)
    expect(parseResult.success).toBe(false)

    if (!parseResult.success) {
      expect(
        parseResult.error.issues.some((i) =>
          i.message.includes("unsupportedExtraJson"),
        ),
      ).toBe(true)
    }
  })
  it("strips private roster PII by default during shareable export", () => {
    const bundleWithRoster = {
      quizz: {
        gameMode: "quiz" as const,
        subject: "Roster Test",
        questions: [
          {
            type: "single" as const,
            question: "Question?",
            answers: ["Ans1", "Ans2"],
            solutions: [0],
            cooldown: 3,
            time: 20,
          },
        ],
      },
      extras: {
        schemaVersion: 2 as const,
        quizId: "00000000-0000-0000-0000-000000000001",
        baseDigest: "dummy",
        revision: 1,
        questionIds: ["00000000-0000-0000-0000-000000000002"],
        timeline: [
          {
            id: "00000000-0000-0000-0000-000000000003",
            kind: "question" as const,
            questionId: "00000000-0000-0000-0000-000000000002",
          },
        ],
        perQuestion: {},
        roster: {
          enabled: true,
          participants: [
            {
              id: "p1",
              name: "Alice Secret",
              phone: "+1234567890",
            },
          ],
        },
      },
    }

    // Default export: shareable mode -> roster PII stripped
    const shareableShow = nativeBundleToAuthoredShow(
      bundleWithRoster as unknown as Parameters<
        typeof nativeBundleToAuthoredShow
      >[0],
    )
    const shareableRosterSetting = shareableShow.settings?.find(
      (s) => s.scope === "roster" && s.property === "config",
    )
    expect(shareableRosterSetting).toBeDefined()
    expect(
      (
        shareableRosterSetting?.valueJson as {
          participants: Array<{
            name: string
          }>
        }
      )?.participants,
    ).toEqual([])

    // Explicit opt-in export: private mode -> includes participants
    const privateShow = nativeBundleToAuthoredShow(
      bundleWithRoster as unknown as Parameters<
        typeof nativeBundleToAuthoredShow
      >[0],
      {
        includePrivateRoster: true,
      },
    )
    const privateRosterSetting = privateShow.settings?.find(
      (s) => s.scope === "roster" && s.property === "config",
    )
    expect(
      (
        privateRosterSetting?.valueJson as {
          participants: Array<{
            name: string
          }>
        }
      )?.participants,
    ).toHaveLength(1)
    expect(
      (
        privateRosterSetting?.valueJson as {
          participants: Array<{
            name: string
          }>
        }
      )?.participants[0].name,
    ).toBe("Alice Secret")
  })
  it("Gate C01: preserves quiz and survey perQuestion.interlude across native -> authored -> native", () => {
    const q1Id = "11111111-1111-1111-1111-111111111111"
    const q2Id = "22222222-2222-2222-2222-222222222222"
    const quizInterlude = {
      kind: "title" as const,
      title: "Get Ready for the Bonus!",
      durationMs: 4000,
      advance: "manual" as const,
      audioCue: "cues.applause",
    }
    const surveyInterlude = {
      kind: "video" as const,
      title: "Watch this clip",
      url: "https://example.com/media/survey-intro.mp4",
      durationMs: 8000,
      advance: "auto" as const,
      audioCue: "cues.countdown",
    }
    const nativeBundle = {
      quizz: {
        gameMode: "quiz" as const,
        subject: "Interlude Acceptance Quiz",
        questions: [
          {
            type: "single" as const,
            playMode: "quiz" as const,
            question: "Quiz Question?",
            answers: ["Ans A", "Ans B"],
            solutions: [0],
            cooldown: 3,
            time: 20,
          },
          {
            type: "single" as const,
            playMode: "survey" as const,
            question: "Survey Question?",
            answers: ["Yes", "No"],
            cooldown: 3,
            time: 15,
          },
        ],
      },
      extras: {
        schemaVersion: 2 as const,
        revision: 1,
        quizId: "33333333-3333-3333-3333-333333333333",
        baseDigest: "dummy-digest",
        questionIds: [q1Id, q2Id],
        timeline: [
          {
            id: "44444444-4444-4444-4444-444444444444",
            kind: "question" as const,
            questionId: q1Id,
          },
          {
            id: "55555555-5555-5555-5555-555555555555",
            kind: "question" as const,
            questionId: q2Id,
          },
        ],
        scenes: {},
        defaults: {
          newQuestionMode: "quiz" as const,
          leaderboardPolicy: "cardOnly" as const,
          advanceMode: "auto" as const,
        },
        perQuestion: {
          [q1Id]: {
            interlude: quizInterlude,
          },
          [q2Id]: {
            interlude: surveyInterlude,
          },
        },
      },
    }

    // 1. Native -> Authored
    const authored = nativeBundleToAuthoredShow(
      nativeBundle as unknown as Parameters<
        typeof nativeBundleToAuthoredShow
      >[0],
    )
    expect(authored.cards).toHaveLength(2)
    const authoredQ1 = authored.cards[0] as AuthoredQuizCard
    expect(authoredQ1.kind).toBe("quiz")
    expect(authoredQ1.interlude).toEqual(quizInterlude)
    const authoredQ2 = authored.cards[1] as AuthoredSurveyCard
    expect(authoredQ2.kind).toBe("survey")
    expect(authoredQ2.interlude).toEqual(surveyInterlude)

    // 2. Authored -> Native Draft
    const converted = authoredShowToNativeBundleDraft(authored)
    expect(converted.ok).toBe(true)
    expect(converted.bundleDraft).toBeDefined()
    const { extras: roundtripExtras, quizz: _roundtripQuizz } =
      converted.bundleDraft!
    expect(roundtripExtras.questionIds).toHaveLength(2)
    const { 0: newQ1Id } = roundtripExtras.questionIds
    const { 1: newQ2Id } = roundtripExtras.questionIds
    expect(roundtripExtras.perQuestion[newQ1Id]?.interlude).toEqual(
      quizInterlude,
    )
    expect(roundtripExtras.perQuestion[newQ2Id]?.interlude).toEqual(
      surveyInterlude,
    )

    // Ensure no spurious timeline scenes were injected
    expect(roundtripExtras.timeline).toHaveLength(2)
    expect(roundtripExtras.timeline.every((t) => t.kind === "question")).toBe(
      true,
    )
  })
  it("Gate C01: preserves answerVisuals, reveal, and interlude simultaneously without collision", () => {
    const qId = "11111111-2222-3333-4444-555555555555"
    const interludeConfig = {
      kind: "image" as const,
      title: "Next Question Visual",
      url: "https://example.com/media/preview.png",
      durationMs: 5000,
      advance: "auto" as const,
    }
    const revealConfig = {
      effect: "blur" as const,
      durationMs: 3000,
      trigger: "automatic" as const,
      audience: "all" as const,
    }
    const visualsConfig = [
      {
        answerIndex: 0,
        display: "image" as const,
        url: "https://example.com/media/ans1.png",
        alt: "Answer 1 Visual",
      },
    ]
    const nativeBundle = {
      quizz: {
        gameMode: "quiz" as const,
        subject: "Triple Combination Quiz",
        questions: [
          {
            type: "single" as const,
            playMode: "quiz" as const,
            question: "Full feature test?",
            answers: ["Choice A", "Choice B"],
            solutions: [0],
            cooldown: 3,
            time: 20,
          },
        ],
      },
      extras: {
        schemaVersion: 2 as const,
        revision: 1,
        quizId: "66666666-6666-6666-6666-666666666666",
        baseDigest: "dummy-digest",
        questionIds: [qId],
        timeline: [
          {
            id: "77777777-7777-7777-7777-777777777777",
            kind: "question" as const,
            questionId: qId,
          },
        ],
        scenes: {},
        defaults: {
          newQuestionMode: "quiz" as const,
          leaderboardPolicy: "cardOnly" as const,
          advanceMode: "auto" as const,
        },
        perQuestion: {
          [qId]: {
            answerVisuals: visualsConfig,
            reveal: revealConfig,
            interlude: interludeConfig,
          },
        },
      },
    }
    const authored = nativeBundleToAuthoredShow(
      nativeBundle as unknown as Parameters<
        typeof nativeBundleToAuthoredShow
      >[0],
    )
    const card = authored.cards[0] as AuthoredQuizCard
    expect(card.answers[0].imageUrl).toBe("https://example.com/media/ans1.png")
    expect(card.reveal).toEqual(revealConfig)
    expect(card.interlude).toEqual(interludeConfig)
    const roundtrip = authoredShowToNativeBundleDraft(authored)
    expect(roundtrip.ok).toBe(true)
    const { 0: newQId } = roundtrip.bundleDraft!.extras.questionIds
    const roundtripItem = roundtrip.bundleDraft!.extras.perQuestion[newQId]
    expect(roundtripItem.answerVisuals).toEqual(visualsConfig)
    expect(roundtripItem.reveal).toEqual(revealConfig)
    expect(roundtripItem.interlude).toEqual(interludeConfig)
  })
  it("Gate C02: persists show-level note across friendly -> native -> friendly (Hebrew, newlines, empty, absent)", () => {
    const testCases: Array<{
      name: string
      note: string | undefined
      expectedNote: string | undefined
    }> = [
      {
        name: "Hebrew note with punctuation and emojis",
        note: "הערת מפיק ראשית: נא לוודא סאונד במיקרופונים! 🎤✨",
        expectedNote: "הערת מפיק ראשית: נא לוודא סאונד במיקרופונים! 🎤✨",
      },
      {
        name: "Multiline note with quotes and newlines",
        note: 'Line 1: Special briefing\nLine 2: "Do not reveal answer before cue 3"\nLine 3: Final notes.',
        expectedNote:
          'Line 1: Special briefing\nLine 2: "Do not reveal answer before cue 3"\nLine 3: Final notes.',
      },
      {
        name: "Absent note",
        note: undefined,
        expectedNote: undefined,
      },
    ]
    for (const tc of testCases) {
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: `Show with ${tc.name}`,
        note: tc.note,
        baseGameMode: "quiz",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            questionType: "single",
            question: "Question?",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
          },
        ],
        settings: [],
      }

      // Friendly -> Native Draft
      const converted = authoredShowToNativeBundleDraft(show)
      expect(converted.ok).toBe(true)
      const { extras } = converted.bundleDraft!

      if (tc.expectedNote !== undefined) {
        expect(extras.authoring?.showNote).toBe(tc.expectedNote)
      } else {
        expect(extras.authoring).toBeUndefined()
      }

      // Native Draft -> Friendly
      const backToAuthored = nativeBundleToAuthoredShow(converted.bundleDraft!)
      expect(backToAuthored.note).toBe(tc.expectedNote)
    }
  })
  it("Gate C03: strictly rejects invalid or non-'show' targetKey for all supported scopes", () => {
    const invalidTargetCases = [
      {
        scope: "audio",
        targetKey: "NOT_THE_SHOW",
        property: "cues",
        valueJson: {},
      },
      {
        scope: "team",
        targetKey: "Q01",
        property: "config",
        valueJson: {
          enabled: false,
          teams: [],
          autoAssign: "roundRobin",
        },
      },
      {
        scope: "leaderboard",
        targetKey: "random-uuid-1234",
        property: "mode",
        valueJson: "manual",
      },
      {
        scope: "roster",
        targetKey: "",
        property: "config",
        valueJson: {
          phoneInviteOnly: false,
          participants: [],
        },
      },
    ]
    for (const invalidSetting of invalidTargetCases) {
      const showWithInvalidSetting = {
        format: "tada-show",
        version: 1,
        title: "Invalid Setting Show",
        cards: [
          {
            key: "Q01",
            kind: "quiz",
            questionType: "single",
            question: "Question text?",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
          },
        ],
        settings: [invalidSetting],
      }
      const parseResult = tadaShowV1Schema.safeParse(showWithInvalidSetting)
      expect(parseResult.success).toBe(false)

      if (!parseResult.success) {
        const issue = parseResult.error.issues.find(
          (i) => i.path.join(".") === "settings.0.targetKey",
        )
        expect(issue).toBeDefined()
        expect(issue!.message).toContain("unsupportedSettingTargetKey")
      }

      // Direct converter also rejects
      const convertResult = authoredShowToNativeBundleDraft(
        showWithInvalidSetting,
      )
      expect(convertResult.ok).toBe(false)
      const diag = convertResult.diagnostics.find(
        (d) => d.path.join(".") === "settings.0.targetKey",
      )
      expect(diag).toBeDefined()
    }
  })
  it("Gate C03: rejects duplicate settings definitions deterministically", () => {
    const showWithDuplicates = {
      format: "tada-show",
      version: 1,
      title: "Duplicate Setting Show",
      cards: [
        {
          key: "Q01",
          kind: "quiz",
          questionType: "single",
          question: "Question text?",
          answers: [
            {
              text: "A",
            },
            {
              text: "B",
            },
          ],
          correctAnswers: [1],
        },
      ],
      settings: [
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "mode",
          valueJson: "manual",
        },
        {
          scope: "leaderboard",
          targetKey: "show",
          property: "mode",
          valueJson: "everyN",
        },
      ],
    }
    const parseResult = tadaShowV1Schema.safeParse(showWithDuplicates)
    expect(parseResult.success).toBe(false)

    if (!parseResult.success) {
      const issue = parseResult.error.issues.find((i) =>
        i.message.includes("duplicateSetting:leaderboard.mode"),
      )
      expect(issue).toBeDefined()
      expect(issue!.path).toEqual(["settings", 1])
    }
  })

  // ── P1 Question Entrance Tests ───────────────────────────────────────────
  describe("P1: Per-Question Entrance Animations", () => {
    it("validates questionEntrance schema on quiz and survey cards", () => {
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Entrance Show",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            question: "Question 1",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "fade",
              durationMs: 600,
            },
          },
          {
            key: "S1",
            kind: "survey",
            question: "Survey 1",
            answers: [
              {
                text: "Yes",
              },
              {
                text: "No",
              },
            ],
            questionEntrance: {
              preset: "spotlight",
              durationMs: 1200,
            },
          },
        ],
        settings: [],
      }
      const parsed = tadaShowV1Schema.safeParse(show)
      expect(parsed.success).toBe(true)
    })
    it("rejects unknown entrance presets", () => {
      const invalidShow = {
        format: "tada-show",
        version: 1,
        title: "Invalid Entrance",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            question: "Question 1",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "3d-flip-explode",
              durationMs: 800,
            },
          },
        ],
        settings: [],
      }
      const parsed = tadaShowV1Schema.safeParse(invalidShow)
      expect(parsed.success).toBe(false)

      if (!parsed.success) {
        expect(
          parsed.error.issues.some((i) =>
            i.path.join(".").includes("cards.0.questionEntrance.preset"),
          ),
        ).toBe(true)
      }
    })
    it("rejects entrance duration out of bounds (< 250ms or > 2500ms)", () => {
      const tooShort = {
        format: "tada-show",
        version: 1,
        title: "Too Short",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            question: "Question 1",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "fade",
              durationMs: 100,
            },
          },
        ],
        settings: [],
      }
      expect(tadaShowV1Schema.safeParse(tooShort).success).toBe(false)
      const tooLong = {
        format: "tada-show",
        version: 1,
        title: "Too Long",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            question: "Question 1",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "fade",
              durationMs: 5000,
            },
          },
        ],
        settings: [],
      }
      expect(tadaShowV1Schema.safeParse(tooLong).success).toBe(false)
    })
    it("two-way conversion roundtrips questionEntrance for both quiz and survey", () => {
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Roundtrip Entrance",
        cards: [
          {
            key: "Q1",
            kind: "quiz",
            question: "Animated Quiz",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "slide-up",
              durationMs: 750,
            },
          },
          {
            key: "S1",
            kind: "survey",
            question: "Spotlight Survey",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            questionEntrance: {
              preset: "spotlight",
              durationMs: 1000,
            },
          },
          {
            key: "Q2",
            kind: "quiz",
            question: "Regular Quiz",
            answers: [
              {
                text: "A",
              },
              {
                text: "B",
              },
            ],
            correctAnswers: [1],
            questionEntrance: {
              preset: "none",
              durationMs: 800,
            },
          },
        ],
        settings: [],
      }
      const bundleDraft = authoredShowToNativeBundleDraft(show)
      expect(bundleDraft.ok).toBe(true)
      const bundle = bundleDraft.bundleDraft!
      const qIds = bundle.extras.questionIds
      expect(bundle.extras.perQuestion[qIds[0]].questionEntrance).toEqual({
        preset: "slide-up",
        durationMs: 750,
      })
      expect(bundle.extras.perQuestion[qIds[1]].questionEntrance).toEqual({
        preset: "spotlight",
        durationMs: 1000,
      })
      // Preset: 'none' is omitted or normalized in extras
      expect(
        bundle.extras.perQuestion[qIds[2]]?.questionEntrance,
      ).toBeUndefined()

      // Convert back to authored show
      const restored = nativeBundleToAuthoredShow(bundle)
      const restoredQ1 = restored.cards[0] as AuthoredQuizCard
      const restoredS1 = restored.cards[1] as AuthoredSurveyCard
      const restoredQ2 = restored.cards[2] as AuthoredQuizCard
      expect(restoredQ1.questionEntrance).toEqual({
        preset: "slide-up",
        durationMs: 750,
      })
      expect(restoredS1.questionEntrance).toEqual({
        preset: "spotlight",
        durationMs: 1000,
      })
      expect(restoredQ2.questionEntrance).toBeUndefined()
    })
  })
  describe("Gate 6: Cinematic Video & Multi-Layer Lottie Overlays Roundtrip", () => {
    it("roundtrips opening, closing, and cinema media scenes with overlayAnimations and mediaEndFallbackMs across .tada.json <-> native V2 bundle", () => {
      const sampleOverlays = [
        {
          id: "emblem-1",
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
          position: {
            x: 0.5,
            y: 0.22,
          },
          anchor: "center" as const,
          widthPct: 28,
          fit: "contain" as const,
          opacity: 0.95,
          rotationDeg: 0,
          fadeInMs: 150,
          fadeOutMs: 0,
        },
        {
          id: "frame-2",
          label: "Corner Frame",
          enabled: true,
          assetUrl: "/media/frame.lottie",
          order: 1,
          layer: "behindTitle" as const,
          timeBase: "video" as const,
          startMs: 0,
          durationMs: 8000,
          loop: true,
          speed: 1.25,
          finish: "hide" as const,
          position: {
            x: 0.5,
            y: 0.5,
          },
          anchor: "center" as const,
          widthPct: 82,
          fit: "contain" as const,
          opacity: 1,
          rotationDeg: 15,
          fadeInMs: 0,
          fadeOutMs: 200,
        },
      ]
      const show: TadaShowV1 = {
        format: "tada-show",
        version: 1,
        title: "Cinematic Multi-Overlay Roundtrip Show",
        baseGameMode: "quiz",
        cards: [
          {
            key: "OPEN_1",
            kind: "opening",
            title: "Grand Opening",
            subtitle: "Live Broadcast",
            mediaUrl: "/media/intro.mp4",
            mediaType: "video",
            stageLayout: "cinema",
            mediaFit: "cover",
            logoPosition: "center",
            textOverlay: true,
            endBehavior: "holdFrame",
            durationMs: 8000,
            mediaEndFallbackMs: 24000,
            advance: "onMediaEnd",
            overlayAnimations: sampleOverlays,
          },
          {
            key: "Q1",
            kind: "quiz",
            question: "Ready?",
            answers: [
              {
                text: "Yes",
              },
              {
                text: "Absolutely",
              },
            ],
            correctAnswers: [1],
          },
          {
            key: "MEDIA_CINEMA",
            kind: "media",
            title: "Halftime Show",
            subtitle: "Special Feature",
            mediaUrl: "/media/halftime.mp4",
            mediaType: "video",
            stageLayout: "cinema",
            mediaFit: "cover",
            textOverlay: true,
            endBehavior: "fadeToTitle",
            durationMs: 12000,
            mediaEndFallbackMs: 20000,
            advance: "onMediaEnd",
            overlayAnimations: [sampleOverlays[0]],
          },
          {
            key: "CLOSE_1",
            kind: "closing",
            title: "Goodnight!",
            subtitle: "See you next week",
            mediaUrl: "/media/outro.mp4",
            mediaType: "video",
            stageLayout: "cinema",
            durationMs: 8000,
            mediaEndFallbackMs: 18000,
            advance: "onMediaEnd",
            overlayAnimations: [sampleOverlays[1]],
          },
        ],
        settings: [],
      }
      const converted = authoredShowToNativeBundleDraft(show)
      expect(converted.ok).toBe(true)
      const bundle = converted.bundleDraft!
      const scenesList = Object.values(bundle.extras.scenes)
      const openScene = scenesList.find((s) => s.kind === "opening")!
      const mediaScene = scenesList.find((s) => s.kind === "media")!
      const closeScene = scenesList.find((s) => s.kind === "closing")!
      expect(openScene.mediaEndFallbackMs).toBe(24000)
      expect(openScene.overlayAnimations).toEqual(sampleOverlays)
      expect(mediaScene.stageLayout).toBe("cinema")
      expect(mediaScene.subtitle).toBe("Special Feature")
      expect(mediaScene.endBehavior).toBe("fadeToTitle")
      expect(mediaScene.mediaEndFallbackMs).toBe(20000)
      expect(mediaScene.overlayAnimations).toEqual([sampleOverlays[0]])
      expect(closeScene.mediaEndFallbackMs).toBe(18000)
      expect(closeScene.overlayAnimations).toEqual([sampleOverlays[1]])

      // Convert back to authored TadaShowV1
      const restored = nativeBundleToAuthoredShow(bundle)
      const restoredOpen = restored.cards[0] as AuthoredOpeningCard
      const restoredMedia = restored.cards[2] as AuthoredMediaCard
      const restoredClose = restored.cards[3] as AuthoredClosingCard
      expect(restoredOpen.mediaEndFallbackMs).toBe(24000)
      expect(restoredOpen.overlayAnimations).toEqual(sampleOverlays)
      expect(restoredMedia.stageLayout).toBe("cinema")
      expect(restoredMedia.subtitle).toBe("Special Feature")
      expect(restoredMedia.endBehavior).toBe("fadeToTitle")
      expect(restoredMedia.mediaEndFallbackMs).toBe(20000)
      expect(restoredMedia.overlayAnimations).toEqual([sampleOverlays[0]])
      expect(restoredClose.mediaEndFallbackMs).toBe(18000)
      expect(restoredClose.overlayAnimations).toEqual([sampleOverlays[1]])
    })
  })
})
