import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { AudioExtras } from "../core/quiz-extras"
import { AudioCuePlayer, resolveAudioCue, TADAZZ_SFX_BY_CUE } from "./audio-cue-player"
import { resolveTadazzAudioPolicy } from "./tadazz-audio-policy"

describe("P0 Tadazz soundtrack policy", () => {
  it("loops every stage soundtrack but preserves the twelve-second non-looping intro", () => {
    const slots = [
      "openingIntro", "lobby", "roundStart", "question", "results",
      "leaderboard", "recap", "finale",
    ] as const
    const extras = {
      cues: {},
      soundtrack: Object.fromEntries(
        slots.map((slot) => [slot, {
          mode: "media",
          url: `/media/${slot}.mp3`,
          volume: 0.35,
          loop: false,
          fadeMs: 0,
          startOffsetSeconds: 0,
          maxDurationMs: 4500,
        }]),
      ),
    } as unknown as AudioExtras
    for (const slot of ["lobby", "roundStart", "question", "results", "leaderboard", "recap", "finale"] as const) {
      const html = renderToString(
        createElement(AudioCuePlayer, { audioExtras: extras, soundtrackSlot: slot, gameId: "tzila", autoPlay: false }),
      )
      expect(html, slot).toContain('data-audio-loop="true"')
    }
    const opening = renderToString(
      createElement(AudioCuePlayer, { audioExtras: extras, soundtrackSlot: "openingIntro", gameId: "tzila", autoPlay: false }),
    )
    expect(opening).toContain('data-audio-loop="false"')
  })
  it("keeps one continuity group across results and interim results", () => {
    const results = resolveTadazzAudioPolicy({ statusName: "SHOW_RESPONSES" })
    const interim = resolveTadazzAudioPolicy({ sceneKind: "interimResults" })
    expect(results).toEqual({ slot: "results", continuityKey: "result-reveal" })
    expect(interim).toEqual(results)
    expect(
      resolveTadazzAudioPolicy({
        statusName: "SELECT_ANSWER",
        extensionPhase: "responses",
      }),
    ).toEqual(results)
  })

  it("maps lobby, voting, leaderboard/tie, recap and finale deterministically", () => {
    expect(resolveTadazzAudioPolicy({}).slot).toBe("lobby")
    expect(resolveTadazzAudioPolicy({ statusName: "SELECT_ANSWER" }).slot).toBe(
      "voting",
    )
    expect(resolveTadazzAudioPolicy({ scenePreset: "tie-break" }).slot).toBe(
      "leaderboard",
    )
    expect(
      resolveTadazzAudioPolicy({ scenePreset: "story-assembly" }).slot,
    ).toBe("recap")
    expect(resolveTadazzAudioPolicy({ scenePreset: "grand-finale" }).slot).toBe(
      "finale",
    )
  })

  it("maps audible show cues to real assets and keeps decorative impact silent", () => {
    expect(TADAZZ_SFX_BY_CUE.impact).toBeUndefined()
    const emitted = [
      "countdown-ended",
      "survey-reveal",
      "story-begin",
      "wipe-covered",
      "company-ident",
      "tadazz-welcome",
      "opening-portal",
      "opening-logo",
      "directory-loaded",
      "phone-ready",
      "readiness-grid",
      "round-launch",
      "story-progress-update",
      "story-assembled",
      "story-live-hold",
      "finale-impact",
      "curtains-closed",
    ]
    for (const cue of emitted) {
      expect(TADAZZ_SFX_BY_CUE[cue]).toMatch(/^\/sounds\/.+\.mp3$/u)
    }
  })

  it("resolves the preserved Goldy/Tzila voting configuration without changing URL, gain, enabled state or loop", () => {
    const fixturePath = fileURLToPath(
      new URL("../../../work/goldy-tzila-extras.json", import.meta.url),
    )
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      audio: AudioExtras
    }
    const configured = fixture.audio.cues.answersMusic
    expect(configured).toMatchObject({
      source: "media",
      url: "/media/tzila-determined-pursuit-20261105.mp3",
      volume: 0.38,
      enabled: true,
      loop: true,
    })
    expect(resolveAudioCue("answersMusic", fixture.audio)).toMatchObject({
      url: "/media/tzila-determined-pursuit-20261105.mp3",
      volume: 0.38,
      enabled: true,
      loop: true,
      isDefault: false,
    })
  })
})
