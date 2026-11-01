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
    url: "/sounds/boump.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  showQuestion: {
    cueId: "showQuestion",
    name: "show.mp3",
    label: "Question Intro",
    url: "/sounds/show.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  answersMusic: {
    cueId: "answersMusic",
    name: "answersMusic.mp3",
    label: "Voting Music Loop",
    url: "/sounds/answersMusic.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: true,
  },
  answerPressed: {
    cueId: "answerPressed",
    name: "answersSound.mp3",
    label: "Answer Submitted",
    url: "/sounds/answersSound.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  revealResults: {
    cueId: "revealResults",
    name: "results.mp3",
    label: "Results Reveal",
    url: "/sounds/results.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  leaderboard: {
    cueId: "leaderboard",
    name: "snearRoll.mp3",
    label: "Leaderboard Drum Roll",
    url: "/sounds/snearRoll.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium1: {
    cueId: "podium1",
    name: "first.mp3",
    label: "Podium 1st Place",
    url: "/sounds/first.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium2: {
    cueId: "podium2",
    name: "second.mp3",
    label: "Podium 2nd Place",
    url: "/sounds/second.mp3",
    type: "audio",
    builtIn: true,
    defaultLoop: false,
  },
  podium3: {
    cueId: "podium3",
    name: "three.mp3",
    label: "Podium 3rd Place",
    url: "/sounds/three.mp3",
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
