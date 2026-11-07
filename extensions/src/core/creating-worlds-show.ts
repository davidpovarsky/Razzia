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
    timeline.push({ id: crypto.randomUUID(), kind: "animation", sceneId: id })
  }
  scene("company-opening")
  scene("grand-opening")
  // The complete 40-table directory is presented once; do not repeat it in four groups.
  scene("representative-directory")
  scene("phone-instructions")
  scene("connection-readiness")
  scene("round-one")
  extras.questionIds.forEach((qid, i) => {
    const round = Math.floor(i / 5) + 1
    timeline.push({
      id: crypto.randomUUID(),
      kind: "question",
      questionId: qid,
    })
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "interimResults",
      advance: "manual",
      durationMs: 5000,
    }
    timeline.push({
      id: crypto.randomUUID(),
      kind: "interimResults",
      sceneId: id,
    })
    // The server skips this step before broadcast when there is no genuine tie.
    scene("tie-break", round)
    scene("top-pick", round)
    scene("story-progress", round)

    if (i === 4 || i === 9) {
      scene("round-recap", round)
      scene("story-assembly", round)
      scene("story-live", round)

      if (i === 4) {
        scene("interlude", 2, {
          title: "A WHOLE NEW WORLD",
          subtitle: "ROUND 02",
        })
        scene("z-wipe", 2)
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
