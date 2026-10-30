import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { StudioShowCoordinator } from "./studio-show-coordinator"
import type { TimelineItem, SceneConfig } from "../../core/studio-timeline-schema"

describe("StudioShowCoordinator", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const dummyDefaults = {
    newQuestionMode: "quiz" as const,
    leaderboardPolicy: "cardOnly" as const,
    advanceMode: "auto" as const,
  }

  const q1Id = "11111111-1111-4111-8111-111111111111"
  const q2Id = "22222222-2222-4222-8222-222222222222"
  const q3Id = "33333333-3333-4333-8333-333333333333"

  const openId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const transId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const mediaId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
  const animId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
  const lbId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
  const interimId = "ffffffff-ffff-4fff-8fff-ffffffffffff"
  const cdId = "12121212-1212-4212-8212-121212121212"
  const closeId = "34343434-3434-4434-8434-343434343434"

  const scenes: Record<string, SceneConfig> = {
    [openId]: { id: openId, kind: "opening", title: "Show Intro", durationMs: 4000, advance: "auto" },
    [transId]: { id: transId, kind: "transition", title: "Moving On", durationMs: 3000, advance: "manual" },
    [mediaId]: { id: mediaId, kind: "media", mediaUrl: "https://example.com/clip.mp4", mediaType: "video", durationMs: 5000, advance: "auto" },
    [animId]: { id: animId, kind: "animation", preset: "spotlight", durationMs: 2000, advance: "auto" },
    [lbId]: { id: lbId, kind: "leaderboard", title: "Top Scores", durationMs: 4000, advance: "manual" },
    [interimId]: { id: interimId, kind: "interimResults", title: "Interim Standings", durationMs: 3000, advance: "auto" },
    [cdId]: { id: cdId, kind: "countdown", durationSeconds: 5, advance: "auto" },
    [closeId]: { id: closeId, kind: "closing", title: "Goodnight", durationMs: 5000, advance: "auto" },
  }

  const timeline: TimelineItem[] = [
    { id: "s-open", kind: "opening", sceneId: openId },
    { id: "s-q1", kind: "question", questionId: q1Id },
    { id: "s-trans", kind: "transition", sceneId: transId },
    { id: "s-q2", kind: "question", questionId: q2Id },
    { id: "s-media", kind: "media", sceneId: mediaId },
    { id: "s-anim", kind: "animation", sceneId: animId },
    { id: "s-lb", kind: "leaderboard", sceneId: lbId },
    { id: "s-interim", kind: "interimResults", sceneId: interimId },
    { id: "s-cd", kind: "countdown", sceneId: cdId },
    { id: "s-q3", kind: "question", questionId: q3Id },
    { id: "s-close", kind: "closing", sceneId: closeId },
  ]

  const questionIds = [q1Id, q2Id, q3Id]

  it("advances through full 10-kind timeline: opening -> Q1 -> transition -> Q2 -> media -> animation -> leaderboard -> interimResults -> countdown -> Q3 -> closing -> FINISHED", () => {
    const startedQuestions: number[] = []
    let isFinished = false
    let broadcasts = 0

    const coordinator = new StudioShowCoordinator({
      timeline,
      scenes,
      questionIds,
      defaults: dummyDefaults,
      callbacks: {
        onStartQuestion: (qIdx) => {
          startedQuestions.push(qIdx)
        },
        onFinish: () => {
          isFinished = true
        },
        onBroadcastState: () => {
          broadcasts += 1
        },
      },
    })

    expect(coordinator.currentPhase).toBe("lobby")
    expect(coordinator.canAcceptAnswers()).toBe(false)

    // 1. Start -> Step 0 (opening, auto 4000ms)
    coordinator.start()
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.isSceneActive()).toBe(true)
    expect(coordinator.canAcceptAnswers()).toBe(false)
    expect(coordinator.currentStep?.item.kind).toBe("opening")
    expect(coordinator.getQuestionOrdinal()).toBe(0)
    expect(startedQuestions).toEqual([])

    // Auto-advance after 4000ms -> Step 1 (Q1, question)
    vi.advanceTimersByTime(4000)
    expect(coordinator.currentPhase).toBe("question")
    expect(coordinator.isSceneActive()).toBe(false)
    expect(coordinator.canAcceptAnswers()).toBe(true)
    expect(coordinator.currentStep?.item.kind).toBe("question")
    expect(coordinator.getQuestionOrdinal()).toBe(1)
    // Q1 is index 0
    expect(startedQuestions).toEqual([0])

    // Complete Q1 -> Step 2 (transition, manual)
    coordinator.onQuestionCompleted(0)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.isSceneActive()).toBe(true)
    expect(coordinator.canAcceptAnswers()).toBe(false)
    expect(coordinator.currentStep?.item.kind).toBe("transition")

    // Advance manually -> Step 3 (Q2, question)
    coordinator.advanceScene()
    expect(coordinator.currentPhase).toBe("question")
    expect(coordinator.canAcceptAnswers()).toBe(true)
    expect(coordinator.getQuestionOrdinal()).toBe(2)
    // Q2 is index 1
    expect(startedQuestions).toEqual([0, 1])

    // Complete Q2 -> Step 4 (media, auto 5000ms)
    coordinator.onQuestionCompleted(1)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("media")

    // Auto-advance -> Step 5 (animation, auto 2000ms)
    vi.advanceTimersByTime(5000)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("animation")

    // Auto-advance -> Step 6 (leaderboard, manual)
    vi.advanceTimersByTime(2000)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("leaderboard")

    // Advance manually -> Step 7 (interimResults, auto 3000ms)
    coordinator.advanceScene()
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("interimResults")

    // Auto-advance -> Step 8 (countdown, auto 5000ms)
    vi.advanceTimersByTime(3000)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("countdown")

    // Auto-advance -> Step 9 (Q3, question)
    vi.advanceTimersByTime(5000)
    expect(coordinator.currentPhase).toBe("question")
    expect(coordinator.canAcceptAnswers()).toBe(true)
    expect(coordinator.getQuestionOrdinal()).toBe(3)
    // Q3 is index 2
    expect(startedQuestions).toEqual([0, 1, 2])

    // Complete Q3 -> Step 10 (closing, auto 5000ms)
    coordinator.onQuestionCompleted(2)
    expect(coordinator.currentPhase).toBe("scene")
    expect(coordinator.currentStep?.item.kind).toBe("closing")

    // Auto-advance closing -> FINISHED
    vi.advanceTimersByTime(5000)
    expect(coordinator.currentPhase).toBe("finished")
    expect(isFinished).toBe(true)
  })

  it("guards against double advance from simultaneous manual skip and auto-advance timer", () => {
    let isFinished = false
    const coordinator = new StudioShowCoordinator({
      timeline: [
        { id: "s-open", kind: "opening", sceneId: openId },
        { id: "s-anim", kind: "animation", sceneId: animId },
      ],
      scenes,
      questionIds,
      defaults: dummyDefaults,
      callbacks: {
        onStartQuestion: vi.fn(),
        onFinish: () => {
          isFinished = true
        },
        onBroadcastState: vi.fn(),
      },
    })

    coordinator.start()
    expect(coordinator.currentIndex).toBe(0)

    // Advance 1000ms into opening (duration 4000ms)
    vi.advanceTimersByTime(1000)

    // User clicks manual advance to animation (duration 2000ms)
    const advanced = coordinator.advanceScene()
    expect(advanced).toBe(true)
    // Moved to animation
    expect(coordinator.currentIndex).toBe(1)

    // Advance 1000ms: animation is still active (1000ms / 2000ms)
    vi.advanceTimersByTime(1000)
    expect(coordinator.currentIndex).toBe(1)
    expect(isFinished).toBe(false)

    // Now advance remaining 1000ms for animation -> finishes
    vi.advanceTimersByTime(1000)
    expect(isFinished).toBe(true)
  })

  it("strictly rejects advance if step epoch or sceneId does not match", () => {
    const coordinator = new StudioShowCoordinator({
      timeline: [
        { id: "s-open", kind: "opening", sceneId: openId },
        { id: "s-q1", kind: "question", questionId: q1Id },
      ],
      scenes,
      questionIds,
      defaults: dummyDefaults,
      callbacks: {
        onStartQuestion: vi.fn(),
        onFinish: vi.fn(),
        onBroadcastState: vi.fn(),
      },
    })

    coordinator.start()
    const { currentEpoch } = coordinator

    // Stale epoch rejected
    const rejectedStale = coordinator.advanceScene(undefined, currentEpoch - 1)
    expect(rejectedStale).toBe(false)
    expect(coordinator.currentIndex).toBe(0)

    // Wrong sceneId rejected
    const rejectedWrongId = coordinator.advanceScene("wrong-scene-id", currentEpoch)
    expect(rejectedWrongId).toBe(false)
    expect(coordinator.currentIndex).toBe(0)

    // Correct epoch accepted
    const accepted = coordinator.advanceScene(openId, currentEpoch)
    expect(accepted).toBe(true)
    expect(coordinator.currentIndex).toBe(1)
  })

  it("returns authoritative step envelope with monotonic epoch and seq", () => {
    const coordinator = new StudioShowCoordinator({
      timeline: [
        { id: "s-open", kind: "opening", sceneId: openId },
        { id: "s-q1", kind: "question", questionId: q1Id },
      ],
      scenes,
      questionIds,
      defaults: dummyDefaults,
      callbacks: {
        onStartQuestion: vi.fn(),
        onFinish: vi.fn(),
        onBroadcastState: vi.fn(),
      },
    })

    coordinator.start()
    const env = coordinator.getAuthoritativeStepEnvelope("player")
    expect(env).not.toBeNull()
    expect(env?.kind).toBe("opening")
    expect(env?.sceneId).toBe(openId)
    expect(env?.advance).toBe("auto")
    expect(env?.durationMs).toBe(4000)
    expect(env?.epoch).toBe(1)
    expect(env?.seq).toBe(1)
    expect(env?.totalSteps).toBe(2)
  })

  it("P1: supports safe backward navigation with previousScene()", () => {
    const startedQuestions: number[] = []
    const completedResultsShown: number[] = []
    let broadcasts = 0

    const coordinator = new StudioShowCoordinator({
      timeline: [
        { id: "s-open", kind: "opening", sceneId: openId },
        { id: "s-q1", kind: "question", questionId: q1Id },
        { id: "s-trans", kind: "transition", sceneId: transId },
      ],
      scenes,
      questionIds,
      defaults: dummyDefaults,
      callbacks: {
        onStartQuestion: (qIdx) => {
          startedQuestions.push(qIdx)
        },
        onShowCompletedQuestionResults: (qIdx) => {
          completedResultsShown.push(qIdx)
        },
        onFinish: vi.fn(),
        onBroadcastState: () => {
          broadcasts += 1
        },
      },
    })

    // At lobby
    expect(coordinator.canPrevious().can).toBe(false)

    // Step 0: opening
    coordinator.start()
    expect(coordinator.currentIndex).toBe(0)
    expect(coordinator.canPrevious().can).toBe(false) // At start of show

    // Advance to Step 1: Q1 (question)
    coordinator.advanceScene(openId)
    expect(coordinator.currentIndex).toBe(1)
    expect(coordinator.canPrevious().can).toBe(true)
    expect(startedQuestions).toEqual([0])

    // Advance to Step 2: Transition (manual)
    coordinator.onQuestionCompleted(0)
    expect(coordinator.currentIndex).toBe(2)
    expect(coordinator.currentStep?.item.kind).toBe("transition")
    expect(coordinator.isSceneActive()).toBe(true)
    expect(coordinator.canPrevious().can).toBe(true)

    // Previous from Step 2 (transition) -> Step 1 (Q1 results)
    const backToQ1 = coordinator.previousScene()
    expect(backToQ1).toBe(true)
    expect(coordinator.currentIndex).toBe(1)
    expect(completedResultsShown).toEqual([0]) // Displayed completed question results read-only!

    // Previous from Step 1 (Q1) -> Step 0 (opening)
    const backToOpen = coordinator.previousScene()
    expect(backToOpen).toBe(true)
    expect(coordinator.currentIndex).toBe(0)
    expect(coordinator.currentStep?.item.kind).toBe("opening")
    expect(coordinator.isSceneActive()).toBe(true)

    // At Step 0, cannot go back further
    expect(coordinator.canPrevious().can).toBe(false)
    expect(coordinator.previousScene()).toBe(false)
  })
})
