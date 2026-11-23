import { PLATFORM_CUE_URLS } from "./platform-audio-defaults"
import { CUE_IDS, type CueId } from "./constants"

export interface BuiltInSoundItem {
  cueId: CueId
  name: string
  label: string
  url: string
  type: "audio"
  builtIn: true
  defaultLoop: boolean
}

export const CANONICAL_BUILT_IN_SOUNDS: Record<CueId, BuiltInSoundItem> = {
  start: {
    cueId: "start",
    name: "boump.mp3",
    label: "Game Start",
    url: PLATFORM_CUE_URLS.start,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  showQuestion: {
    cueId: "showQuestion",
    name: "tadazz-silky-transition-20261108.mp3",
    label: "Question Intro",
    url: PLATFORM_CUE_URLS.showQuestion,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  answersMusic: {
    cueId: "answersMusic",
    name: "tzila-determined-pursuit-20261105.mp3",
    label: "Voting Music Loop",
    url: PLATFORM_CUE_URLS.answersMusic,
    type: "audio",
    builtIn: true,
    defaultLoop: true,
  },
  answerPressed: {
    cueId: "answerPressed",
    name: "tadazz-confirm-20261108.mp3",
    label: "Answer Submitted",
    url: PLATFORM_CUE_URLS.answerPressed,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  revealResults: {
    cueId: "revealResults",
    name: "tadazz-reveal-bright-20261108.mp3",
    label: "Results Reveal",
    url: PLATFORM_CUE_URLS.revealResults,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  leaderboard: {
    cueId: "leaderboard",
    name: "snearRoll.mp3",
    label: "Leaderboard Drum Roll",
    url: PLATFORM_CUE_URLS.leaderboard,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium1: {
    cueId: "podium1",
    name: "first.mp3",
    label: "Podium 1st Place",
    url: PLATFORM_CUE_URLS.podium1,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium2: {
    cueId: "podium2",
    name: "second.mp3",
    label: "Podium 2nd Place",
    url: PLATFORM_CUE_URLS.podium2,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium3: {
    cueId: "podium3",
    name: "three.mp3",
    label: "Podium 3rd Place",
    url: PLATFORM_CUE_URLS.podium3,
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
}

export const BUILT_IN_SOUNDS_LIST: BuiltInSoundItem[] = CUE_IDS.map(
  (id) => CANONICAL_BUILT_IN_SOUNDS[id],
)

export const DEFAULT_CUE_URLS: Record<CueId, string> = {
  start: CANONICAL_BUILT_IN_SOUNDS.start.url,
  showQuestion: CANONICAL_BUILT_IN_SOUNDS.showQuestion.url,
  answersMusic: CANONICAL_BUILT_IN_SOUNDS.answersMusic.url,
  answerPressed: CANONICAL_BUILT_IN_SOUNDS.answerPressed.url,
  revealResults: CANONICAL_BUILT_IN_SOUNDS.revealResults.url,
  leaderboard: CANONICAL_BUILT_IN_SOUNDS.leaderboard.url,
  podium1: CANONICAL_BUILT_IN_SOUNDS.podium1.url,
  podium2: CANONICAL_BUILT_IN_SOUNDS.podium2.url,
  podium3: CANONICAL_BUILT_IN_SOUNDS.podium3.url,
}
