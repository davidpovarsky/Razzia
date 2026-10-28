import { describe, expect, it } from "vitest"
import {
  authoredShowToNativeBundleDraft,
  nativeBundleToAuthoredShow,
} from "./show-authoring-convert"
import {
  isTadaShowV1,
  tadaShowV1Schema,
  type TadaShowV1,
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
          { text: "3", display: "text" },
          { text: "4", display: "text" },
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
        { ...minimalValidShow.cards[0], question: "Another question" },
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
          correctAnswers: [5], // only 2 answers!
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
              alt: "", // empty alt
            },
            { text: "London", display: "text" },
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
            { text: "Safe", display: "text" },
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
            { text: "Paris", display: "both", imageUrl: "https://example.com/paris.png", alt: "Eiffel tower" },
            { text: "London", display: "text" },
            { text: "Berlin", display: "text" },
          ],
          correctAnswers: [1], // 1-based answer 1 -> 0-based solution 0
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
            { text: "Great" },
            { text: "Good" },
            { text: "Okay" },
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
    const q1 = quizz.questions[0]
    expect(q1.question).toBe("Capital of France?")
    expect(q1.playMode).toBe("quiz")
    expect(q1.solutions).toEqual([0]) // 1-based answer 1 converted to 0-based solution 0

    // Check Question 2 (Survey)
    const q2 = quizz.questions[1]
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
    const q1Id = extras.questionIds[0]
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
    const backToAuthored = nativeBundleToAuthoredShow({ quizz, extras })
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

    const roundtripQ1 = backToAuthored.cards[2] as any
    expect(roundtripQ1.correctAnswers).toEqual([1])
    expect(roundtripQ1.answers[0].display).toBe("both")
    expect(roundtripQ1.answers[0].imageUrl).toBe("https://example.com/paris.png")
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
          answers: [{ text: "A" }, { text: "B" }],
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
    expect((audioSetting?.valueJson as any)?.start?.volume).toBe(0.37)
    expect((audioSetting?.valueJson as any)?.start?.url).toBe(
      "https://example.com/start.mp3",
    )
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
          answers: [{ text: "A" }, { text: "B" }],
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
              { id: "t1", name: "Red Team", color: "#FF0000" },
              { id: "t2", name: "Blue Team", color: "#0000FF" },
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
    expect((teamSetting?.valueJson as any)?.enabled).toBe(false)
    expect((teamSetting?.valueJson as any)?.teams).toHaveLength(2)
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
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
        },
        {
          key: "Q02",
          kind: "quiz",
          questionType: "single",
          question: "Question 2?",
          answers: [{ text: "A" }, { text: "B" }],
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
          answers: [{ text: "A" }, { text: "B" }],
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
          answers: [{ text: "A" }, { text: "B" }],
          correctAnswers: [1],
          extraJson: { untypedPayload: 123 },
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
            { id: "p1", name: "Alice Secret", phone: "+1234567890" },
          ],
        },
      },
    }

    // Default export: shareable mode -> roster PII stripped
    const shareableShow = nativeBundleToAuthoredShow(bundleWithRoster as any)
    const shareableRosterSetting = shareableShow.settings?.find(
      (s) => s.scope === "roster" && s.property === "config",
    )
    expect(shareableRosterSetting).toBeDefined()
    expect((shareableRosterSetting?.valueJson as any)?.participants).toEqual([])

    // Explicit opt-in export: private mode -> includes participants
    const privateShow = nativeBundleToAuthoredShow(bundleWithRoster as any, {
      includePrivateRoster: true,
    })
    const privateRosterSetting = privateShow.settings?.find(
      (s) => s.scope === "roster" && s.property === "config",
    )
    expect((privateRosterSetting?.valueJson as any)?.participants).toHaveLength(
      1,
    )
    expect((privateRosterSetting?.valueJson as any)?.participants[0].name).toBe(
      "Alice Secret",
    )
  })
})
