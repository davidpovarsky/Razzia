// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
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
    if (
      [
        "company-opening",
        "grand-opening",
        "representative-directory",
        "phone-instructions",
        "connection-readiness",
        "story-progress",
        "interlude",
      ].includes(preset)
    ) {
      expect(presets).not.toContain(preset)
    } else {
      expect(presets).toContain(preset)
    }
  }
  expect(
    complete.timeline.filter((item) => item.kind === "question"),
  ).toHaveLength(10)
  const directorySteps = complete.timeline.filter(
    (item) =>
      item.kind === "animation" &&
      (complete.scenes[item.sceneId] as { preset?: string }).preset ===
        "representative-directory",
  )
  // The full 40-representative directory is now part of the join lobby, not the timeline.
  expect(directorySteps).toHaveLength(0)
  expect(
    Object.values(complete.scenes).filter(
      (s) => s.kind === "animation" && s.preset === "representative-directory",
    ),
  ).toHaveLength(1)
  expect(complete.timeline).toHaveLength(40)
  const authoredScenes = complete.timeline.flatMap((item) =>
    item.kind === "animation" ? [complete.scenes[item.sceneId]] : [],
  )
  for (const round of [1, 2]) {
    const recap = authoredScenes.findIndex(
      (scene) =>
        scene.kind === "animation" &&
        scene.preset === "round-recap" &&
        scene.round === round,
    )
    expect(authoredScenes[recap + 1]).toMatchObject({
      preset: "story-assembly",
      round,
      advance: "auto",
      durationMs: 60000,
    })
    expect(authoredScenes[recap + 2]).toMatchObject({
      preset: "story-live",
      round,
      advance: "manual",
    })
  }
  expect(presets.filter((preset) => preset === "top-pick")).toHaveLength(10)
  expect(presets.filter((preset) => preset === "round-recap")).toHaveLength(2)
  expect(complete.timeline.some((item) => item.kind === "interimResults")).toBe(
    false,
  )
  for (let index = 0; index < complete.timeline.length - 1; index += 1) {
    if (complete.timeline[index]?.kind !== "question") {
      continue
    }

    const next = complete.timeline[index + 1]
    const scene =
      next?.kind === "animation" ? complete.scenes[next.sceneId] : undefined
    expect(scene && "preset" in scene ? scene.preset : null).toBe("tie-break")
  }
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
