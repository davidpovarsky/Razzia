import type { NativePreviewPresentation } from "./stage-scene-adapter"
import { useMemo, type Ref } from "react"
import AnswerButton from "../../../../packages/web/src/features/game/components/AnswerButton"
import PhotoCardGrid from "../../../../packages/web/src/features/game/components/PhotoCardGrid"
import { StageFitContainer } from "../stage-fit"
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

// Read-only frame adapter for the genuine upstream native visual primitives.
// No upstream gameplay hook, socket, player store, scoring or audio is mounted.
// Clock text is a projection of the host frame; this component never ticks time.
export function NativeRazziaPreviewV2({
  input,
  theme,
  rootRef,
  presentation,
  continuousPlayback = false,
  selectedAnswer = null,
  onSelectAnswer,
}: {
  input: NativePreviewRendererInputV2
  theme: ResolvedShowTheme
  rootRef?: Ref<HTMLDivElement>
  presentation?: NativePreviewPresentation
  continuousPlayback?: boolean
  selectedAnswer?: number | null
  onSelectAnswer?: (index: number) => void
}) {
  const { frame, themeBinding } = input
  const animations = resolveCardStageAnimations({
    stageAnimations: themeBinding.settings.stageAnimations,
  })
  const decoration = themeBinding.settings.questionDecoration
  const translated = previewNativeLabels(input.locale)
  const labels = translated.v4Labels
  const results = frame.phase === "results"
  const answers = useMemo(
    () => frame.choices.map((choice) => choice.label),
    [frame.choices],
  )
  const visuals = useMemo(
    () =>
      frame.choices.flatMap((choice, answerIndex) => {
        const visual = presentation?.answerVisuals.find(
          (value) => value.answerId === choice.id,
        )

        return visual
          ? [
              {
                answerIndex,
                display: visual.display,
                url: visual.url,
                alt: visual.alt,
              },
            ]
          : []
      }),
    [frame.choices, presentation],
  )
  const counts = Object.fromEntries(
    frame.choices.map((choice, index) => [
      index,
      frame.results?.find((entry) => entry.answerId === choice.id)?.count ?? 0,
    ]),
  )
  const percentages = Object.fromEntries(
    frame.choices.map((choice, index) => [
      index,
      frame.results?.find((entry) => entry.answerId === choice.id)?.percent ??
        0,
    ]),
  )
  // A phase clock restart is not a new question entrance. The continuous
  // host remounts this renderer for an explicit replay/revision/new question.
  const epoch = continuousPlayback
    ? frame.question.id
    : `${frame.epoch}:${frame.question.id}:${results}`
  const photoAnimations =
    continuousPlayback && results && Object.values(counts).every((n) => n === 0)
      ? { ...animations, resultsRevealEntrance: animations.answerEntrance }
      : animations
  const remaining =
    frame.clock.deadlineMs === null
      ? null
      : Math.max(
          0,
          Math.ceil((frame.clock.deadlineMs - frame.clock.elapsedMs) / 1000),
        )

  return (
    <StageFitContainer>
      <div
        ref={rootRef}
        className="native-razzia-preview-v2"
        style={{
          ...showThemeStyle(theme),
          ...(presentation?.background
            ? {
                backgroundImage: `url(${JSON.stringify(presentation.background.url)})`,
                backgroundSize: presentation.background.fit,
                backgroundPosition: "center",
              }
            : {}),
        }}
        data-testid="native-razzia-preview-v2"
        data-native-renderer="razzia-native-stage"
        data-role={frame.role}
        data-phase={frame.phase}
        data-static-motion={
          input.reducedMotion || (!continuousPlayback && frame.clock.paused)
            ? "true"
            : "false"
        }
        data-transport-paused={
          continuousPlayback && frame.clock.paused ? "true" : "false"
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
            {remaining ?? labels.votingOpen}
          </output>
        )}
        {frame.phase === "voteLocked" && <p>{translated.labels.votesLocked}</p>}
        {results && <p>{labels.audienceResults}</p>}
        {frame.phase !== "question" && visuals.length > 0 && (
          <PhotoCardGrid
            answers={answers}
            visuals={visuals}
            readOnly={!onSelectAnswer}
            onSubmit={onSelectAnswer}
            selectedKey={selectedAnswer}
            isRevealed={results}
            isSurvey={frame.question.mode === "survey"}
            responses={results ? counts : undefined}
            percentages={results ? percentages : undefined}
            stageAnimations={photoAnimations}
            animationEpochKey={epoch}
          />
        )}
        {frame.phase !== "question" && visuals.length === 0 && (
          <div className="native-razzia-answers">
            {frame.choices.map((choice, index) => {
              const visual = presentation?.answerVisuals.find(
                (v) => v.answerId === choice.id,
              )

              const result = frame.results?.find(
                (value) => value.answerId === choice.id,
              )
              const correct =
                results && frame.question.mode === "quiz"
                  ? result?.correct
                  : undefined
              let background = colors[index]

              if (correct !== undefined) {
                background = correct ? "#059669" : "#b91c1c"
              }

              return (
                <AnswerButton
                  key={`${epoch}:${choice.id}`}
                  label={String(index + 1)}
                  answerIndex={index}
                  visual={
                    visual
                      ? {
                          answerIndex: index,
                          display: visual.display,
                          url: visual.url,
                          alt: visual.alt,
                        }
                      : undefined
                  }
                  cardEntrance={
                    results && !continuousPlayback
                      ? animations.resultsRevealEntrance
                      : animations.answerEntrance
                  }
                  badgeEntrance={animations.answerBadgeEntrance}
                  animationEpochKey={epoch}
                  disabled={!onSelectAnswer}
                  aria-disabled={!onSelectAnswer}
                  selected={
                    onSelectAnswer || selectedAnswer !== null
                      ? selectedAnswer === index
                      : undefined
                  }
                  aria-pressed={
                    onSelectAnswer ? selectedAnswer === index : undefined
                  }
                  onClick={
                    onSelectAnswer ? () => onSelectAnswer(index) : undefined
                  }
                  correct={correct}
                  percentage={results ? result?.percent : undefined}
                  count={results ? result?.count : undefined}
                  data-testid={`native-razzia-answer-${index}`}
                  style={{ background }}
                >
                  {choice.label}
                </AnswerButton>
              )
            })}
          </div>
        )}
      </div>
    </StageFitContainer>
  )
}
