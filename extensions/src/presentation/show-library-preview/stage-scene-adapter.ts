import { collapseForResume, planTransition, type StageSnapshot, type StageStep } from "../tadazz-show/show-director"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import type { StageQuestion } from "../tadazz-show/TadazzStage"
import { previewVotingDeadline } from "./preview-clock"
import { previewStageMetadataSchema } from "../../core/show-library/stage-metadata-schema"

/** A current-card-only copy produced by the trusted host; no draft or asset refs. */
export interface PreviewFrame {
  phase: "question" | "answerCards" | "voting" | "voteLocked" | "results"
  role: "manager" | "spectator"
  epoch: number
  revision: number
  question: { id: string; text: string; type: "single" | "multi"; mode: "quiz" | "survey"; ordinal: number; totalQuestions: number }
  choices: Array<{ id: string; label: string }>
  results?: Array<{ answerId: string; count: number; percent: number; correct?: boolean }>
  clock: { elapsedMs: number; deadlineMs: number | null; paused: boolean }
  seconds: number | null
}

/** Fail closed before calling the native stage; never accept resource references. */
export function validatePreviewFrame(value: PreviewFrame): void {
  const q = value.question
  if (!q || !["manager", "spectator"].includes(value.role) ||
      !["question", "answerCards", "voting", "voteLocked", "results"].includes(value.phase) ||
      !["single", "multi"].includes(q.type) || !["quiz", "survey"].includes(q.mode) ||
      typeof q.id !== "string" || !q.id || q.id.length > 256 || typeof q.text !== "string" || q.text.length > 10000 ||
      !Number.isSafeInteger(value.epoch) || value.epoch < 0 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(q.ordinal) ||
      !Number.isSafeInteger(q.totalQuestions) || q.ordinal < 1 || q.ordinal > q.totalQuestions || q.totalQuestions > 128 ||
      !Array.isArray(value.choices) || (value.phase === "question" ? value.choices.length !== 0 : value.choices.length < 2 || value.choices.length > 5) ||
      !Number.isFinite(value.clock?.elapsedMs) || value.clock.elapsedMs < 0 ||
      (value.clock.deadlineMs !== null && !Number.isFinite(value.clock.deadlineMs)) ||
      typeof value.clock.paused !== "boolean" ||
      (value.seconds !== null && (!Number.isFinite(value.seconds) || value.seconds <= 0 || value.seconds > 86400))) {
    throw new Error("show-preview:unsupported-frame")
  }
  if (Object.keys(value).some((key) => !["phase", "role", "epoch", "revision", "question", "choices", "results", "clock", "seconds"].includes(key)) ||
      Object.keys(q).some((key) => !["id", "text", "type", "mode", "ordinal", "totalQuestions"].includes(key)) ||
      Object.keys(value.clock).some((key) => !["elapsedMs", "deadlineMs", "paused"].includes(key))) throw new Error("show-preview:unexpected-data")
  previewStageMetadataSchema.parse({ portVersion: 3, identityRuleVersion: 2, questionId: q.id, ordinal: q.ordinal, totalQuestions: q.totalQuestions })
  const ids = new Set<string>()
  for (const choice of value.choices) {
    if (!choice || typeof choice.id !== "string" || !choice.id || choice.id.length > 256 || ids.has(choice.id) ||
        typeof choice.label !== "string" || choice.label.length > 10000 || Object.keys(choice).some((key) => !["id", "label"].includes(key))) {
      throw new Error("show-preview:invalid-choice")
    }
    ids.add(choice.id)
  }
  if (value.phase !== "results" && value.results !== undefined) throw new Error("show-preview:early-results")
  if (value.phase === "results") {
    if (!Array.isArray(value.results) || value.results.length !== ids.size) throw new Error("show-preview:missing-results")
    const seen = new Set<string>()
    for (const result of value.results) {
      if (!ids.has(result.answerId) || seen.has(result.answerId) || !Number.isSafeInteger(result.count) || result.count < 0 ||
          !Number.isFinite(result.percent) || result.percent < 0 || result.percent > 100 ||
          (result.correct !== undefined && typeof result.correct !== "boolean") ||
          Object.keys(result).some((key) => !["answerId", "count", "percent", "correct"].includes(key))) throw new Error("show-preview:invalid-results")
      seen.add(result.answerId)
    }
  }
}

export function previewSteps(frame: PreviewFrame, previous: ShowScene | null, stage: StageSnapshot, wallNow: number): { steps: StageStep[]; scene: ShowScene | null } {
  validatePreviewFrame(frame)
  const q: StageQuestion = {
    key: frame.question.id, question: frame.question.text, number: frame.question.ordinal,
    totalQuestions: frame.question.totalQuestions,
    options: frame.phase === "question" ? [] : frame.choices.map((choice) => ({ label: choice.label })),
  }
  if (frame.phase === "answerCards") return { steps: [{ op: "presentOptions", question: q }], scene: previous }
  if (frame.phase === "voteLocked") return { steps: [{ op: "lockVoting" }], scene: previous }
  let scene: ShowScene
  if (frame.phase === "question") scene = { kind: "question", key: `question:${q.key}`, question: q }
  else if (frame.phase === "voting") {
    const deadline = previewVotingDeadline(frame.clock, wallNow)
    scene = { kind: "voting", key: `voting:${q.key}`, question: q, questionType: frame.question.type,
      seconds: frame.seconds, remainingSeconds: deadline === null ? null : deadline.remainingMs / 1000,
      ...(deadline === null ? {} : { votingEndsAt: deadline.wallDeadlineMs }), totalPlayers: 0, answers: [] }
  } else {
    const results = frame.results!
    const ordered = frame.choices.map((choice) => results.find((r) => r.answerId === choice.id)!)
    scene = { kind: "results", key: `results:${q.key}`, question: q, questionType: frame.question.type,
      reveal: { counts: ordered.map((r) => r.count), percentages: ordered.map((r) => r.percent), mode: frame.question.mode,
        ...(frame.question.mode === "quiz" ? { solutions: ordered.flatMap((r, i) => r.correct === true ? [i] : []) } : {}) } }
  }
  return { steps: planTransition(previous, scene, stage, wallNow), scene }
}

/** Rebuild only the current phase, without a fabricated voting scene. */
export function pausedPreviewSteps(frame: PreviewFrame, wallNow: number): { steps: StageStep[]; scene: ShowScene | null } {
  if (frame.phase === "answerCards" || frame.phase === "voteLocked") {
    const cards = previewSteps({ ...frame, phase: "answerCards" }, null, { mode: "idle", questionKey: null }, wallNow)
    const step = cards.steps[0]
    if (!step || step.op !== "presentOptions") throw new Error("show-preview:invalid-resume")
    const steps: StageStep[] = [{ op: "showQuestion", question: step.question }]
    if (frame.phase === "voteLocked") steps.push({ op: "lockVoting" })
    return { steps, scene: { kind: "question", key: `question:${step.question.key}`, question: step.question } }
  }
  const planned = previewSteps(frame, null, { mode: "idle", questionKey: null }, wallNow)
  return { steps: collapseForResume(planned.steps), scene: planned.scene }
}
