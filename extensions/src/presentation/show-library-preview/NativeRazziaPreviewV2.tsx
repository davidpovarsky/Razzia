import type { Ref } from "react"
import AnswerButton from "../../../../packages/web/src/features/game/components/AnswerButton"
import QuestionEntrance from "../../../../packages/web/src/features/game/components/QuestionEntrance"
import type { NativePreviewRendererInputV2 } from "../../core/show-library/native-preview-renderer-v2-schema"
import { resolveCardStageAnimations } from "../../core/card-appearance"
import { showThemeStyle } from "../show-themes/context"
import type { ResolvedShowTheme } from "../../core/show-themes/resolve"
import { previewNativeLabels } from "./i18n"
import "../legacy-effects.css"
import "./native-razzia-preview-v2.css"
import "./native-razzia-utilities-v2.css"

// Exact native AnswerButton palette from packages/web/src/index.css.
const colors = ["#e69f00", "#56b4e9", "#3dbfa0", "#cc79a7", "#0072b2"]

/** Read-only frame adapter for the genuine upstream native visual primitives.
 * No upstream gameplay hook, socket, player store, scoring or audio is mounted.
 * Clock text is a projection of the host frame; this component never ticks time.
 */
export function NativeRazziaPreviewV2({
  input,
  theme,
  rootRef,
}: {
  input: NativePreviewRendererInputV2
  theme: ResolvedShowTheme
  rootRef?: Ref<HTMLDivElement>
}) {
  const { frame, themeBinding } = input
  const animations = resolveCardStageAnimations({
    stageAnimations: themeBinding.settings.stageAnimations,
  })
  const decoration = themeBinding.settings.questionDecoration
  const translated = previewNativeLabels(input.locale)
  const labels = translated.v4Labels
  const results = frame.phase === "results"
  const epoch = `${frame.epoch}:${frame.question.id}:${results}`
  const remaining =
    frame.clock.deadlineMs === null
      ? null
      : Math.max(
          0,
          Math.ceil((frame.clock.deadlineMs - frame.clock.elapsedMs) / 1000),
        )
  return (
    <div
      ref={rootRef}
      className="native-razzia-preview-v2"
      style={showThemeStyle(theme)}
      data-testid="native-razzia-preview-v2"
      data-native-renderer="razzia-native-stage"
      data-role={frame.role}
      data-phase={frame.phase}
      data-static-motion={
        input.reducedMotion || frame.clock.paused ? "true" : "false"
      }
    >
      <QuestionEntrance
        entrance={animations.questionEntrance}
        epoch={epoch}
        className="native-razzia-question"
      >
        <h2 data-testid="native-razzia-question">{frame.question.text}</h2>
        {decoration.enabled && decoration.preset !== "none" && (
          <div
            className="native-razzia-decoration"
            data-tada-underline={decoration.preset}
          >
            <div className={`tada-underline-${decoration.preset}`} />
          </div>
        )}
      </QuestionEntrance>
      {frame.phase === "voting" && (
        <output data-testid="native-razzia-clock">
          {remaining === null ? labels.votingOpen : remaining}
        </output>
      )}
      {frame.phase === "voteLocked" && <p>{translated.labels.votesLocked}</p>}
      {results && <p>{labels.audienceResults}</p>}
      {frame.phase !== "question" && (
        <div className="native-razzia-answers">
          {frame.choices.map((choice, index) => {
            const result = frame.results?.find(
              (value) => value.answerId === choice.id,
            )
            const correct =
              results && frame.question.mode === "quiz"
                ? result?.correct
                : undefined
            return (
              <AnswerButton
                key={`${epoch}:${choice.id}`}
                label={String(index + 1)}
                answerIndex={index}
                cardEntrance={
                  results
                    ? animations.resultsRevealEntrance
                    : animations.answerEntrance
                }
                badgeEntrance={animations.answerBadgeEntrance}
                animationEpochKey={epoch}
                disabled
                aria-disabled="true"
                correct={correct}
                percentage={results ? result?.percent : undefined}
                count={results ? result?.count : undefined}
                data-testid={`native-razzia-answer-${index}`}
                style={{
                  background:
                    correct === undefined
                      ? colors[index]
                      : correct
                        ? "#059669"
                        : "#b91c1c",
                }}
              >
                {choice.label}
              </AnswerButton>
            )
          })}
        </div>
      )}
    </div>
  )
}
