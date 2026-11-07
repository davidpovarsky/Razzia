import {
  quizExtrasV2Schema,
  type QuizExtrasV2,
  type TimelineItem,
} from "./studio-timeline-schema"

/** Native scene IDs present in the primary HTML, plus its secondary survey kit. */
export const CREATING_WORLDS_PRESETS = [
  "company-opening",
  "grand-opening",
  "representative-directory",
  "phone-instructions",
  "connection-readiness",
  "round-one",
  "story-progress",
  "tie-break",
  "story-assembly",
  "story-live",
  "round-two",
  "grand-finale",
  "top-pick",
  "round-recap",
  "interlude",
  "z-wipe",
] as const

export const isCreatingWorldsPreset = (value: string) =>
  (CREATING_WORLDS_PRESETS as readonly string[]).includes(value)

/** Completes a saved ten-question show without changing questions/media or real contacts. */
export function completeCreatingWorldsShow(input: QuizExtrasV2): QuizExtrasV2 {
  if (input.questionIds.length !== 10) {
    throw new Error("Creating Worlds requires two five-question rounds")
  }
  const extras = structuredClone(input)
  const timeline: TimelineItem[] = []
  const scene = (
    preset: (typeof CREATING_WORLDS_PRESETS)[number],
    round = 1,
    props: Record<string, unknown> = {},
    onTimeline = true,
  ) => {
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset,
      round,
      advance: "manual",
      durationMs: 10000,
      ...props,
    }
    if (onTimeline) {
      timeline.push({ id: crypto.randomUUID(), kind: "animation", sceneId: id })
    }
  }
  // Preserve the editable dial-in number/roster scene metadata without creating
  // another on-stage directory. The public lobby renders the directory once.
  scene("representative-directory", 1, {}, false)
  // Creating Worlds artwork, join instructions and live connection readiness
  // are lobby-only. Start Game enters the first-round title immediately.
  scene("round-one")
  extras.questionIds.forEach((qid, i) => {
    const round = Math.floor(i / 5) + 1
    timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: qid,
    })
    // The normal results reveal happens immediately after voting ends.
    // Do not add a second interimResults scene after every question.
    // The server skips this step before broadcast when there is no genuine tie.
    scene("tie-break", round)
    scene("top-pick", round)

    if (i === 4 || i === 9) {
      scene("round-recap", round)

      if (i === 4) {
        scene("z-wipe", 2, { advance: "auto", durationMs: 1800 })
        scene("round-two", 2)
      }
    }
  })
  scene("grand-finale", 2)
  extras.timeline = timeline

  if (extras.roster.participants.length === 0) {
    extras.roster = {
      phoneInviteOnly: false,
      participants: Array.from({ length: 40 }, (_, i) => ({
        rosterPlayerId: crypto.randomUUID(),
        displayName: `Test Representative ${String(i + 1).padStart(2, "0")}`,
        phoneE164: null,
      })),
    }
  }

  return quizExtrasV2Schema.parse(extras)
}
