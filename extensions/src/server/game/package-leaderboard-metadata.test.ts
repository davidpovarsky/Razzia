import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
} from "../../core/index"
import { quizExtrasV2Schema } from "../../core/studio-timeline-schema"
import { ExtensionGameSession } from "./session"
import { StudioShowCoordinator } from "./studio-show-coordinator"

describe("public authored leaderboard metadata", () => {
  it("marks only the last of three authored leaderboard cards without exposing the future timeline", () => {
    const questionIds = Array.from({ length: 3 }, () => randomUUID())
    const leaderIds = Array.from({ length: 3 }, () => randomUUID())
    const closingId = randomUUID()
    const base = createDefaultQuizExtras(
      randomUUID(),
      questionIds,
      computeCanonicalBaseDigest({ subject: "Synthetic show" }),
    )
    const extras = quizExtrasV2Schema.parse({
      ...base,
      schemaVersion: 2,
      timeline: [
        ...questionIds.flatMap((questionId, index) => [
          { id: randomUUID(), kind: "question", questionId },
          { id: randomUUID(), kind: "leaderboard", sceneId: leaderIds[index] },
        ]),
        { id: randomUUID(), kind: "closing", sceneId: closingId },
      ],
      scenes: Object.fromEntries([
        ...leaderIds.map((id) => [
          id,
          {
            id,
            kind: "leaderboard",
            title: "Identical honour roll title",
            durationMs: 24000,
            advance: "manual",
          },
        ]),
        [
          closingId,
          {
            id: closingId,
            kind: "closing",
            title: "Closing",
            durationMs: 6000,
            advance: "manual",
          },
        ],
      ]),
      defaults: {},
    })
    const session = new ExtensionGameSession("synthetic-live-show", extras)
    session.setDelegate({
      getLeaderboard: () => [
        { displayName: "A", points: 300 },
        { displayName: "B", points: 200 },
      ],
    })
    const coordinator = new StudioShowCoordinator({
      timeline: extras.timeline,
      scenes: extras.scenes,
      questionIds,
      defaults: extras.defaults,
      callbacks: {
        onStartQuestion: (index) => session.onQuestionStart(index),
        onFinish: () => undefined,
        onBroadcastState: () => undefined,
      },
    })
    session.setShowCoordinator(coordinator)
    try {
      coordinator.start()
      for (const index of [0, 1, 2]) {
        coordinator.onQuestionCompleted(index)
        expect(coordinator.currentStep?.item.kind).toBe("leaderboard")
        const player = session.getStateSnapshot("player", [])
        expect(player.extras.activeSceneData).toEqual({
          leaderboard: {
            entries: [
              { rank: 1, displayName: "A", points: 300 },
              { rank: 2, displayName: "B", points: 200 },
            ],
            isFinal: index === 2,
          },
        })
        expect(player.extras.timeline).toBeUndefined()
        expect(player.extras.scenes).toBeUndefined()
        expect(
          session.getStateSnapshot("manager", []).extras.activeSceneData,
        ).toEqual(player.extras.activeSceneData)
        coordinator.advanceScene()
      }
      expect(coordinator.currentStep?.item.kind).toBe("closing")
    } finally {
      coordinator.dispose()
    }
  })
})
