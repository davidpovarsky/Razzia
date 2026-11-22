import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { createPlatformAudioExtras } from "../core/platform-audio-defaults"
import { describe, expect, it } from "vitest"
import {
  AudioCuePlayer,
  audioEffectFailureDisposition,
  resolveTimedAudioOffset,
  shouldSuppressAudioEffect,
} from "./audio-cue-player"

describe("default audio playback ownership", () => {
  const url = "/sounds/tadazz-silky-transition-20261108.mp3"
  const empty = { url: "", at: 0 }

  it("suppresses a default scene effect already playing through its phase cue", () => {
    expect(
      shouldSuppressAudioEffect({
        name: "round-launch",
        url,
        playingUrls: [url],
        lastEffect: empty,
        now: 1000,
      }),
    ).toBe(true)
    expect(
      shouldSuppressAudioEffect({
        name: "round-launch",
        url,
        playingUrls: [],
        lastEffect: empty,
        now: 1000,
      }),
    ).toBe(false)
  })

  it("deduplicates adjacent choreography but permits a later replay", () => {
    const previous = { url, at: 1000 }
    expect(
      shouldSuppressAudioEffect({
        name: "opening-logo",
        url,
        playingUrls: [],
        lastEffect: previous,
        now: 1200,
      }),
    ).toBe(true)
    expect(
      shouldSuppressAudioEffect({
        name: "opening-logo",
        url,
        playingUrls: [],
        lastEffect: previous,
        now: 1700,
      }),
    ).toBe(false)
    expect(
      shouldSuppressAudioEffect({
        name: "opening-logo",
        url,
        playingUrls: [],
        lastEffect: empty,
        now: 1200,
      }),
    ).toBe(false)
  })

  it("honors an explicit voting stage and more specific question choices through one owner", () => {
    const audio = createPlatformAudioExtras()
    audio.soundtrack!.voting = {
      mode: "media",
      url: "/media/voting-stage.mp3",
      volume: 0.17,
      loop: true,
      fadeMs: 0,
      startOffsetSeconds: 2,
    }
    const render = (cardAudioCues?: {
      answersMusic: { mode: "mute" | "custom"; url?: string; volume: number }
    }) =>
      renderToString(
        createElement(AudioCuePlayer, {
          soundtrackSlot: "voting",
          cueId: "answersMusic",
          autoPlay: false,
          audioExtras: audio,
          cardAudioCues,
        }),
      )
    expect(render()).toContain('data-audio-url="/media/voting-stage.mp3"')
    expect(
      render({
        answersMusic: {
          mode: "custom",
          url: "/media/question-vote.mp3",
          volume: 0.38,
        },
      }),
    ).toContain('data-audio-url="/media/question-vote.mp3"')
    expect(render({ answersMusic: { mode: "mute", volume: 0 } })).toContain(
      'data-audio-url=""',
    )
    audio.soundtrack!.voting.mode = "mute"
    expect(render()).toContain('data-audio-url=""')
  })

  it("keeps timed opening music on its authored offset across pause, reconnect and loops", () => {
    expect(
      resolveTimedAudioOffset({ elapsedMs: 3500, startOffsetSeconds: 2 }),
    ).toBe(5.5)
    expect(
      resolveTimedAudioOffset({ elapsedMs: 3500, startOffsetSeconds: 2 }),
    ).toBe(5.5)
    expect(
      resolveTimedAudioOffset({
        elapsedMs: 11500,
        startOffsetSeconds: 2,
        loop: true,
        durationSeconds: 6,
      }),
    ).toBe(1.5)
    expect(
      resolveTimedAudioOffset({
        elapsedMs: 11500,
        startOffsetSeconds: 2,
        loop: false,
        durationSeconds: 6,
      }),
    ).toBe(13.5)
    expect(
      resolveTimedAudioOffset({
        elapsedMs: 1000,
        startOffsetSeconds: 2,
        loop: true,
      }),
    ).toBe(3)
  })

  it("keeps distinct player clicks and distinct result milestones", () => {
    for (const name of ["answer-selected", "answer-submitted"]) {
      expect(
        shouldSuppressAudioEffect({
          name,
          url,
          playingUrls: [url],
          lastEffect: { url, at: 1000 },
          now: 1100,
        }),
      ).toBe(false)
    }
    expect(
      shouldSuppressAudioEffect({
        name: "survey-reveal",
        url,
        playingUrls: [],
        lastEffect: { url, at: 1000 },
        now: 1100,
      }),
    ).toBe(false)
  })
})

describe("sound effect promise ownership", () => {
  it("ignores interrupted playback and stale rejections without blocking new music", () => {
    expect(audioEffectFailureDisposition({ name: "AbortError" }, true)).toBe(
      "ignore",
    )
    expect(audioEffectFailureDisposition({ name: "AbortError" }, false)).toBe(
      "ignore",
    )
    expect(
      audioEffectFailureDisposition({ name: "NotAllowedError" }, false),
    ).toBe("ignore")
    expect(
      audioEffectFailureDisposition(new Error("old source failed"), false),
    ).toBe("ignore")
  })

  it("retains genuine autoplay denial and reports current media failures separately", () => {
    expect(
      audioEffectFailureDisposition({ name: "NotAllowedError" }, true),
    ).toBe("blocked")
    expect(
      audioEffectFailureDisposition({ name: "NotSupportedError" }, true),
    ).toBe("error")
    expect(
      audioEffectFailureDisposition(new Error("media unavailable"), true),
    ).toBe("error")
  })
})
