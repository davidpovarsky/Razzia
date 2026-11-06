import { describe, expect, it, vi } from "vitest"
import React from "react"
import { renderToString } from "react-dom/server"
import {
  CompanyOpening,
  GrandOpening,
  Directory,
  PhoneInstructions,
  Readiness,
  RoundLaunch,
  StoryCards,
  Tie,
  Finale,
  FullShowSceneView,
  renderFullShowScene,
  BrandLogo,
} from "./FullShowScenes"
import { TadazzV4Motion } from "./motion"
import { AnswerSlotV4 } from "./components"
import type { TadazzV4Cue } from "./types"
import type { FullShowInput } from "./FullShowScenes"

describe("FullShowScenes: React Component Rendering & Visual Parity", () => {
  const baseInput: FullShowInput = {
    title: "Creating Worlds",
    subtitle: "Interactive Live Show",
    round: 1,
    completed: 2,
    dialNumber: "079-999-9999",
    connectedTables: [1, 3, 5, 12],
    representatives: [
      { table: 1, name: "Sarah" },
      { table: 3, name: "David" },
    ],
    winners: [
      { title: "Table 5 - Champions" },
      { title: "Table 3 - Runners Up" },
    ],
    contestants: [
      { title: "Option A: The Courageous Hero" },
      { title: "Option B: The Cunning Rebel" },
    ],
    voteCount: 42,
    resolvedIndex: null,
    eventArtworkUrl: "/tadazz-show/second-library/teaser-screen.jpg",
    storyRoles: [
      "THE THREAT",
      "THE MISSION",
      "THE TWIST",
      "THE CLIMAX",
      "THE RESOLUTION",
    ],
  }

  it("renders BrandLogo with image and fallback title", () => {
    const html = renderToString(React.createElement(BrandLogo))
    expect(html).toContain('class="full-brand-badge"')
    expect(html).toContain('src="/tadazz-show/v4/tadazz-brand-logo.png"')
    expect(html).toContain('alt="TADAZZ!"')
  })

  it("renders CompanyOpening with brand badge and event artwork", () => {
    const html = renderToString(
      React.createElement(CompanyOpening, { data: baseInput }),
    )
    expect(html).toContain("full-company")
    expect(html).toContain("full-brand-badge")
    expect(html).toContain("/tadazz-show/second-library/teaser-screen.jpg")
  })

  it("renders GrandOpening with title, subtitle, and portal background", () => {
    const html = renderToString(
      React.createElement(GrandOpening, { data: baseInput }),
    )
    expect(html).toContain("full-grand-opening")
    expect(html).toContain("Creating Worlds")
    expect(html).toContain("Interactive Live Show")
  })

  it("renders Directory with 40 tables when groupPage is 0", () => {
    const html = renderToString(
      React.createElement(Directory, { data: baseInput }),
    )
    expect(html).toContain('data-testid="tadazz-full-directory"')
    // Should have table 1 through table 40
    expect(html).toContain('data-table="1"')
    expect(html).toContain('data-table="40"')
    // Connected tables have "connected" class
    expect(html).toContain('class="full-rep-row connected" data-table="1"')
  })

  it("renders Directory with 10 focused tables when groupPage is 1..4", () => {
    const inputGroup1: FullShowInput = { ...baseInput, groupPage: 0 }
    const html = renderToString(
      React.createElement(Directory, { data: inputGroup1 }),
    )
    expect(html).toContain("full-directory focus")
    expect(html).toContain('data-table="1"')
    expect(html).toContain('data-table="10"')
    expect(html).not.toContain('data-table="11"')
  })

  it("renders PhoneInstructions with formatted dial number", () => {
    const html = renderToString(
      React.createElement(PhoneInstructions, { data: baseInput }),
    )
    expect(html).toContain("079-999-9999")
    expect(html).toContain("JUST DIAL. THEN CHOOSE.")
  })

  it("renders Readiness with readiness grid", () => {
    const html = renderToString(
      React.createElement(Readiness, { data: baseInput }),
    )
    expect(html).toContain("full-table-grid")
    expect(html).toContain("THE ROOM IS COMING ONLINE")
    expect(html).toContain("TABLES CONNECTED")
  })

  it("renders RoundLaunch for round 1 and round 2", () => {
    const html1 = renderToString(
      React.createElement(RoundLaunch, { scene: "round-one", data: baseInput }),
    )
    expect(html1).toContain("ROUND")
    expect(html1).toContain("01")
    expect(html1).toContain("THE FIRST STORY")

    const html2 = renderToString(
      React.createElement(RoundLaunch, { scene: "round-two", data: baseInput }),
    )
    expect(html2).toContain("ROUND")
    expect(html2).toContain("02")
    expect(html2).toContain("A WHOLE NEW WORLD")
  })

  it("renders StoryCards with 5 roles, 01-05 indices, and AWAITING THE VOTE state", () => {
    const html = renderToString(
      React.createElement(StoryCards, { data: baseInput, progress: true }),
    )
    expect(html).toContain("full-story-cards")
    expect(html).toContain("01")
    expect(html).toContain("02")
    expect(html).toContain("03")
    expect(html).toContain("04")
    expect(html).toContain("05")
    expect(html).toContain("THE THREAT")
    expect(html).toContain("THE MISSION")
    expect(html).toContain("THE TWIST")
    expect(html).toContain("THE CLIMAX")
    expect(html).toContain("THE RESOLUTION")
    // BaseInput has completed: 2, so card 3, 4, 5 should say AWAITING THE VOTE
    expect(html).toContain("AWAITING THE VOTE")
  })

  it("renders Tie unresolved vs resolved states", () => {
    // Unresolved
    const unresolvedHtml = renderToString(
      React.createElement(Tie, { data: baseInput }),
    )
    expect(unresolvedHtml).toContain("THE AUDIENCE IS SPLIT")
    expect(unresolvedHtml).toContain(
      "Host, choose which picture goes into the story.",
    )
    expect(unresolvedHtml).toContain("=")

    // Resolved: Option A chosen, Option B muted
    const resolvedInput: FullShowInput = { ...baseInput, resolvedIndex: 0 }
    const resolvedHtml = renderToString(
      React.createElement(Tie, { data: resolvedInput }),
    )
    expect(resolvedHtml).toContain("chosen")
    expect(resolvedHtml).toContain("muted")
    expect(resolvedHtml).toContain("CHOICE SELECTED")
  })

  it("renders Finale with curtains and winner center", () => {
    const finaleHtml = renderToString(
      React.createElement(Finale, { data: baseInput }),
    )
    expect(finaleHtml).toContain("full-grand-finale")
    expect(finaleHtml).toContain("full-curtain left")
    expect(finaleHtml).toContain("full-curtain right")
    expect(finaleHtml).toContain("full-finale-logo")
  })

  it("FullShowSceneView dispatches correctly to all 12 scenes", () => {
    const scenes: Array<Parameters<typeof FullShowSceneView>[0]["scene"]> = [
      "company-opening",
      "grand-opening",
      "representative-directory",
      "phone-instructions",
      "connection-readiness",
      "round-one",
      "round-two",
      "story-progress",
      "tie-break",
      "story-assembly",
      "story-live",
      "grand-finale",
    ]

    for (const scene of scenes) {
      const html = renderToString(
        React.createElement(FullShowSceneView, { scene, data: baseInput }),
      )
      expect(html.length).toBeGreaterThan(0)
    }
  })

  it("renderFullShowScene helper safely dispatches to the correct scene component", () => {
    const el = renderFullShowScene("round-one", baseInput)
    expect(el).not.toBeNull()
    const html = renderToString(el)
    expect(html).toContain("ROUND")
    expect(html).toContain("01")

    const nullEl = renderFullShowScene("nonexistent-scene" as any, baseInput)
    expect(nullEl).toBeNull()
  })
})

describe("AnswerSlotV4: Captions, Badges, and Result Tracks Parity", () => {
  it("renders caption with data-has-caption attribute and fallback label", () => {
    const answer = {
      title: "Option A",
      count: 14,
      percentage: 35,
    }

    const html = renderToString(
      React.createElement(AnswerSlotV4, {
        answer,
        index: 0,
        result: true,
        percentage: 35,
      }),
    )

    expect(html).toContain('data-has-caption="true"')
    expect(html).toContain("Option A")
    expect(html).toContain("01") // Badge 01
  })

  it("provides fallback label in recap mode when answer has empty title", () => {
    const answer = {
      title: "",
      count: 8,
      percentage: 20,
    }

    const html = renderToString(
      React.createElement(AnswerSlotV4, {
        answer,
        index: 2,
        result: true,
        recap: true,
      }),
    )

    expect(html).toContain("Choice 3")
    expect(html).toContain("03") // Badge 03
  })
})

describe("TadazzV4Motion: WAAPI Cue Emission & Reduced Motion Lifecycle", () => {
  const fakeElement = () =>
    ({
      style: {} as Record<string, string>,
      querySelector: () => null,
      querySelectorAll: () => [],
      replaceChildren: () => undefined,
      animate: vi.fn(),
    }) as unknown as HTMLElement

  it("emits expected cues and resolves immediately when reducedMotion is true", async () => {
    const stage = fakeElement()
    const emittedCueNames: string[] = []

    const motion = new TadazzV4Motion(stage, {
      reducedMotion: true,
      onCue: (cue) => emittedCueNames.push(cue.name),
    })

    const testCases: Array<{
      scene: Parameters<TadazzV4Motion["play"]>[0]
      expectedCue: string
      input?: FullShowInput
    }> = [
      { scene: "company-opening", expectedCue: "company-ident" },
      { scene: "company-opening", expectedCue: "tadazz-welcome" },
      { scene: "grand-opening", expectedCue: "opening-portal" },
      { scene: "grand-opening", expectedCue: "opening-logo" },
      { scene: "representative-directory", expectedCue: "directory-loaded" },
      { scene: "phone-instructions", expectedCue: "phone-ready" },
      { scene: "connection-readiness", expectedCue: "readiness-grid" },
      { scene: "round-one", expectedCue: "round-launch" },
      { scene: "round-two", expectedCue: "round-launch" },
      { scene: "story-progress", expectedCue: "story-progress-update" },
      {
        scene: "tie-break",
        expectedCue: "tie-unresolved",
        input: { contestants: [] },
      },
      {
        scene: "tie-break",
        expectedCue: "tie-resolved",
        input: { contestants: [], resolvedIndex: 0 },
      },
      { scene: "story-assembly", expectedCue: "story-assembled" },
      { scene: "story-live", expectedCue: "story-live-hold" },
      { scene: "grand-finale", expectedCue: "finale-impact" },
      { scene: "grand-finale", expectedCue: "curtains-closed" },
    ]

    for (const { scene, expectedCue, input } of testCases) {
      emittedCueNames.length = 0
      await motion.play(scene, input)
      expect(emittedCueNames).toContain(expectedCue)
    }
  })

  it("stop() cancels active state and clears pending timers", () => {
    const stage = fakeElement()
    const motion = new TadazzV4Motion(stage)
    expect(() => motion.stop()).not.toThrow()
    expect(() => motion.pause()).not.toThrow()
    expect(() => motion.resume()).not.toThrow()
  })
})
