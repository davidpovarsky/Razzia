import {
  collapseForResume,
  planTransition,
  type StageSnapshot,
  type StageStep,
} from "../tadazz-show/show-director"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import type { StageQuestion } from "../tadazz-show/TadazzStage"
import { previewVotingDeadline } from "./preview-clock"
import {
  nativePreviewFrameV1Schema,
  type NativePreviewFrameV1,
} from "../../core/show-library/native-preview-frame-schema"

/** Shared payload-only ABI; host association is established before this boundary. */
export interface NativePreviewPresentation {
  background?: { url: string; fit: "contain" | "cover" }
  answerVisuals: ReadonlyArray<{
    answerId: string
    url: string
    alt: string
    display: "image" | "both"
  }>
}

export type PreviewFrame = NativePreviewFrameV1

export function validatePreviewFrame(value: PreviewFrame): void {
  nativePreviewFrameV1Schema.parse(value)
}

// oxlint-disable-next-line max-params -- Preserve the existing positional native API with optional admitted presentation.
export function previewSteps(
  frame: PreviewFrame,
  previous: ShowScene | null,
  stage: StageSnapshot,
  wallNow: number,
  presentation?: NativePreviewPresentation,
): { steps: StageStep[]; scene: ShowScene | null } {
  validatePreviewFrame(frame)
  const q: StageQuestion = {
    key: frame.question.id,
    question: frame.question.text,
    number: frame.question.ordinal,
    totalQuestions: frame.question.totalQuestions,
    options:
      frame.phase === "question"
        ? []
        : frame.choices.map((choice) => {
            const visual = presentation?.answerVisuals.find(
              (v) => v.answerId === choice.id,
            )

            return {
              label: choice.label,
              ...(visual
                ? {
                    image: visual.url,
                    alt: visual.alt,
                    display: visual.display,
                  }
                : {}),
            }
          }),
  }

  if (frame.phase === "answerCards") {
    return { steps: [{ op: "presentOptions", question: q }], scene: previous }
  }

  if (frame.phase === "voteLocked") {
    return { steps: [{ op: "lockVoting" }], scene: previous }
  }

  let scene: ShowScene | undefined = undefined

  if (frame.phase === "question") {
    scene = { kind: "question", key: `question:${q.key}`, question: q }
  } else if (frame.phase === "voting") {
    const deadline = previewVotingDeadline(frame.clock, wallNow)
    scene = {
      kind: "voting",
      key: `voting:${q.key}`,
      question: q,
      questionType: frame.question.type,
      seconds: frame.seconds,
      remainingSeconds: deadline === null ? null : deadline.remainingMs / 1000,
      ...(deadline === null ? {} : { votingEndsAt: deadline.wallDeadlineMs }),
      totalPlayers: 0,
      answers: [],
    }
  } else {
    const results = frame.results!
    const ordered = frame.choices.map((choice) =>
      results.find((r) => r.answerId === choice.id)!,
    )
    scene = {
      kind: "results",
      key: `results:${q.key}`,
      question: q,
      questionType: frame.question.type,
      reveal: {
        counts: ordered.map((r) => r.count),
        percentages: ordered.map((r) => r.percent),
        mode: frame.question.mode,
        ...(frame.question.mode === "quiz"
          ? {
              solutions: ordered.flatMap((r, i) =>
                r.correct === true ? [i] : [],
              ),
            }
          : {}),
      },
    }
  }

  return { steps: planTransition(previous, scene, stage, wallNow), scene }
}

/**
 * Rebuild only the current phase, without a fabricated voting scene.
 * Also used for a newly selected current-card snapshot; does not pause its clock.
 */

export function pausedPreviewSteps(
  frame: PreviewFrame,
  wallNow: number,
  presentation?: NativePreviewPresentation,
): { steps: StageStep[]; scene: ShowScene | null } {
  if (frame.phase === "answerCards" || frame.phase === "voteLocked") {
    const cards = previewSteps(
      { ...frame, phase: "answerCards" },
      null,
      { mode: "idle", questionKey: null },
      wallNow,
      presentation,
    )
    const [step] = cards.steps

    if (step?.op !== "presentOptions") {
      throw new Error("show-preview:invalid-resume")
    }

    const steps: StageStep[] = [{ op: "showQuestion", question: step.question }]

    if (frame.phase === "voteLocked") {
      steps.push({ op: "lockVoting" })
    }

    return {
      steps,
      scene: {
        kind: "question",
        key: `question:${step.question.key}`,
        question: step.question,
      },
    }
  }

  const planned = previewSteps(
    frame,
    null,
    { mode: "idle", questionKey: null },
    wallNow,
    presentation,
  )

  return { steps: collapseForResume(planned.steps), scene: planned.scene }
}
