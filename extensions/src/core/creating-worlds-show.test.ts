import { it, expect } from "vitest"
import {
  completeCreatingWorldsShow,
  CREATING_WORLDS_PRESETS,
} from "./creating-worlds-show"
import { createDefaultQuizExtrasV2 } from "./studio-timeline-schema"
it("adds every source show preset to the original ten questions, preserving author data and real contacts", () => {
  const extras = createDefaultQuizExtrasV2(
    "quiz",
    Array.from({ length: 10 }, () => crypto.randomUUID()),
    "a".repeat(64),
  )
  const complete = completeCreatingWorldsShow(extras)
  expect(complete.questionIds).toEqual(extras.questionIds)
  expect(extras.roster.participants).toHaveLength(0)
  expect(complete.roster.participants).toHaveLength(40)
  expect(complete.roster.participants.every((p) => p.phoneE164 === null)).toBe(
    true,
  )
  const presets = complete.timeline.flatMap((item) =>
    item.kind === "animation"
      ? [(complete.scenes[item.sceneId] as { preset: string }).preset]
      : [],
  )
  for (const preset of CREATING_WORLDS_PRESETS) {
    expect(presets).toContain(preset)
  }
  expect(
    complete.timeline.filter((item) => item.kind === "question"),
  ).toHaveLength(10)
  const original = {
    rosterPlayerId: "real",
    displayName: "Existing representative",
    phoneE164: null,
  }
  extras.roster.participants = [original]
  expect(completeCreatingWorldsShow(extras).roster.participants).toEqual([
    original,
  ])
})
