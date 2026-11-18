import {
  isQuizExtrasV2,
  nativeBundleToAuthoredShow,
  resolveCardStageAnimations,
  resolveQuestionDecoration,
  resolveShowTheme,
  resolveTadazzStageBackground,
} from "@razzia/extensions/core"
import {
  calculateRevealState,
  NativeRazziaQuestion,
  LiveEditorStagePreview,
  QuestionUnderline,
  ShowThemeScope,
  showThemeStyle,
  showViewportStyle,
} from "@razzia/extensions/presentation"
import { STATUS } from "@razzia/common/types/game/status"
import defaultBackground from "@razzia/web/assets/background.png"
import { getBranding } from "@razzia/web/branding"
import Button from "@razzia/web/components/Button"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import { NativeGameSurface } from "@razzia/web/features/game/components/tadazz-show/NativeGameLayout"
import { ChoiceResultsView } from "@razzia/web/features/game/components/tadazz-show/choice-results-view"
import { QUESTION_PRESENTATIONS } from "@razzia/web/features/questions/presentation"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useInstalledThemeCatalog } from "../studio/installed-theme-catalog"
import { useStudioEditor } from "../studio/studio-editor-context"
import { Eye, EyeOff, RotateCcw } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useId, useMemo, useState } from "react"
import { useFormContext, useWatch } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { EditorPreviewViewport } from "./EditorPreviewViewport"
import { EditorCanvasFrame } from "../studio/EditorCanvasFrame"

type PreviewPhase = "question" | "answers" | "results"

/** Native presentational components only: no save, room, score or socket owner. */
export function QuestionLivePreview({
  workspace = false,
}: {
  workspace?: boolean
}) {
  const { t, i18n } = useTranslation()
  const id = useId()
  const {
    currentQuestion: question,
    currentQuestionId,
    extras,
    gameMode,
    questions,
    questionIds,
  } = useQuizzEditor()
  const { defaults, timeline, scenes, selectedTimelineIndex } =
    useStudioEditor()
  const { control } = useFormContext<QuizzFormValues>()
  const subject = useWatch({ control, name: "subject" })
  const registry = useInstalledThemeCatalog()
  const reducedMotion = useReducedMotion()
  const [phase, setPhase] = useState<PreviewPhase>("answers")
  const [aspect, setAspect] = useState<"16:9" | "4:3">("16:9")
  const [visible, setVisible] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [replay, setReplay] = useState(0)
  const [animatedQuestion, setAnimatedQuestion] = useState<
    typeof question | null
  >(null)
  const perQuestion = extras?.perQuestion[currentQuestionId]
  const visuals = perQuestion?.answerVisuals
  const animations = resolveCardStageAnimations({
    questionEntrance: perQuestion?.questionEntrance,
    stageAnimations: perQuestion?.stageAnimations,
    globalStageAnimations: defaults.stageAnimations,
  })
  const decoration = resolveQuestionDecoration({
    cardDecoration: perQuestion?.questionDecoration,
    globalDecoration: defaults.questionDecoration,
  })
  const theme = resolveShowTheme({
    selection: defaults.showTheme,
    scope: perQuestion?.themeOverrides,
    role: "manager",
    registry,
  })
  const background = resolveTadazzStageBackground({
    settings: defaults.tadazzBackground,
    cardBackground: perQuestion?.background,
    originalUrl: getBranding()?.background ?? defaultBackground,
    reducedMotion: true,
  })
  const fallbackBackground =
    background.source === "original"
      ? showViewportStyle(theme, null, STATUS.SHOW_QUESTION)
      : undefined
  const title =
    question.question ||
    t(
      "extensions:editorPreview.emptyQuestion",
      "Your question will appear here",
    )
  const answers = question.answers.map(
    (answer, number) =>
      answer ||
      t("extensions:editorPreview.emptyAnswer", {
        number: number + 1,
        defaultValue: "Answer {{number}}",
      }),
  )
  const survey = (question.playMode ?? gameMode) === "survey"
  const Answer = QUESTION_PRESENTATIONS[question.type].AnswerComponent
  const key = `${currentQuestionId}:${phase}:${replay}`
  const resultData = {
    question: title,
    answers,
    responses: {},
    type: question.type,
    solutions: survey ? [] : question.solutions,
    options: question.options,
  }
  const percentages = Object.fromEntries(answers.map((_, index) => [index, 0]))
  const reveal =
    question.media?.type === "image" ? perQuestion?.reveal : undefined
  const revealTime = revealed ? (reveal?.durationMs ?? 0) : 0

  const authoredSource = useMemo(() => {
    if (!extras) {
      return null
    }

    try {
      return nativeBundleToAuthoredShow(
        {
          quizz: { subject, questions, gameMode },
          extras: isQuizExtrasV2(extras)
            ? { ...extras, timeline, scenes, defaults, questionIds }
            : extras,
        },
        { includePrivateRoster: false },
      )
    } catch {
      return null
    }
  }, [
    extras,
    questions,
    questionIds,
    gameMode,
    subject,
    defaults,
    timeline,
    scenes,
  ])
  const authoredKey = `Q${String(timeline.slice(0, selectedTimelineIndex + 1).filter((item) => item.kind === "question").length).padStart(2, "0")}`

  const stageContent = (
    <ShowThemeScope theme={theme}>
      <div
        data-testid="question-preview-native-stage"
        data-show-theme={theme.definition.id}
        style={showThemeStyle(theme)}
        className="overflow-hidden rounded-xl"
      >
        <EditorPreviewViewport
          aspect={aspect}
          animate={!reducedMotion && animatedQuestion === question}
        >
          <div
            className="bg-secondary absolute inset-0"
            style={
              fallbackBackground ?? {
                backgroundImage: background.url
                  ? `url(${JSON.stringify(background.url)})`
                  : undefined,
                backgroundSize: background.fit,
                backgroundPosition:
                  perQuestion?.background?.position ?? "center",
              }
            }
          />
          {background.overlayOpacity > 0 && (
            <div
              className="pointer-events-none absolute inset-0 bg-black"
              style={{
                opacity: background.overlayOpacity,
              }}
            />
          )}
          <LiveEditorStagePreview
            source={authoredSource}
            authoredKey={authoredKey}
            phase={phase === "answers" ? "answerCards" : phase}
            locale={i18n.language}
            timeline={timeline}
            paused={Boolean(reducedMotion) || animatedQuestion !== question}
            replay={replay}
            mediaRevealed={revealed}
          >
            <NativeGameSurface theme={theme}>
              {phase === "question" && (
                <>
                  <NativeRazziaQuestion
                    data={{
                      question: title,
                      media: question.media,
                      cooldown: question.cooldown,
                    }}
                    stageAnimations={animations}
                    questionDecoration={decoration}
                    epoch={key}
                    reveal={reveal}
                    isManuallyRevealed={revealed}
                    controlledTimeMs={0}
                    controlledPaused
                    revealTimeMs={revealTime}
                  />
                  {question.media && question.media.type !== "image" && (
                    <div className="relative z-10 mx-auto flex w-full justify-center">
                      <QuestionMedia
                        media={question.media}
                        autoPlay={false}
                        alt={title}
                      />
                    </div>
                  )}
                </>
              )}
              {phase === "results" &&
                (question.type === "estimation" ? (
                  <QUESTION_PRESENTATIONS.estimation.ResponsesComponent
                    data={resultData}
                  />
                ) : (
                  <ChoiceResultsView
                    data={resultData}
                    extensionState={{
                      epoch: replay,
                      questionId: currentQuestionId,
                      extras: {
                        stageAnimations: perQuestion?.stageAnimations,
                        questionEntrance: perQuestion?.questionEntrance,
                        defaults,
                      },
                    }}
                    reveal={{
                      answerVisuals: visuals,
                      isSurvey: survey,
                      revealDistribution: undefined,
                      targetPercentages: percentages,
                      timelineState: calculateRevealState({
                        timelineKey: key,
                        targetPercentages: percentages,
                        reducedMotion: true,
                        isSurvey: survey,
                      }),
                    }}
                  />
                ))}
              {phase === "answers" && (
                <>
                  <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 py-3">
                    <h2
                      data-testid="question-preview-title"
                      className="max-w-5xl text-center text-4xl leading-tight font-bold break-words text-white drop-shadow-lg"
                    >
                      {title}
                    </h2>
                    <QuestionUnderline
                      decoration={decoration}
                      controlledTimeMs={0}
                      controlledPaused
                      className="flex w-64 items-center justify-center"
                      playerClassName="h-5 w-full"
                    />
                    {question.media && (
                      <QuestionMedia
                        media={question.media}
                        alt={title}
                        autoPlay={false}
                        reveal={reveal}
                        isManuallyRevealed={revealed}
                        controlledTimeMs={revealTime}
                        isManager
                      />
                    )}
                  </div>
                  <Answer
                    key={currentQuestionId}
                    answers={answers}
                    options={question.options}
                    visuals={visuals}
                    stageAnimations={animations}
                    animationEpochKey={key}
                    onSubmit={() => undefined}
                    readOnly
                  />
                </>
              )}
            </NativeGameSurface>
          </LiveEditorStagePreview>
        </EditorPreviewViewport>
      </div>
    </ShowThemeScope>
  )

  return (
    <section
      data-testid="question-live-preview"
      data-question-id={currentQuestionId}
      data-preview-phase={phase}
      className={
        workspace
          ? "native-question-preview relative z-10"
          : "border-accent bg-background relative z-10 flex min-w-0 flex-col gap-3 self-start rounded-xl border p-3 shadow-sm sm:p-4"
      }
      aria-labelledby={workspace ? undefined : id}
      aria-label={
        workspace
          ? t("extensions:editorPreview.title", "Live preview")
          : undefined
      }
    >
      {!workspace && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id={id}
            className="text-foreground flex items-center gap-2 text-sm font-bold"
          >
            <Eye className="size-4" aria-hidden="true" />
            {t("extensions:editorPreview.title", "Live preview")}
          </h2>
          <Button
            type="button"
            size="sm"
            className="bg-accent text-foreground"
            aria-expanded={visible}
            aria-controls={`${id}-content`}
            onClick={() => setVisible((value) => !value)}
          >
            {visible ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
            {visible
              ? t("extensions:editorPreview.hide", "Hide preview")
              : t("extensions:editorPreview.show", "Show preview")}
          </Button>
        </div>
      )}
      {(visible || workspace) && (
        <div
          id={`${id}-content`}
          className={
            workspace
              ? "native-question-preview-content"
              : "flex min-w-0 flex-col gap-3"
          }
        >
          {!workspace && (
            <p className="text-muted-foreground text-xs">
              {t(
                "extensions:editorPreview.description",
                "Updates as you edit. No save or live game is needed.",
              )}
            </p>
          )}
          <div
            className={
              workspace
                ? "native-question-preview-tools"
                : "flex flex-wrap items-center justify-between gap-2"
            }
          >
            <ToggleGroup
              value={phase}
              onChange={setPhase}
              className={
                workspace
                  ? "h-9 shrink-0"
                  : "h-auto min-h-10 max-w-full flex-wrap"
              }
              items={[
                {
                  value: "question",
                  label: t("extensions:editorPreview.question", "Question"),
                },
                {
                  value: "answers",
                  label: t("extensions:editorPreview.answers", "Answers"),
                },
                {
                  value: "results",
                  label: t("extensions:editorPreview.results", "Results"),
                },
              ]}
              itemMetadata={(value) => ({
                "data-testid": `question-preview-phase-${value}`,
              })}
            />
            <div
              role="group"
              aria-label={t(
                "extensions:editorPreview.aspectRatio",
                "Preview aspect ratio",
              )}
              dir="ltr"
            >
              <ToggleGroup
                dir="ltr"
                value={aspect}
                onChange={setAspect}
                items={[
                  { value: "16:9", label: "16:9" },
                  { value: "4:3", label: "4:3" },
                ]}
                itemMetadata={(value) => ({
                  "data-testid": `question-preview-aspect-${value.replace(":", "-")}`,
                })}
              />
            </div>
          </div>
          {workspace ? (
            <EditorCanvasFrame aspect={aspect}>
              {stageContent}
            </EditorCanvasFrame>
          ) : (
            stageContent
          )}
          <div
            className={
              workspace
                ? "native-question-preview-footer"
                : "flex flex-wrap items-center gap-2"
            }
          >
            <Button
              type="button"
              size="sm"
              className="bg-accent text-foreground"
              onClick={() => {
                setAnimatedQuestion(question)
                setReplay((value) => value + 1)
              }}
              disabled={Boolean(reducedMotion)}
              data-testid="question-preview-replay"
            >
              <RotateCcw className="size-4" />
              {t("extensions:editorPreview.replay", "Replay animation")}
            </Button>
            {reveal && reveal.effect !== "none" && phase !== "results" && (
              <Button
                type="button"
                size="sm"
                className="bg-accent text-foreground"
                aria-pressed={revealed}
                data-testid="question-preview-reveal"
                onClick={() => setRevealed((value) => !value)}
              >
                {revealed
                  ? t("extensions:editorPreview.resetImage", "Reset image")
                  : t("extensions:editorPreview.showImage", "Reveal image")}
              </Button>
            )}
          </div>
          {phase === "results" && (
            <p className="text-muted-foreground text-xs" role="note">
              {t(
                "extensions:editorPreview.noResponses",
                "Preview only — no responses have been collected.",
              )}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
