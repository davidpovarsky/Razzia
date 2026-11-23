// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import type {
  AuthoredQuizCard,
  AuthoredOpeningCard,
} from "./show-authoring-schema"
import { describe, expect, it } from "vitest"
import {
  authoredShowToNativeBundleDraft,
  clampAnimationDurationMs,
  clampAnimationStaggerMs,
  collectQuizMediaReferences,
  detachMediaFromShowData,
  evaluateCardStageFitWarnings,
  exportTadaShowWorkbook,
  findMediaReferencesAcrossShows,
  isQuestionCardBlankForConversion,
  nativeBundleToAuthoredShow,
  parseTadaShowWorkbook,
  preflightShowImport,
  resolveCardStageAnimations,
  resolveEffectiveAudioCue,
  resolveEffectiveCardBackground,
  resolveQuestionDecoration,
  validateBundleMedia,
} from "./index"
describe("Gate B: Card Appearance, Audio, Motion, Media References & Roundtrip Contracts", () => {
  it("resolves effective card background with fallback to game branding background", () => {
    expect(
      resolveEffectiveCardBackground(undefined, "/assets/default-bg.svg"),
    ).toEqual({
      mode: "game",
      url: "/assets/default-bg.svg",
      fit: "cover",
      position: "center",
      overlayOpacity: 0,
    })
    expect(
      resolveEffectiveCardBackground(
        {
          url: "/media/card-bg.png",
          fit: "contain",
          position: "top",
          overlayOpacity: 0.5,
        },
        "/assets/default-bg.svg",
      ),
    ).toEqual({
      mode: "card",
      url: "/media/card-bg.png",
      fit: "contain",
      position: "top",
      overlayOpacity: 0.5,
    })

    // Unsafe URLs are rejected and fall back to game branding
    expect(
      resolveEffectiveCardBackground(
        {
          url: "javascript:alert(1)",
          fit: "cover",
          position: "center",
          overlayOpacity: 0.2,
        },
        "/assets/default-bg.svg",
      ).mode,
    ).toBe("game")
  })
  it("resolves effective audio cues with precedence: card override > global show audio > built-in default", () => {
    // 1. Default built-in when neither card nor global is set
    expect(
      resolveEffectiveAudioCue({
        cueId: "answersMusic",
        defaultUrl: "/sounds/answersMusic.mp3",
      }),
    ).toEqual({
      shouldPlay: true,
      mutedByOverride: false,
      managedByExtension: false,
      cueId: "answersMusic",
      url: "/sounds/answersMusic.mp3",
      volume: 0.8,
      loop: true,
    })

    // 2. Global show audio overrides built-in default when card inherits
    expect(
      resolveEffectiveAudioCue({
        cueId: "answersMusic",
        defaultUrl: "/sounds/answersMusic.mp3",
        globalAudio: {
          cues: {
            answersMusic: {
              enabled: true,
              source: "media",
              url: "/media/global-loop.mp3",
              volume: 0.5,
              loop: true,
            },
          },
        },
      }),
    ).toEqual({
      shouldPlay: true,
      mutedByOverride: false,
      managedByExtension: true,
      cueId: "answersMusic",
      url: "/media/global-loop.mp3",
      volume: 0.5,
      loop: true,
    })

    // 3. Card custom override takes precedence over global show audio
    expect(
      resolveEffectiveAudioCue({
        cueId: "answersMusic",
        defaultUrl: "/sounds/answersMusic.mp3",
        cardAudioCues: {
          answersMusic: {
            mode: "custom",
            url: "/media/card-loop.mp3",
            volume: 0.9,
            loop: false,
          },
        },
        globalAudio: {
          cues: {
            answersMusic: {
              enabled: true,
              source: "media",
              url: "/media/global-loop.mp3",
              volume: 0.5,
              loop: true,
            },
          },
        },
      }),
    ).toEqual({
      shouldPlay: true,
      mutedByOverride: false,
      managedByExtension: true,
      cueId: "answersMusic",
      url: "/media/card-loop.mp3",
      volume: 0.9,
      loop: false,
    })

    // 4. Card mute suppresses both global and built-in default
    expect(
      resolveEffectiveAudioCue({
        cueId: "answersMusic",
        defaultUrl: "/sounds/answersMusic.mp3",
        cardAudioCues: {
          answersMusic: {
            mode: "mute",
            volume: 0.8,
            loop: false,
          },
        },
        globalAudio: {
          cues: {
            answersMusic: {
              enabled: true,
              source: "media",
              url: "/media/global-loop.mp3",
              volume: 0.5,
              loop: true,
            },
          },
        },
      }),
    ).toEqual({
      shouldPlay: false,
      mutedByOverride: true,
      managedByExtension: true,
      cueId: "answersMusic",
      volume: 0,
      loop: false,
    })

    // 5. Competing foreground video/audio suppresses background music loop
    expect(
      resolveEffectiveAudioCue({
        cueId: "answersMusic",
        defaultUrl: "/sounds/answersMusic.mp3",
        hasCompetingMediaAudio: true,
      }).shouldPlay,
    ).toBe(false)
  })
  it("resolves 4 independent stage animation slots and maintains legacy questionEntrance compatibility", () => {
    expect(clampAnimationDurationMs(50)).toBe(250)
    expect(clampAnimationDurationMs(5000)).toBe(2500)
    expect(clampAnimationStaggerMs(999)).toBe(300)
    const resolvedFromLegacy = resolveCardStageAnimations({
      questionEntrance: {
        preset: "spotlight",
        durationMs: 900,
      },
    })
    expect(resolvedFromLegacy.questionEntrance).toEqual({
      preset: "spotlight",
      timing: "simultaneous",
      staggerMs: 90,
      durationMs: 900,
    })
    expect(resolvedFromLegacy.answerEntrance.preset).toBe("none")
    expect(resolvedFromLegacy.answerBadgeEntrance.preset).toBe("none")
    expect(resolvedFromLegacy.resultsRevealEntrance.preset).toBe("none")
    const resolvedIndependent = resolveCardStageAnimations({
      stageAnimations: {
        questionEntrance: {
          preset: "curtain",
          timing: "simultaneous",
          staggerMs: 0,
          durationMs: 700,
        },
        answerEntrance: {
          preset: "zoom-soft",
          timing: "sequential",
          staggerMs: 120,
          durationMs: 600,
        },
        answerBadgeEntrance: {
          preset: "fade",
          timing: "sequential",
          staggerMs: 60,
          durationMs: 400,
        },
        resultsRevealEntrance: {
          preset: "spotlight",
          timing: "sequential",
          staggerMs: 100,
          durationMs: 800,
        },
      },
    })
    expect(resolvedIndependent.questionEntrance.preset).toBe("curtain")
    expect(resolvedIndependent.answerEntrance.preset).toBe("zoom-soft")
    expect(resolvedIndependent.answerEntrance.timing).toBe("sequential")
    expect(resolvedIndependent.answerBadgeEntrance.preset).toBe("fade")
    expect(resolvedIndependent.resultsRevealEntrance.preset).toBe("spotlight")
  })
  it("roundtrips card background, audioCues, scene audio, stageAnimations, and mediaCatalog across Bundle, TadaShowV1 JSON, and XLSX", () => {
    const initialAuthored = {
      format: "tada-show" as const,
      version: 1 as const,
      title: "Appearance & Audio Roundtrip Show",
      settings: [
        {
          scope: "audio" as const,
          targetKey: "show",
          property: "cues",
          valueJson: {
            showQuestion: {
              enabled: true,
              source: "media",
              url: "/media/global-intro.mp3",
              volume: 0.75,
              loop: false,
            },
          },
        },
        {
          scope: "media" as const,
          targetKey: "show",
          property: "catalog",
          valueJson: [
            {
              name: "shared-bg.png",
              url: "/media/shared-bg.png",
              type: "image",
              addedAt: 1730462400000,
            },
          ],
        },
      ],
      cards: [
        {
          key: "OPEN1",
          kind: "opening" as const,
          title: "Welcome Tonight",
          subtitle: "Dial in now",
          mediaUrl: "/media/logo-hero.png",
          advance: "manual" as const,
          background: {
            url: "/media/shared-bg.png",
            fit: "cover" as const,
            position: "center" as const,
            overlayOpacity: 0.35,
          },
          audio: {
            mode: "custom" as const,
            url: "/media/opening-fanfare.mp3",
            volume: 0.85,
            loop: true,
          },
          stageAnimations: {
            questionEntrance: {
              preset: "spotlight" as const,
              timing: "simultaneous" as const,
              staggerMs: 0,
              durationMs: 750,
            },
          },
        },
        {
          key: "Q1",
          kind: "quiz" as const,
          questionType: "single" as const,
          question: "Which planet is closest to the Sun?",
          cooldownSeconds: 4,
          timeSeconds: 20,
          correctAnswers: [1],
          background: {
            url: "/media/space-bg.png",
            fit: "contain" as const,
            position: "top" as const,
            overlayOpacity: 0.4,
          },
          audioCues: {
            showQuestion: {
              mode: "custom" as const,
              url: "/media/q1-stinger.mp3",
              volume: 0.9,
              loop: false,
            },
            answersMusic: {
              mode: "mute" as const,
              volume: 0,
              loop: false,
            },
            revealResults: {
              mode: "inherit" as const,
              volume: 0.8,
              loop: false,
            },
          },
          stageAnimations: {
            questionEntrance: {
              preset: "curtain" as const,
              timing: "simultaneous" as const,
              staggerMs: 80,
              durationMs: 650,
            },
            answerEntrance: {
              preset: "zoom-soft" as const,
              timing: "sequential" as const,
              staggerMs: 110,
              durationMs: 500,
            },
            answerBadgeEntrance: {
              preset: "slide-side" as const,
              timing: "sequential" as const,
              staggerMs: 70,
              durationMs: 420,
            },
            resultsRevealEntrance: {
              preset: "spotlight" as const,
              timing: "simultaneous" as const,
              staggerMs: 90,
              durationMs: 800,
            },
          },
          answers: [
            {
              text: "Mercury",
              display: "both" as const,
              imageUrl: "/media/mercury.png",
              alt: "Planet Mercury",
            },
            {
              text: "Venus",
              display: "text" as const,
            },
          ],
        },
      ],
    }

    // 1. Authored -> Native Bundle Draft
    const draftRes = authoredShowToNativeBundleDraft(initialAuthored)
    expect(draftRes.ok).toBe(true)
    const bundle = {
      bundleVersion: 1 as const,
      quizz: draftRes.bundleDraft!.quizz,
      extras: draftRes.bundleDraft!.extras,
    }
    expect(validateBundleMedia(bundle).ok).toBe(true)
    expect(bundle.extras.mediaCatalog).toHaveLength(1)
    const { 0: sceneEntry } = Object.values(bundle.extras.scenes ?? {})
    const { 0: pqEntry } = Object.values(bundle.extras.perQuestion ?? {})
    expect(sceneEntry?.background?.url).toBe("/media/shared-bg.png")
    expect(sceneEntry?.audio?.url).toBe("/media/opening-fanfare.mp3")
    expect(pqEntry?.background?.url).toBe("/media/space-bg.png")
    expect(pqEntry?.audioCues?.answersMusic?.mode).toBe("mute")
    expect(pqEntry?.stageAnimations?.answerEntrance?.preset).toBe("zoom-soft")

    // 2. Native Bundle -> Authored -> XLSX -> Parse XLSX -> Native Bundle
    const exportedAuthored = nativeBundleToAuthoredShow(bundle)
    const xlsxBytes = exportTadaShowWorkbook(exportedAuthored)
    const parsedFromXlsx = parseTadaShowWorkbook(xlsxBytes)
    expect(parsedFromXlsx.cards[0].background).toEqual(
      initialAuthored.cards[0].background,
    )
    expect((parsedFromXlsx.cards[0] as AuthoredOpeningCard).audio).toEqual(
      initialAuthored.cards[0].audio,
    )
    expect(parsedFromXlsx.cards[1].background).toEqual(
      initialAuthored.cards[1].background,
    )
    expect((parsedFromXlsx.cards[1] as AuthoredQuizCard).audioCues).toEqual(
      initialAuthored.cards[1].audioCues,
    )
    expect(parsedFromXlsx.cards[1].stageAnimations).toEqual(
      initialAuthored.cards[1].stageAnimations,
    )

    // 3. Preflight on XLSX
    const preflightRes = preflightShowImport(xlsxBytes, "roundtrip.xlsx")
    expect(preflightRes.ok).toBe(true)
    expect(preflightRes.summary?.answerImageCount).toBe(1)
  })
  it("scans media references across shows and detaches cleanly without breaking other fields", () => {
    const showA = {
      id: "show-a",
      quizz: {
        id: "show-a",
        subject: "Show A",
        questions: [
          {
            id: "q1",
            question: "Q1",
            media: {
              type: "image",
              url: "/media/shared.png",
            },
            answers: ["A", "B"],
            solutions: [0],
            cooldown: 5,
            time: 15,
          },
        ],
      },
      extras: {
        schemaVersion: 2 as const,
        perQuestion: {
          q1: {
            background: {
              url: "/media/card-bg.png",
              fit: "cover" as const,
              position: "center" as const,
              overlayOpacity: 0.25,
            },
            answerVisuals: [
              {
                answerIndex: 0,
                display: "both" as const,
                url: "/media/shared.png",
                alt: "Answer A",
              },
            ],
          },
        },
      },
    }
    const showB = {
      id: "show-b",
      quizz: {
        id: "show-b",
        subject: "Show B",
        questions: [],
      },
      extras: {
        schemaVersion: 2 as const,
        scenes: {
          s1: {
            id: "s1",
            kind: "opening" as const,
            title: "Welcome",
            advance: "manual" as const,
            durationMs: 5000,
            background: {
              url: "/media/shared.png",
              fit: "cover" as const,
              position: "center" as const,
              overlayOpacity: 0.3,
            },
          },
        },
      },
    }
    const refsA = collectQuizMediaReferences(showA)
    expect(refsA).toHaveLength(3)
    const crossRefs = findMediaReferencesAcrossShows("shared.png", [
      showA,
      showB,
    ])
    // ShowA question.media, showA answerVisuals[0], showB scene.background
    expect(crossRefs).toHaveLength(3)
    const detached = detachMediaFromShowData(
      "shared.png",
      showA.quizz,
      showA.extras as unknown as Parameters<typeof detachMediaFromShowData>[2],
    )
    expect(detached.modified).toBe(true)
    expect(
      (
        detached.quizz.questions as Array<{
          media?: unknown
        }>
      )[0].media,
    ).toBeUndefined()
    expect(detached.extras?.perQuestion?.q1.answerVisuals).toHaveLength(0)
    expect(detached.extras?.perQuestion?.q1.background?.url).toBe(
      "/media/card-bg.png",
    )
  })
  it("detects blank default questions vs authored questions for smart scene conversion", () => {
    // Brand-new blank question
    expect(
      isQuestionCardBlankForConversion(
        {
          question: "",
          answers: ["", ""],
        },
        undefined,
      ),
    ).toBe(true)

    // Populated question text
    expect(
      isQuestionCardBlankForConversion(
        {
          question: "Who invented the telephone?",
          answers: ["", ""],
        },
        undefined,
      ),
    ).toBe(false)

    // Question with custom background or answer image
    expect(
      isQuestionCardBlankForConversion(
        {
          question: "",
          answers: ["", ""],
        },
        {
          background: {
            url: "/media/custom-bg.png",
          },
        },
      ),
    ).toBe(false)
  })
  it("evaluates non-blocking stage-fit warnings when text exceeds recommended limits", () => {
    const warnings = evaluateCardStageFitWarnings({
      question: "X".repeat(160),
      answers: ["Short", "Y".repeat(90)],
    })
    expect(warnings.map((w) => w.field)).toEqual(["question", "answer"])
  })
  it("inherits global stage animations when card slot is undefined and respects explicit none and new motion presets", () => {
    const globalStageAnimations = {
      questionEntrance: {
        preset: "pop-bounce" as const,
        timing: "simultaneous" as const,
        staggerMs: 0,
        durationMs: 700,
      },
      answerEntrance: {
        preset: "cascade" as const,
        timing: "sequential" as const,
        staggerMs: 110,
        durationMs: 650,
      },
      answerBadgeEntrance: {
        preset: "wobble-settle" as const,
        timing: "sequential" as const,
        staggerMs: 80,
        durationMs: 500,
      },
      resultsRevealEntrance: {
        preset: "wipe-ripple" as const,
        timing: "simultaneous" as const,
        staggerMs: 90,
        durationMs: 850,
      },
    }
    const resolved = resolveCardStageAnimations({
      globalStageAnimations,
      stageAnimations: {
        // QuestionEntrance is omitted -> inherits global "pop-bounce"
        answerEntrance: {
          // Explicit none overrides global "cascade"
          preset: "none",
          timing: "simultaneous",
          staggerMs: 90,
          durationMs: 600,
        },
        answerBadgeEntrance: {
          // Custom card override "fan-flip"
          preset: "fan-flip",
          timing: "sequential",
          staggerMs: 100,
          durationMs: 550,
        },
      },
    })
    expect(resolved.questionEntrance.preset).toBe("pop-bounce")
    expect(resolved.questionEntrance.durationMs).toBe(700)
    expect(resolved.answerEntrance.preset).toBe("none")
    expect(resolved.answerBadgeEntrance.preset).toBe("fan-flip")
    expect(resolved.resultsRevealEntrance.preset).toBe("wipe-ripple")
  })
  it("resolves decorative question underline with global fallback and explicit none override", () => {
    const globalDecoration = {
      preset: "shimmer-line" as const,
      color: "#ff9900",
    }

    // Inherit global
    expect(
      resolveQuestionDecoration({
        globalDecoration,
      }).preset,
    ).toBe("shimmer-line")

    // Explicit card none overrides global
    expect(
      resolveQuestionDecoration({
        cardDecoration: {
          preset: "none",
        },
        globalDecoration,
      }).preset,
    ).toBe("none")

    // Custom Lottie underline
    expect(
      resolveQuestionDecoration({
        cardDecoration: {
          preset: "lottie",
          lottieUrl: "/media/underline.json",
        },
        globalDecoration,
      }),
    ).toEqual({
      enabled: true,
      preset: "lottie",
      lottieUrl: "/media/underline.json",
    })
  })
  it("roundtrips cinematic opening, audio media scene, answerRecap, Lottie, global stage defaults, and questionDecoration across JSON, Native, and XLSX", () => {
    const show = {
      format: "tada-show" as const,
      version: 1 as const,
      title: "Studio Wave 2 Complete Roundtrip",
      defaults: {
        newQuestionMode: "quiz" as const,
        leaderboardPolicy: "cardOnly" as const,
        advanceMode: "auto" as const,
        stageAnimations: {
          questionEntrance: {
            preset: "pop-bounce" as const,
            timing: "simultaneous" as const,
            staggerMs: 0,
            durationMs: 700,
          },
          answerEntrance: {
            preset: "cascade" as const,
            timing: "sequential" as const,
            staggerMs: 100,
            durationMs: 600,
          },
        },
        questionDecoration: {
          enabled: true,
          preset: "pulse-bar" as const,
          color: "#38bdf8",
        },
      },
      cards: [
        {
          key: "OPEN_CINEMA",
          kind: "opening" as const,
          title: "Grand Opening",
          subtitle: "Live Tonight",
          mediaUrl: "/media/intro.mp4",
          mediaType: "video" as const,
          stageLayout: "cinema" as const,
          mediaFit: "cover" as const,
          logoPosition: "top" as const,
          textOverlay: true,
          endBehavior: "advanceNext" as const,
          volume: 0.9,
          loop: false,
          muted: false,
          showControls: false,
          lottieUrl: "/media/intro-badge.json",
          lottieFit: "contain" as const,
          lottieLoop: true,
          lottieSpeed: 1.25,
          durationMs: 15000,
          advance: "onMediaEnd" as const,
        },
        {
          key: "Q1",
          kind: "quiz" as const,
          questionType: "single" as const,
          question: "First Question?",
          answers: [
            {
              text: "Alpha",
            },
            {
              text: "Beta",
            },
          ],
          correctAnswers: [1],
          questionDecoration: {
            enabled: true,
            preset: "glow-sweep" as const,
            color: "#fbbf24",
          },
          stageAnimations: {
            answerEntrance: {
              preset: "fan-flip" as const,
              timing: "sequential" as const,
              staggerMs: 120,
              durationMs: 550,
            },
          },
        },
        {
          key: "AUDIO_INTERLUDE",
          kind: "media" as const,
          mediaUrl: "/media/jingle.mp3",
          mediaType: "audio" as const,
          title: "Mystery Sound",
          volume: 0.85,
          loop: false,
          muted: false,
          showControls: true,
          mediaFit: "contain" as const,
          durationMs: 12000,
          advance: "onMediaEnd" as const,
        },
        {
          key: "ANIM_LOTTIE",
          kind: "animation" as const,
          preset: "spotlight" as const,
          title: "Dramatic Reveal",
          lottieUrl: "/media/custom-anim.json",
          lottieFit: "contain" as const,
          lottieLoop: false,
          lottieSpeed: 1,
          durationMs: 4000,
          advance: "onMediaEnd" as const,
        },
        {
          key: "S1",
          kind: "survey" as const,
          questionType: "single" as const,
          question: "Audience Poll?",
          answers: [
            {
              text: "Option 1",
            },
            {
              text: "Option 2",
            },
          ],
        },
        {
          key: "RECAP_1",
          kind: "answerRecap" as const,
          title: "Answers So Far",
          startQuestionKey: "Q1",
          mode: "mostSelected" as const,
          maxItemsPerPage: 4,
          showCounts: true,
          showPercentages: true,
          durationMs: 9000,
          advance: "manual" as const,
        },
      ],
    }
    const draftRes = authoredShowToNativeBundleDraft(show)
    expect(draftRes.ok).toBe(true)
    const bundle = {
      bundleVersion: 1 as const,
      quizz: draftRes.bundleDraft!.quizz,
      extras: draftRes.bundleDraft!.extras,
    }
    expect(validateBundleMedia(bundle).ok).toBe(true)
    const exportedJson = nativeBundleToAuthoredShow(bundle)
    const xlsxBytes = exportTadaShowWorkbook(exportedJson)
    const parsedFromXlsx = parseTadaShowWorkbook(xlsxBytes)
    expect(parsedFromXlsx.defaults?.stageAnimations).toEqual(
      show.defaults.stageAnimations,
    )
    expect(parsedFromXlsx.defaults?.questionDecoration).toEqual(
      show.defaults.questionDecoration,
    )
    const openCard = parsedFromXlsx.cards.find((c) => c.kind === "opening")!
    expect(openCard.mediaType).toBe("video")
    expect(openCard.stageLayout).toBe("cinema")
    expect(openCard.logoPosition).toBe("top")
    expect(openCard.textOverlay).toBe(true)
    expect(openCard.endBehavior).toBe("advanceNext")
    expect(openCard.advance).toBe("onMediaEnd")
    expect(openCard.lottieUrl).toBe("/media/intro-badge.json")
    const q1Card = parsedFromXlsx.cards.find((c) => c.kind === "quiz")!
    expect(q1Card.questionDecoration).toEqual({
      enabled: true,
      preset: "glow-sweep",
      color: "#fbbf24",
    })
    expect(q1Card.stageAnimations?.answerEntrance?.preset).toBe("fan-flip")
    const mediaCard = parsedFromXlsx.cards.find((c) => c.kind === "media")!
    expect(mediaCard.mediaType).toBe("audio")
    expect(mediaCard.volume).toBe(0.85)
    expect(mediaCard.showControls).toBe(true)
    expect(mediaCard.advance).toBe("onMediaEnd")
    const recapCard = parsedFromXlsx.cards.find(
      (c) => c.kind === "answerRecap",
    )!
    expect(recapCard.kind).toBe("answerRecap")
    expect(recapCard.startQuestionKey).toBe("Q01")
    expect(recapCard.mode).toBe("mostSelected")
    expect(recapCard.maxItemsPerPage).toBe(4)
  })
})
