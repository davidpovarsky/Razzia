import type { StatusDataMap } from "@razzia/common/types/game/status"
import { useState } from "react"
import clsx from "clsx"
import { useViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import { NativeQuestionHeading } from "./QuestionPresentation"
import { useQuestionPresentation } from "../tadazz-show/use-question-presentation"
import Question from "./Question"
import Answers from "./Answers"
import Responses from "./Responses"

type QuestionRoundData =
  | StatusDataMap["SHOW_QUESTION"]
  | StatusDataMap["SELECT_ANSWER"]
  | StatusDataMap["SHOW_RESPONSES"]

/**
 * The registry uses this same component for the question, voting and result phases.
 * Phase bodies can change, but the question heading and its entrance never remount
 * during an automatic transition. Re-entering the lead-in deliberately replays it.
 */
export default function QuestionRound({ data }: { data: QuestionRoundData }) {
  const viewRole = useViewRole()
  const phase = (() => {
    if ("responses" in data) {
      return "results" as const
    }

    if ("answers" in data) {
      return "voting" as const
    }

    return "question" as const
  })()
  const { effectiveExtensionState, stageAnimations, questionDecoration } =
    useQuestionPresentation(
      data.question,
      phase === "question" ? "show" : "answers",
    )
  const identity = String(
    data.questionId ?? data.questionNumber ?? data.question,
  )
  // Status and extension packets are separate. Do not bind the previous question's
  // decoration/entrance while its successor is waiting for the matching envelope.
  const presentationReady =
    !data.questionId || effectiveExtensionState?.questionId === data.questionId
  const [presentation, setPresentation] = useState(() => ({
    identity,
    phase,
    ready: presentationReady,
    sequence: 0,
    stageAnimations: {
      ...stageAnimations,
      // A reconnect already in voting/results must render the current state directly.
      questionEntrance:
        phase === "question"
          ? stageAnimations.questionEntrance
          : { ...stageAnimations.questionEntrance, preset: "none" as const },
    },
    questionDecoration,
  }))

  // React immediately retries this component before committing children. Keeping this
  // state in the round owner prevents a network epoch for a new phase from replaying
  // the heading, while a new question or intentional return to its lead-in can animate.
  if (
    presentation.identity !== identity ||
    (phase === "question" && presentation.phase !== "question") ||
    (!presentation.ready && presentationReady)
  ) {
    setPresentation({
      identity,
      phase,
      ready: presentationReady,
      sequence: presentation.sequence + 1,
      stageAnimations: {
        ...stageAnimations,
        questionEntrance:
          phase === "question"
            ? stageAnimations.questionEntrance
            : { ...stageAnimations.questionEntrance, preset: "none" as const },
      },
      questionDecoration,
    })
  } else if (presentation.phase !== phase) {
    setPresentation({ ...presentation, phase })
  }

  if (!presentation.ready) {
    return null
  }

  const questionOnly = phase === "question"
  const hidePlayerQuestion =
    viewRole === "player" &&
    phase === "voting" &&
    "answersOnly" in data &&
    data.answersOnly

  return (
    <section
      data-native-question-round
      data-question-phase={phase}
      data-question-id={identity}
      className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden"
    >
      <div
        aria-hidden={hidePlayerQuestion || undefined}
        className={clsx(
          "mx-auto min-h-0 w-full max-w-7xl flex-col items-center px-2 pt-1 sm:pt-2",
          hidePlayerQuestion ? "hidden" : "flex",
          questionOnly
            ? "flex-1 justify-center gap-2 sm:gap-4"
            : "shrink-0 justify-start pb-1",
        )}
      >
        <NativeQuestionHeading
          question={data.question}
          stageAnimations={presentation.stageAnimations}
          questionDecoration={presentation.questionDecoration}
          epoch={[presentation.identity, presentation.sequence].join(":")}
          compact={!questionOnly}
          titleTestId={
            questionOnly ? "show-question-title" : "game-question-title"
          }
          controlledPaused={effectiveExtensionState?.pause?.paused}
        />
        {!("answers" in data) && <Question data={data} hideHeading />}
      </div>
      {(() => {
        if ("responses" in data) {
          return <Responses data={data} hideHeading />
        }

        if ("answers" in data) {
          return <Answers data={data} hideHeading />
        }

        return null
      })()}
    </section>
  )
}
