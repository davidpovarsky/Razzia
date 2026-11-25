import { describe, expect, it } from "vitest"
import {
  computeShowScene,
  type ShowEnvelope,
  type ShowScene,
} from "./presentation-scene"
import { planTransition, showSceneTransitionIdentity } from "./show-director"

const snapshot = (overrides: Partial<ShowEnvelope> = {}): ShowEnvelope => ({
  gameId: "authored-scene-test",
  epoch: 4,
  seq: 12,
  phase: "scene",
  startedAt: 1000,
  extras: {
    currentScene: { id: "board", kind: "leaderboard", title: "Scores" },
    activeTimelineStep: { kind: "leaderboard", sceneId: "board", stepIndex: 3 },
    activeSceneData: {
      leaderboard: { entries: [{ displayName: "A", points: 120 }] },
    },
    sceneElapsedMs: 250,
  },
  ...overrides,
})

const identity = (envelope: ShowEnvelope) =>
  showSceneTransitionIdentity(
    computeShowScene({
      role: "manager",
      isConnected: true,
      status: null,
      envelope,
      questionStates: null,
    }),
  )

describe("authored scene transition identity", () => {
  it("keeps editor recap content stable across fresh payloads and clock ticks", () => {
    const scene: Extract<ShowScene, { kind: "scene" }> = {
      kind: "scene",
      key: "editor-recap",
      scene: {
        id: "editor-recap",
        kind: "answerRecap",
        title: "Authored recap title",
        subtitle: "Authored recap subtitle",
      },
      activeSceneData: {
        answerRecap: {
          mode: "correctAnswer",
          totalQuestionsInRange: 2,
          completedQuestionsCount: 0,
          maxItemsPerPage: 4,
          showCounts: true,
          showPercentages: true,
          items: [
            {
              questionId: "survey",
              questionNumber: 1,
              questionText: "Which theme do you prefer?",
              playMode: "survey",
              totalResponders: 0,
              badgeType: "noResponses",
              winningOptions: [],
              correctOptions: [],
            },
            {
              questionId: "quiz",
              questionNumber: 2,
              questionText: "Which planet is red?",
              playMode: "quiz",
              totalResponders: 0,
              winningOptions: [],
              correctOptions: [
                {
                  answerIndex: 1,
                  label: "Mars",
                  count: 0,
                  percentage: 0,
                  isCorrect: true,
                },
              ],
            },
          ],
        },
      },
      elapsedMs: 0,
      paused: true,
    }
    const key = showSceneTransitionIdentity(scene)
    const tick = { ...structuredClone(scene), elapsedMs: 1250, paused: false }
    expect(showSceneTransitionIdentity(tick)).toBe(key)
    expect(
      planTransition(null, scene, { mode: "idle", questionKey: null }),
    ).toEqual([
      {
        op: "showRoundRecap",
        title: "Authored recap title",
        subtitle: "Authored recap subtitle",
        winners: [
          {
            label: "Which theme do you prefer?",
            alt: "Which theme do you prefer?",
            image: undefined,
          },
          { label: "Mars", alt: "Mars", image: undefined },
        ],
      },
    ])
    expect(
      showSceneTransitionIdentity({ ...tick, activeSceneData: {} }),
    ).not.toBe(key)
    expect(
      showSceneTransitionIdentity({
        ...tick,
        scene: { ...scene.scene, title: "Updated authored recap" },
      }),
    ).not.toBe(key)
  })

  it("ignores elapsed-only broadcasts and pause clock re-anchoring", () => {
    const first = snapshot()
    const key = identity(first)
    const elapsed = snapshot({
      seq: 13,
      extras: { ...first.extras, sceneElapsedMs: 1250 },
    })
    expect(identity(elapsed)).toBe(key)
    expect(identity({ ...elapsed, seq: 14, pause: { paused: true } })).toBe(key)
    expect(
      identity({
        ...elapsed,
        seq: 15,
        startedAt: 9000,
        pause: { paused: false },
      }),
    ).toBe(key)
  })

  it("admits real result and authored configuration changes", () => {
    const first = snapshot()
    const key = identity(first)
    expect(
      identity(
        snapshot({
          extras: {
            ...first.extras,
            activeSceneData: {
              leaderboard: { entries: [{ displayName: "A", points: 140 }] },
            },
          },
        }),
      ),
    ).not.toBe(key)
    expect(
      identity(
        snapshot({
          extras: {
            ...first.extras,
            currentScene: {
              id: "board",
              kind: "leaderboard",
              title: "Updated title",
            },
          },
        }),
      ),
    ).not.toBe(key)
  })

  it("admits the next authored step and explicit restart epoch even with identical content", () => {
    const first = snapshot()
    const key = identity(first)
    expect(
      identity(
        snapshot({
          extras: {
            ...first.extras,
            activeTimelineStep: {
              kind: "leaderboard",
              sceneId: "board",
              stepIndex: 4,
            },
          },
        }),
      ),
    ).not.toBe(key)
    expect(identity(snapshot({ epoch: 5 }))).not.toBe(key)
    expect(identity(snapshot({ gameId: "another-show" }))).not.toBe(key)
  })

  it("keeps full-show data on its existing patch path while preserving explicit replay", () => {
    const first = snapshot({
      extras: {
        currentScene: {
          id: "opening",
          kind: "animation",
          preset: "company-opening",
        },
        activeTimelineStep: {
          kind: "animation",
          sceneId: "opening",
          stepIndex: 0,
        },
        sceneElapsedMs: 250,
      },
    })
    const key = identity(first)
    expect(
      identity({
        ...first,
        seq: 13,
        extras: {
          ...first.extras,
          sceneElapsedMs: 1250,
          activeSceneData: { fullShow: { connectedTables: [1, 2] } },
        },
      }),
    ).toBe(key)
    expect(identity({ ...first, epoch: 5 })).not.toBe(key)
  })
})
