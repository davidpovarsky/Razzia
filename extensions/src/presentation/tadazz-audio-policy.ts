import type { SoundtrackSlotId } from "@razzia/extensions/core"

export interface TadazzAudioPolicyInput {
  statusName?: string | null
  extensionPhase?: string | null
  sceneKind?: string | null
  scenePreset?: string | null
  openingActive?: boolean
}

export interface TadazzAudioPolicy {
  slot: SoundtrackSlotId
  continuityKey: string
}

/** Pure stage-to-music policy; URLs remain tenant configuration, not bundled media. */
export function resolveTadazzAudioPolicy({
  statusName,
  extensionPhase,
  sceneKind,
  scenePreset,
  openingActive = false,
}: TadazzAudioPolicyInput): TadazzAudioPolicy {
  if (openingActive) {
    return { slot: "openingIntro", continuityKey: "opening-intro" }
  }

  const preset = scenePreset ?? ""

  if (
    preset.includes("finale") ||
    sceneKind === "closing" ||
    statusName === "FINISHED" ||
    statusName === "SUMMARY" ||
    extensionPhase === "finished"
  ) {
    return { slot: "finale", continuityKey: "finale" }
  }

  if (
    preset.includes("leaderboard") ||
    preset.includes("tie") ||
    sceneKind === "leaderboard"
  ) {
    return { slot: "leaderboard", continuityKey: "leaderboard-tie" }
  }

  if (
    preset.includes("story") ||
    preset.includes("recap") ||
    sceneKind === "answerRecap"
  ) {
    return { slot: "recap", continuityKey: "round-story" }
  }

  if (
    preset.includes("round-one") ||
    preset.includes("round-two") ||
    preset === "interlude" ||
    preset === "z-wipe" ||
    sceneKind === "countdown" ||
    sceneKind === "transition"
  ) {
    return { slot: "roundStart", continuityKey: "round-launch" }
  }

  if (
    preset === "top-pick" ||
    preset === "most-chosen" ||
    preset === "spotlight"
  ) {
    return { slot: "results", continuityKey: "post-results" }
  }

  if (sceneKind === "interimResults") {
    return { slot: "results", continuityKey: "result-reveal" }
  }

  if (sceneKind === "voting") {
    return { slot: "voting", continuityKey: "voting" }
  }

  if (sceneKind === "question") {
    return { slot: "question", continuityKey: "question" }
  }

  if (sceneKind === "results") {
    return { slot: "results", continuityKey: "result-reveal" }
  }

  // Authored scenes own their music even when the underlying round status is
  // still SELECT_ANSWER from the preceding question.
  if (extensionPhase === "scene" || sceneKind === "opening") {
    return { slot: "lobby", continuityKey: "lobby" }
  }

  if (extensionPhase === "responses") {
    return { slot: "results", continuityKey: "result-reveal" }
  }
  if (extensionPhase === "answers") {
    return { slot: "voting", continuityKey: "voting" }
  }

  if (statusName === "SHOW_START" || statusName === "SHOW_PREPARED") {
    return { slot: "roundStart", continuityKey: "round-launch" }
  }

  if (
    statusName === "SHOW_RESPONSES" ||
    statusName === "SHOW_RESULT" ||
    sceneKind === "interimResults" ||
    extensionPhase === "responses"
  ) {
    return { slot: "results", continuityKey: "result-reveal" }
  }

  if (statusName === "SELECT_ANSWER" || extensionPhase === "answers") {
    return { slot: "voting", continuityKey: "voting" }
  }

  if (statusName === "SHOW_QUESTION" || extensionPhase === "question") {
    return { slot: "question", continuityKey: "question" }
  }

  if (statusName === "SHOW_LEADERBOARD" || extensionPhase === "leaderboard") {
    return { slot: "leaderboard", continuityKey: "leaderboard-tie" }
  }

  return { slot: "lobby", continuityKey: "lobby" }
}
