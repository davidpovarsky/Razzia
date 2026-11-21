import {
  PLATFORM_AUDIO_URLS,
  PLATFORM_CUE_URLS,
} from "../platform-audio-defaults"
import type { ShowThemeAudioEvent, ShowThemeRole } from "./selection"

/** The existing Creating Worlds effects, shared by built-in and imported stages. */
export const PLATFORM_SFX_BY_CUE: Readonly<Record<string, string>> = {
  "timer-ended": "/sounds/tadazz-timer-end-368edc1d9522.mp3",
  "vote-locked": PLATFORM_CUE_URLS.revealResults,
  "countdown-ended": PLATFORM_CUE_URLS.revealResults,
  "survey-reveal": PLATFORM_CUE_URLS.revealResults,
  "top-pick-reveal": PLATFORM_CUE_URLS.answerPressed,
  "timer-start": "/sounds/boump.mp3",
  "timer-tick": "/sounds/tadazz-timer-tick-20261108.mp3",
  "timer-urgent": "/sounds/tadazz-timer-urgent-20261108.mp3",
  "timer-final": "/sounds/tadazz-timer-final-20261108.mp3",
  "story-begin": PLATFORM_CUE_URLS.showQuestion,
  "wipe-covered": PLATFORM_CUE_URLS.showQuestion,
  "company-ident": PLATFORM_CUE_URLS.showQuestion,
  "tadazz-welcome": PLATFORM_CUE_URLS.showQuestion,
  "opening-portal": PLATFORM_CUE_URLS.showQuestion,
  "opening-logo": PLATFORM_CUE_URLS.showQuestion,
  "directory-loaded": PLATFORM_CUE_URLS.answerPressed,
  "phone-ready": PLATFORM_CUE_URLS.answerPressed,
  "readiness-grid": PLATFORM_CUE_URLS.answerPressed,
  "round-launch": PLATFORM_CUE_URLS.showQuestion,
  "story-progress-update": PLATFORM_CUE_URLS.answerPressed,
  "story-assembled": PLATFORM_CUE_URLS.revealResults,
  "story-live-hold": PLATFORM_CUE_URLS.showQuestion,
  "finale-impact": PLATFORM_CUE_URLS.podium1,
  "curtains-closed": PLATFORM_CUE_URLS.showQuestion,
}

const PLATFORM_EVENT_URLS: Record<ShowThemeAudioEvent, string | undefined> = {
  opening: PLATFORM_CUE_URLS.start,
  lobby: PLATFORM_AUDIO_URLS.lobby,
  showQuestion: PLATFORM_CUE_URLS.showQuestion,
  answersMusic: PLATFORM_CUE_URLS.answersMusic,
  answerSelected: undefined,
  answerSubmitted: PLATFORM_CUE_URLS.answerPressed,
  timerWarning: PLATFORM_SFX_BY_CUE["timer-tick"],
  timerExpired: PLATFORM_SFX_BY_CUE["timer-ended"],
  voteLocked: PLATFORM_CUE_URLS.revealResults,
  revealResults: PLATFORM_CUE_URLS.revealResults,
  leaderboard: PLATFORM_CUE_URLS.leaderboard,
  zzTransition: PLATFORM_CUE_URLS.showQuestion,
  podium1: PLATFORM_CUE_URLS.podium1,
  podium2: PLATFORM_CUE_URLS.podium2,
  podium3: PLATFORM_CUE_URLS.podium3,
  closing: PLATFORM_CUE_URLS.podium1,
}

/** Inheritance is distinct from an authored silent variant or a mute selection. */
export function platformThemeAudio(
  event: ShowThemeAudioEvent,
  choreographyName?: string,
) {
  const url =
    (choreographyName && PLATFORM_SFX_BY_CUE[choreographyName]) ||
    PLATFORM_EVENT_URLS[event]
  const playerAction = event === "answerSelected" || event === "answerSubmitted"
  const roles: ShowThemeRole[] = playerAction
    ? ["player"]
    : ["manager", "spectator"]

  const levels: Partial<Record<ShowThemeAudioEvent, number>> = {
    answersMusic: 0.38,
    lobby: 0.2,
  }

  return {
    url,
    silent: !url,
    volume: levels[event] ?? 0.8,
    loop: event === "answersMusic" || event === "lobby",
    fadeMs: event === "lobby" ? 650 : 0,
    priority: event === "timerExpired" ? 90 : 60,
    restart: event === "answersMusic" ? ("epoch" as const) : ("event" as const),
    roles,
  }
}
