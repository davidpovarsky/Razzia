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
  NativeQuestionHeading,
  LiveEditorStagePreview,
  createDemoClock,
  observeQuestionPresentation,
  ShowThemeScope,
  showThemeStyle,
  showViewportStyle,
} from "@razzia/extensions/presentation"
import { STATUS } from "@razzia/common/types/game/status"
import {
  QUESTION_LEAD_IN_MS,
  QUESTION_LEAD_IN_SECONDS,
} from "@razzia/common/constants"
import AnswerCountdown from "@razzia/web/features/game/components/AnswerCountdown"
import defaultBackground from "@razzia/web/assets/background.png"
import { getBranding } from "@razzia/web/branding"
import Button from "@razzia/web/components/Button"
import { PresentationControls } from "@razzia/extensions/platform-ui"
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
import { Eye, EyeOff } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
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
  const [phase, setPhase] = useState<PreviewPhase>("question")
  const [aspect, setAspect] = useState<"16:9" | "4:3">("16:9")
  const [visible, setVisible] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [replay, setReplay] = useState(0)
  const [animatedQuestion, setAnimatedQuestion] = useState<
    typeof question | null
  >(null)
  const previewRoot = useRef<HTMLDivElement>(null)
  const currentQuestionRef = useRef(question)
  currentQuestionRef.current = question
  const cancelPresentation = useRef<() => void>(() => undefined)
  const [presentedReplay, setPresentedReplay] = useState<number | null>(null)
  const [previewClock] = useState(() => createDemoClock())
  const [playback, setPlayback] = useState(() => previewClock.snapshot())
  useEffect(() => {
    if (animatedQuestion !== question) {
      cancelPresentation.current()
      previewClock.pause()

      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined = undefined
    const tick = () => {
      const current = previewClock.snapshot()
      setPlayback(current)

      if (current.elapsedMs >= QUESTION_LEAD_IN_MS) {
        setPhase(
          current.deadlineMs !== null && current.elapsedMs >= current.deadlineMs
            ? "results"
            : "answers",
        )
      }

      if (
        current.deadlineMs === null ||
        current.elapsedMs < current.deadlineMs
      ) {
        const boundary =
          current.elapsedMs < QUESTION_LEAD_IN_MS
            ? QUESTION_LEAD_IN_MS
            : current.deadlineMs
        timer = setTimeout(
          tick,
          boundary === null
            ? 50
            : Math.min(50, Math.max(0, boundary - current.elapsedMs)),
        )
      }
    }
    tick()

    return () => clearTimeout(timer)
  }, [animatedQuestion, question, previewClock, replay])
  useEffect(() => () => cancelPresentation.current(), [])
  useEffect(() => {
    if (!visible) {
      cancelPresentation.current()
    }
  }, [visible])
  const onQuestionCommitted = useCallback(
    (committedReplay: number) => {
      const root = previewRoot.current

      if (
        !root ||
        !visible ||
        animatedQuestion !== question ||
        phase !== "question" ||
        committedReplay !== replay ||
        !previewClock.snapshot().paused
      ) {
        return
      }

      cancelPresentation.current()
      cancelPresentation.current = observeQuestionPresentation(
        root,
        () => {
          if (
            currentQuestionRef.current !== question ||
            previewClock.snapshot().epoch !== committedReplay
          ) {
            return
          }

          // Commit the visible reading phase before starting its one clock.
          // Renderer loading and opacity-zero entrance frames consume no reading time.
          flushSync(() => setPresentedReplay(committedReplay))
          previewClock.play()
          setPlayback(previewClock.snapshot())
        },
        { packageReady: true },
      )
    },
    [animatedQuestion, phase, previewClock, question, replay, visible],
  )
  const replayQuestion = () => {
    cancelPresentation.current()
    setPresentedReplay(null)
    previewClock.replay()

    if (question.time > 0) {
      previewClock.startVoting(question.time, QUESTION_LEAD_IN_MS)
    }

    setPlayback(previewClock.snapshot())
    setPhase("question")
    setAnimatedQuestion(question)
    setReplay((value) => value + 1)
  }
  const selectPhase = (next: PreviewPhase) => {
    cancelPresentation.current()
    previewClock.pause()
    setAnimatedQuestion(null)
    setPhase(next)
  }
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
  const key = `${currentQuestionId}:${replay}`
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

  let votingDeadlineMs = question.time > 0 ? question.time * 1000 : null

  if (animatedQuestion === question) {
    votingDeadlineMs = playback.deadlineMs
  }

  if (phase !== "answers") {
    votingDeadlineMs = null
  }

  let votingSeconds = question.time > 0 ? question.time : null

  if (
    votingSeconds !== null &&
    animatedQuestion === question &&
    playback.deadlineMs !== null
  ) {
    votingSeconds = Math.max(
      0,
      Math.ceil((playback.deadlineMs - playback.elapsedMs) / 1000),
    )
  }

  const stageContent = (
    <ShowThemeScope theme={theme}>
      <div
        ref={previewRoot}
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
            phase={phase === "answers" ? "voting" : phase}
            locale={i18n.language}
            timeline={timeline}
            paused={animatedQuestion !== question}
            elapsedMs={animatedQuestion === question ? playback.elapsedMs : 0}
            deadlineMs={votingDeadlineMs}
            replay={replay}
            mediaRevealed={revealed}
            onQuestionCommitted={onQuestionCommitted}
          >
            <NativeGameSurface theme={theme}>
              <NativeQuestionHeading
                question={title}
                stageAnimations={animations}
                questionDecoration={decoration}
                epoch={key}
                titleTestId="question-preview-title"
                controlledTimeMs={playback.elapsedMs}
                controlledPaused={animatedQuestion !== question}
              />
              {phase === "question" && (
                <>
                  <NativeRazziaQuestion
                    hideHeading
                    data={{
                      question: title,
                      media: question.media,
                      cooldown: QUESTION_LEAD_IN_SECONDS,
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
                    hideHeading
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
                  <AnswerCountdown
                    seconds={votingSeconds}
                    totalSeconds={question.time}
                    variant="display"
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
      data-preview-phase={
        phase === "question" &&
        animatedQuestion === question &&
        presentedReplay !== replay
          ? "preparing"
          : phase
      }
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
              onChange={selectPhase}
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
            <PresentationControls
              replay={{
                onClick: replayQuestion,
                testId: "question-preview-replay",
              }}
              reveal={
                reveal && reveal.effect !== "none" && phase !== "results"
                  ? {
                      revealed,
                      onClick: () => setRevealed((value) => !value),
                      testId: "question-preview-reveal",
                    }
                  : undefined
              }
            />
          </div>
          {/* Keep the canvas position stable when the results note appears. */}
          <p
            className="text-muted-foreground text-xs"
            role="note"
            aria-hidden={phase !== "results"}
            style={{ visibility: phase === "results" ? "visible" : "hidden" }}
          >
            {t(
              "extensions:editorPreview.noResponses",
              "Preview only — no responses have been collected.",
            )}
          </p>
        </div>
      )}
    </section>
  )
}
