/** Test-only module. Deliberately absent from production barrels. Never supplies live outcomes. */
import type { PreviewPhase } from "./primitives"
import type {
  PreviewDraftInput,
  CompiledPreviewManifest,
  DemoClockSnapshot,
  DemoIntent,
} from "./preview-schemas"
import { derivePreviewIdentityMap } from "./identity"

export interface SharedPreviewFixture {
  readonly fixtureId: string
  readonly portVersion: 3
  readonly input: PreviewDraftInput
  readonly manifest: CompiledPreviewManifest
  readonly identityRuleVersion: 2
  readonly checkpoints: readonly Readonly<{
    phase: PreviewPhase
    clock: DemoClockSnapshot
    intents: readonly DemoIntent[]
    expectedResolution: "exact" | "fallback" | "unavailable"
    expectedVisibleBindingIds: readonly string[]
    forbiddenBindingIds: readonly string[]
    expectedAnswerIds: readonly string[]
    expectedDiagnosticCodes: readonly string[]
    expectedCueIds: readonly string[]
  }>[]
}
export function authoredFixture(answerCount = 5, questionCount = 5) {
  return {
    format: "tada-show",
    version: 1,
    title: "Synthetic show library fixture",
    baseGameMode: "quiz",
    settings: [],
    cards: Array.from({ length: questionCount }, (_, i) => ({
      key: `question-${i + 1}`,
      kind: "quiz",
      question: `Synthetic question ${i + 1}`,
      timeSeconds: 20,
      answers: Array.from({ length: answerCount }, (_, j) => ({
        text: `Choice ${j + 1}`,
      })),
      correctAnswers: [1],
    })),
  }
}
export function previewInputFixture(
  show: unknown = authoredFixture(),
): PreviewDraftInput {
  const authoredShowJson = JSON.stringify(show)
  return {
    portVersion: 3,
    identityRuleVersion: 2,
    authoredShowJson,
    identityMap: derivePreviewIdentityMap(authoredShowJson),
    assets: [],
    context: {
      mode: "demo",
      role: "spectator",
      locale: "en",
      reducedMotion: false,
      join: "unavailable-demo",
      actions: "synthetic-only",
    },
  }
}
export const sharedPreviewFixtures: readonly SharedPreviewFixture[] = [
  {
    fixtureId: "demo-5q-20s-foundation-unavailable",
    portVersion: 3,
    identityRuleVersion: 2,
    input: previewInputFixture(),
    manifest: { portVersion: 3, identityRuleVersion: 2, pins: [] },
    checkpoints: [
      {
        phase: "voting",
        clock: {
          epoch: 1,
          sequence: 1,
          elapsedMs: 0,
          deadlineMs: 20000,
          paused: false,
        },
        intents: [],
        expectedResolution: "unavailable",
        expectedVisibleBindingIds: ["question", "choices", "clock"],
        forbiddenBindingIds: [
          "joinUrl",
          "roomPin",
          "participantPhone",
          "solutionAnswerIds",
          "futureQuestions",
        ],
        expectedAnswerIds: ["a1", "a2", "a3", "a4", "a5"],
        expectedDiagnosticCodes: ["adapter-unimplemented"],
        expectedCueIds: [],
      },
    ],
  },
]

export const snapshotFixture = () => ({
  portVersion: 3,
  identityRuleVersion: 2,
  source: "deterministic-fixture",
  phase: "voting",
  clock: {
    epoch: 1,
    sequence: 1,
    elapsedMs: 0,
    deadlineMs: 20000,
    paused: false,
  },
  question: {
    id: "q1",
    text: "Current synthetic question",
    questionType: "single",
    playMode: "quiz",
    choices: Array.from({ length: 5 }, (_, i) => ({
      id: `a${i + 1}`,
      label: `Choice ${i + 1}`,
    })),
    solutionAnswerIds: ["a1"],
  },
  selectedAnswerIds: ["a2"],
  canAnswer: true,
  responders: 0,
  eligible: 5,
  results: Array.from({ length: 5 }, (_, i) => ({
    answerId: `a${i + 1}`,
    count: 0,
    percent: 0,
    correct: i === 0,
    winner: false,
  })),
  personalResult: { correct: false, points: 0, rank: 0 },
  leaders: [{ label: "Synthetic leader", score: 0, rank: 1 }],
})
