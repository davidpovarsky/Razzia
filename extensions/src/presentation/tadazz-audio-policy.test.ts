import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it } from "vitest"
import type { AudioExtras } from "../core/quiz-extras"
import { AudioCuePlayer, resolveAudioCue, TADAZZ_SFX_BY_CUE } from "./audio-cue-player"
import { resolveTadazzAudioPolicy } from "./tadazz-audio-policy"

describe("P0 Tadazz soundtrack policy", () => {
  it("plays the selected results bed, then the authored original spotlight bed, without replacing reveal SFX", () => {
    const audio = { cues: {}, soundtrack: { results: {
      mode: "media", url: "/tadazz-show/music/cutie-patootie.mp3",
      volume: 0.3, loop: true, fadeMs: 400, startOffsetSeconds: 0,
    } } } as unknown as AudioExtras
    const props = { audioExtras: audio, soundtrackSlot: "results" as const,
      stageOwnsReveal: true, cueId: "revealResults" as const, autoPlay: false }
    const results = renderToString(createElement(AudioCuePlayer, props))
    expect(results).toContain('data-audio-url="/tadazz-show/music/cutie-patootie.mp3"')
    expect(results).not.toContain('data-testid="soundtrack-credit"')
    const ending = renderToString(createElement(AudioCuePlayer, { ...props, soundtrackSlot: "finale" }))
    expect(ending).toContain('data-testid="soundtrack-credit"')
    const spotlight = renderToString(createElement(AudioCuePlayer, { ...props,
      sceneAudio: { mode: "custom", url: "/media/original-results.mp3", volume: 0.3, loop: true },
    }))
    expect(spotlight).toContain('data-audio-url="/media/original-results.mp3"')
    const afterVoting = renderToString(createElement(AudioCuePlayer, { ...props,
      cueId: "answersMusic", cardAudioCues: { answersMusic: { mode: "custom", url: "/tadazz-show/music/epic-main-menu.mp3", volume: 0.38, loop: true } },
      sceneAudio: { mode: "custom", url: "/media/original-results.mp3", volume: 0.3, loop: true },
    }))
    expect(afterVoting).toContain('data-audio-url="/media/original-results.mp3"')
    expect(spotlight).not.toContain('data-testid="soundtrack-credit"')
    expect(TADAZZ_SFX_BY_CUE["survey-reveal"]).toBe("/sounds/tadazz-reveal-bright-20261108.mp3")
  })

  it("uses an authored question timer track instead of the global voting bed", () => {
    const html = renderToString(createElement(AudioCuePlayer, {
      cueId: "answersMusic", soundtrackSlot: "voting", autoPlay: false,
      cardAudioCues: { answersMusic: { mode: "custom", url: "/tadazz-show/music/epic-main-menu.mp3", volume: 0.38, loop: true } },
    }))
    expect(html).toContain('data-audio-url="/tadazz-show/music/epic-main-menu.mp3"')
    expect(html).toContain('data-audio-loop="true"')
  })

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
