import { describe, expect, it } from "vitest"
import {
  RendererMessageGuard,
  rendererMessageSchema,
  runtimeSnapshotForCapabilities,
  runtimeSnapshotSchema,
} from "../../core/packages/protocol"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import { projectPackageScene } from "./projection"

const question = {
  key: "question-8",
  question: "Which memory?",
  number: 8,
  totalQuestions: 23,
  options: [{ label: "First" }, { label: "Second" }, { label: "Third" }],
}
const project = (scene: ShowScene) =>
  projectPackageScene({ scene, serverTime: 18_000, paused: false })

describe("public package scene projection", () => {
  it("projects authored leaderboard cards with their public ranks and canonical metadata", () => {
    const result = projectPackageScene({
      scene: {
        kind: "scene",
        key: "scene-leaderboard-3",
        scene: { kind: "leaderboard", title: "The Honour Roll" },
        activeSceneData: {
          leaderboard: {
            entries: [
              { rank: 1, displayName: "A", points: 4000 },
              { rank: 2, displayName: "B", points: 3000 },
              { rank: 2, displayName: "C", points: 3000 },
            ],
          },
        },
        startedAt: 10_000,
      },
      serverTime: 18_000,
      paused: false,
      questionNumber: 23,
      questionCount: 23,
      finalLeaderboard: true,
    })

    expect(result).toMatchObject({
      phase: "leaderboard",
      title: "The Honour Roll",
      cardKind: "leaderboard",
      cardTitle: "The Honour Roll",
      questionNumber: 23,
      questionCount: 23,
      finalLeaderboard: true,
      phaseElapsedMs: 8000,
      leaders: [
        { label: "A", score: 4000, rank: 1 },
        { label: "B", score: 3000, rank: 2 },
        { label: "C", score: 3000, rank: 2 },
      ],
      answers: [],
    })
    expect(result).not.toHaveProperty("activeSceneData")
    expect(result).not.toHaveProperty("startedAt")
  })

  it("holds the authoritative pause position and resumes from the adjusted origin", () => {
    const scene: ShowScene = {
      kind: "scene",
      key: "leaderboard",
      scene: { kind: "leaderboard" },
      startedAt: 10_000,
      elapsedMs: 6500,
      paused: true,
    }
    for (const serverTime of [18_000, 50_000, 90_000]) {
      expect(
        projectPackageScene({ scene, serverTime, paused: true }).phaseElapsedMs,
      ).toBe(6500)
    }
    expect(
      projectPackageScene({
        scene: { ...scene, startedAt: 83_500, paused: false },
        serverTime: 90_000,
        paused: false,
      }).phaseElapsedMs,
    ).toBe(6500)
    expect(
      projectPackageScene({
        scene: { ...scene, startedAt: 83_500, paused: false },
        serverTime: 91_000,
        paused: false,
      }).phaseElapsedMs,
    ).toBe(7500)
  })

  it("uses an explicit server final-leaderboard fact and never infers it from titles", () => {
    const scene: ShowScene = {
      kind: "scene",
      key: "leaderboard",
      scene: { kind: "leaderboard", title: "Final winners" },
      activeSceneData: { leaderboard: { entries: [], isFinal: false } },
    }
    expect(project(scene).finalLeaderboard).toBe(false)
    expect(
      project({ ...scene, activeSceneData: undefined }).finalLeaderboard,
    ).toBeUndefined()
    const finalScene: ShowScene = {
      ...scene,
      scene: { kind: "leaderboard", title: "Same title as every round" },
      activeSceneData: { leaderboard: { entries: [], isFinal: true } },
    }
    expect(project(finalScene).finalLeaderboard).toBe(true)
    expect(
      projectPackageScene({
        scene: finalScene,
        serverTime: 18_000,
        paused: false,
        finalLeaderboard: false,
      }).finalLeaderboard,
    ).toBe(false)
    expect(project(finalScene)).not.toHaveProperty("activeSceneData")
  })

  it("keeps quiz question/answer layout metadata and withholds solutions before reveal", () => {
    const withPrivateExtras = {
      ...question,
      solutions: [1],
      accountId: "private-account",
      options: question.options.map((option, index) => ({
        ...option,
        correct: index === 1,
        votes: 9,
      })),
    }
    const result = project({
      kind: "voting",
      key: "voting-8",
      question: withPrivateExtras,
      questionType: "single",
      seconds: 25,
      remainingSeconds: 12,
      totalPlayers: 30,
      answers: ["First", "Second", "Third"],
    })

    expect(result).toMatchObject({
      phase: "voting",
      question: "Which memory?",
      questionNumber: 8,
      questionCount: 23,
      answers: [
        { id: "0", label: "First" },
        { id: "1", label: "Second" },
        { id: "2", label: "Third" },
      ],
    })
    for (const option of result.answers) {
      expect(option).not.toHaveProperty("correct")
      expect(option).not.toHaveProperty("votes")
      expect(option).not.toHaveProperty("percent")
    }
    expect(JSON.stringify(result)).not.toContain("private-account")
    expect(result).not.toHaveProperty("solutions")
  })

  it("exposes correctness only for the native quiz result phase", () => {
    const scene: ShowScene = {
      kind: "results",
      key: "results-8",
      question,
      questionType: "single",
      reveal: { mode: "quiz", counts: [2, 6, 2], solutions: [1] },
    }
    expect(project(scene).answers).toEqual([
      { id: "0", label: "First", percent: 20, votes: 2, correct: false },
      { id: "1", label: "Second", percent: 60, votes: 6, correct: true },
      { id: "2", label: "Third", percent: 20, votes: 2, correct: false },
    ])
    const survey = project({
      ...scene,
      reveal: { mode: "survey", counts: [2, 6, 2], solutions: [1] },
    })
    expect(survey.answers.every((answer) => !("correct" in answer))).toBe(true)
  })

  it("does not reinterpret interim popularity winners as correct quiz answers", () => {
    const result = project({
      kind: "scene",
      key: "interim",
      scene: { kind: "interimResults", title: "Audience vote" },
      activeSceneData: {
        interimResults: {
          sourceQuestionId: "q1",
          questionText: "Favourite memory?",
          totalResponders: 5,
          options: [
            { label: "Trip", answerIndex: 2, count: 5, percentage: 100 },
          ],
          winners: [2],
        },
      },
    })
    expect(result.phase).toBe("results")
    expect(result.question).toBe("Favourite memory?")
    expect(result.answers).toEqual([
      { id: "2", label: "Trip", percent: 100, votes: 5 },
    ])
  })

  it("retains the previous snapshot contract and accepts additive presentation metadata", () => {
    const previousSnapshot = {
      roomId: "room",
      questionId: "question",
      epoch: 1,
      sequence: 1,
      role: "spectator",
      phase: "question",
      locale: "en",
      reducedMotion: false,
      title: "Game",
      question: "Question",
      answers: [],
      leaders: [],
      personalResult: null,
      serverTime: 18_000,
      deadline: null,
      remainingMs: 0,
      paused: false,
      canAnswer: false,
      labels: { submit: "Submit", waiting: "Waiting", results: "Results" },
    }
    expect(runtimeSnapshotSchema.parse(previousSnapshot)).toEqual(
      previousSnapshot,
    )
    expect(
      runtimeSnapshotSchema.safeParse({
        ...previousSnapshot,
        ...project({ kind: "question", key: "question", question }),
      }).success,
    ).toBe(true)
    expect(
      runtimeSnapshotSchema.safeParse({
        ...previousSnapshot,
        accountId: "private",
      }).success,
    ).toBe(false)
  })

  it("keeps strict old SDK bootstrap snapshots unchanged until metadata is negotiated", () => {
    const snapshot = runtimeSnapshotSchema.parse({
      roomId: "room",
      questionId: "question",
      epoch: 1,
      sequence: 1,
      role: "spectator",
      phase: "leaderboard",
      locale: "en",
      reducedMotion: false,
      title: "Game",
      question: "",
      answers: [],
      leaders: [],
      personalResult: null,
      serverTime: 18_000,
      deadline: null,
      remainingMs: 0,
      paused: false,
      canAnswer: false,
      labels: { submit: "Submit", waiting: "Waiting", results: "Results" },
      questionNumber: 23,
      questionCount: 23,
      cardKind: "leaderboard",
      cardTitle: "The Honour Roll",
      finalLeaderboard: true,
      phaseElapsedMs: 6500,
    })
    const oldStrictSchema = runtimeSnapshotSchema.omit({
      questionNumber: true,
      questionCount: true,
      cardKind: true,
      cardTitle: true,
      finalLeaderboard: true,
      phaseElapsedMs: true,
    })
    expect(oldStrictSchema.safeParse(snapshot).success).toBe(false)
    const initial = runtimeSnapshotForCapabilities(snapshot)
    expect(oldStrictSchema.safeParse(initial).success).toBe(true)
    expect(runtimeSnapshotForCapabilities(snapshot, 1)).toEqual(snapshot)
    expect(snapshot.phaseElapsedMs).toBe(6500)
    expect(initial).not.toHaveProperty("phaseElapsedMs")
  })

  it("negotiates capabilities separately from unchanged READY and rejects stale announcements", () => {
    const channel = "a".repeat(64)
    const context = {
      roomId: "room",
      questionId: "question",
      role: "spectator" as const,
      epoch: 3,
    }
    const ready = {
      ...context,
      v: 1,
      channel,
      sequence: 1,
      type: "READY",
      runtimeApi: 1,
    }
    const capability = {
      ...context,
      v: 1,
      channel,
      sequence: 2,
      type: "RUNTIME_CAPABILITIES",
      snapshotMetadataVersion: 1,
    }
    const guard = new RendererMessageGuard(channel)
    expect(rendererMessageSchema.parse(ready)).toEqual(ready)
    expect(guard.accept(ready, context, 10_000)?.type).toBe("READY")
    expect(guard.accept(capability, context, 10_001)?.type).toBe(
      "RUNTIME_CAPABILITIES",
    )
    expect(guard.accept(capability, context, 10_002)).toBeNull()
    expect(
      guard.accept({ ...capability, sequence: 3, epoch: 2 }, context, 10_003),
    ).toBeNull()
    expect(
      rendererMessageSchema.safeParse({
        ...capability,
        snapshotMetadataVersion: 2,
      }).success,
    ).toBe(false)
  })
})
