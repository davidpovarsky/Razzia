import { NativeRazziaQuestion, NativeQuestionHeading } from "./native-question"
import { NativeRazziaRoomPanel } from "./native-room-panel"
import { NativeRazziaPlayerResult } from "./native-player-result"
import { resolveRoomJoin } from "../room-join/contract"
import Wait from "../../../../packages/web/src/features/game/components/states/Wait"
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { I18nextProvider } from "react-i18next"
import { QUESTION_PRESENTATIONS } from "../../../../packages/web/src/features/questions/presentation"
import { NativeGameSurface } from "../../../../packages/web/src/features/game/components/tadazz-show/NativeGameLayout"
import { ChoiceResultsView } from "../../../../packages/web/src/features/game/components/tadazz-show/choice-results-view"
import AnswerCountdown from "../../../../packages/web/src/features/game/components/AnswerCountdown"
import AnswerNote from "../../../../packages/web/src/features/game/components/AnswerNote"
import QuestionMedia from "../../../../packages/web/src/components/QuestionMedia"
import type { ManagerStatusDataMap } from "../../../../packages/common/src/types/game/status"
import { StageFitContainer } from "../stage-fit"
import { ScenePresenter, type ScenePresenterProps } from "../scene-presenter"
import { calculateRevealState } from "../reveal-timeline"
import {
  type BackgroundPosition,
  resolveQuestionDecoration,
  resolveCardStageAnimations,
} from "../../core/card-appearance"
import type { ResolvedShowTheme } from "../../core/show-themes/resolve"
import {
  projectLobbyJoin,
  type SceneConfig,
} from "../../core/studio-timeline-schema"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import type { AuthoredPreviewChapter } from "../../core/show-library/full-show-preview-timeline"
import { previewNativeLabels } from "./i18n"

/** Layout/props adapter for the original views. No room, scoring or timer owner. */
export function RazziaApplicationStage({
  frame,
  chapter,
  questionEpoch,
  theme,
  scene,
  activeSceneData,
  backdropUrl,
  backdropFit,
  backdropPosition = "center",
  backdropOverlayOpacity = 0,
  onCommitted,
}: {
  frame: ApplicationPreviewFrame
  chapter: AuthoredPreviewChapter
  questionEpoch?: number | string
  theme: ResolvedShowTheme
  scene?: SceneConfig
  activeSceneData?: ScenePresenterProps["activeSceneData"]
  onCommitted: () => void
  backdropUrl?: string
  backdropFit?: "contain" | "cover"
  backdropPosition?: BackgroundPosition
  backdropOverlayOpacity?: number
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const virtual = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState({ width: 1280, height: 720, scale: 1 })
  const labels = useMemo(
    () => previewNativeLabels(frame.locale),
    [frame.locale],
  )
  const card = frame.show.cards[chapter.cardIndex]
  const key = `${frame.clock.epoch}:${chapter.id}:${frame.appearanceRevision}`
  const committed = useRef(onCommitted)
  committed.current = onCommitted
  const animatedKey = useRef("")
  useLayoutEffect(() => {
    const node = viewport.current

    if (!node) {
      return
    }

    const update = () => {
      // Local layout dimensions exclude an enclosing preview scale transform.
      const bounds = { width: node.clientWidth, height: node.clientHeight }
      const ratio = bounds.width / Math.max(1, bounds.height)
      let width = 1280

      if (ratio < 1) {
        width = 540
      } else if (ratio < 1.5) {
        width = 960
      }

      const height = 720
      const scale = Math.max(
        0.0001,
        Math.min(bounds.width / width, bounds.height / height),
      )
      setFit((previous) =>
        previous.width === width && Math.abs(previous.scale - scale) < 0.00001
          ? previous
          : { width, height, scale },
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)

    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => committed.current())
    })

    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [key])
  useLayoutEffect(() => {
    const reconstruct = animatedKey.current !== key && frame.clock.paused
    animatedKey.current = key
    for (const animation of virtual.current?.getAnimations({ subtree: true }) ??
      []) {
      if (
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target instanceof Element &&
        animation.effect.target.closest("[data-controlled-underline]")
      ) {
        continue
      }

      if (
        animation.effect instanceof KeyframeEffect &&
        animation.effect.target?.hasAttribute("data-preview-clock")
      ) {
        continue
      }

      if (frame.reducedMotion || reconstruct) {
        if (animation.effect?.getTiming().iterations === Infinity) {
          animation.cancel()
        } else {
          try {
            animation.finish()
          } catch {
            animation.cancel()
          }
        }
      } else if (frame.clock.paused) {
        animation.pause()
      } else if (animation.playState === "paused") {
        animation.play()
      }
    }
  }, [key, frame.clock.paused, frame.clock.sequence, frame.reducedMotion])

  let content: ReactNode = null
  let heading: ReactNode = null

  if (frame.stagePhase === "lobby") {
    content = (
      <NativeRazziaRoomPanel
        join={resolveRoomJoin({
          origin: "",
          role: frame.role,
          directory: projectLobbyJoin(frame.show.defaults?.lobby),
        })}
        text="game:waitingForPlayers"
      />
    )
  } else if (
    (card.kind === "quiz" || card.kind === "survey") &&
    frame.role === "player" &&
    chapter.phase === "results"
  ) {
    content =
      card.kind === "survey" ? (
        <Wait data={{ text: "game:answerNoted" }} />
      ) : (
        <NativeRazziaPlayerResult
          data={{
            correct: false,
            message: "game:wrong",
            points: 0,
            myPoints: 0,
            rank: 1,
            aheadOfMe: null,
          }}
        />
      )
  } else if (card.kind === "quiz" || card.kind === "survey") {
    const animations = resolveCardStageAnimations({
      questionEntrance: card.questionEntrance,
      stageAnimations: card.stageAnimations,
    })
    heading = (
      <NativeQuestionHeading
        question={card.question}
        stageAnimations={animations}
        questionDecoration={resolveQuestionDecoration({
          cardDecoration: card.questionDecoration,
        })}
        epoch={questionEpoch ?? card.key}
        titleTestId="show-question-title"
        controlledTimeMs={
          chapter.phase === "question" ? frame.clock.elapsedMs : undefined
        }
        controlledPaused={frame.clock.paused}
      />
    )
    const visuals = card.answers.map((answer, answerIndex) => ({
      answerIndex,
      display: answer.display,
      url: answer.imageUrl,
      alt: answer.alt ?? answer.text,
      ...(answer.imageTreatment
        ? { imageTreatment: answer.imageTreatment }
        : {}),
    }))
    const answers = card.answers.map((answer) => answer.text)
    const { phase } = chapter
    const resultData: ManagerStatusDataMap["SHOW_RESPONSES"] = {
      question: card.question,
      answers,
      responses: {},
      type: card.questionType,
      solutions:
        card.kind === "quiz" ? card.correctAnswers.map((n) => n - 1) : [],
      options: card.options,
    }
    const percentages = Object.fromEntries(answers.map((_, n) => [n, 0]))
    const resultView = QUESTION_PRESENTATIONS[card.questionType]
    const Answer = resultView.AnswerComponent
    const remaining =
      frame.clock.deadlineMs === null
        ? null
        : Math.max(
            0,
            Math.ceil((frame.clock.deadlineMs - frame.clock.elapsedMs) / 1000),
          )

    if (phase === "question") {
      content = (
        <NativeRazziaQuestion
          hideHeading
          data={{
            question: card.question,
            media: card.media,
            cooldown: card.cooldownSeconds,
          }}
          stageAnimations={animations}
          questionDecoration={resolveQuestionDecoration({
            cardDecoration: card.questionDecoration,
          })}
          epoch={key}
          reveal={
            frame.reducedMotion && card.reveal
              ? { ...card.reveal, effect: "none" }
              : card.reveal
          }
          currentEpoch={frame.clock.epoch}
          isManager={frame.role === "manager"}
          isManuallyRevealed={frame.mediaRevealed}
          controlledTimeMs={frame.clock.elapsedMs}
          controlledPaused={frame.clock.paused}
          revealTimeMs={
            frame.mediaRevealed && card.reveal?.trigger === "manual"
              ? card.reveal.durationMs
              : frame.clock.elapsedMs
          }
        />
      )
    } else if (phase === "results") {
      content = (
        <>
          {card.questionType === "estimation" ? (
            <QUESTION_PRESENTATIONS.estimation.ResponsesComponent
              data={resultData}
            />
          ) : (
            <ChoiceResultsView
              hideHeading
              data={resultData}
              extensionState={{
                epoch: frame.clock.epoch,
                questionId: card.key,
                extras: {
                  stageAnimations: card.stageAnimations,
                  questionEntrance: card.questionEntrance,
                },
              }}
              reveal={{
                answerVisuals: visuals,
                isSurvey: card.kind === "survey",
                revealDistribution: undefined,
                targetPercentages: percentages,
                timelineState: calculateRevealState(
                  {
                    timelineKey: key,
                    targetPercentages: percentages,
                    startedAt: 0,
                    reducedMotion: true,
                    isSurvey: card.kind === "survey",
                  },
                  frame.clock.elapsedMs,
                ),
              }}
            />
          )}
          <AnswerNote note={card.note} isManager={frame.role === "manager"} />
        </>
      )
    } else {
      content = (
        <>
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2 overflow-hidden sm:gap-4">
            {card.media?.type === "image" && (
              <QuestionMedia
                media={card.media}
                alt={card.question}
                reveal={
                  frame.reducedMotion && card.reveal
                    ? { ...card.reveal, effect: "none" }
                    : card.reveal
                }
                controlledTimeMs={
                  frame.mediaRevealed && card.reveal?.trigger === "manual"
                    ? card.reveal.durationMs
                    : frame.clock.elapsedMs
                }
                currentEpoch={frame.clock.epoch}
                isManager={frame.role === "manager"}
                isManuallyRevealed={frame.mediaRevealed}
              />
            )}
            {card.media && card.media.type !== "image" && (
              <ScenePresenter
                scene={{
                  id: card.key,
                  kind: "media",
                  mediaUrl: card.media.url,
                  mediaType: card.media.type ?? "video",
                  durationMs: 5000,
                  advance: "manual",
                  muted: !frame.soundEnabled,
                  volume: frame.soundEnabled ? 0.8 : 0,
                  showControls: false,
                }}
                controlledTimeMs={frame.clock.elapsedMs}
                controlledPaused={frame.clock.paused}
                labels={labels.sceneLabels}
              />
            )}
          </div>
          <Answer
            answers={answers}
            options={card.options}
            visuals={visuals}
            stageAnimations={animations}
            animationEpochKey={key}
            onSubmit={() => undefined}
            readOnly
          />
          {phase === "voting" && (
            <AnswerCountdown
              seconds={remaining}
              totalSeconds={card.timeSeconds}
              variant="display"
            />
          )}
          {phase === "voteLocked" && (
            <p className="text-center font-bold text-white">
              {labels.labels.votesLocked}
            </p>
          )}
        </>
      )
    }
  } else {
    content = scene ? (
      <ScenePresenter
        scene={scene}
        activeSceneData={activeSceneData}
        tadazzEnabled={false}
        controlledTimeMs={frame.clock.elapsedMs}
        controlledPaused={frame.clock.paused}
        labels={labels.sceneLabels}
        epoch={key}
      />
    ) : null
  }

  return (
    <I18nextProvider i18n={labels.i18n}>
      <div
        ref={viewport}
        data-original-razzia-preview
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
          backgroundImage: backdropUrl
            ? [
                backdropOverlayOpacity > 0
                  ? `linear-gradient(rgba(0, 0, 0, ${backdropOverlayOpacity}), rgba(0, 0, 0, ${backdropOverlayOpacity}))`
                  : undefined,
                `url(${JSON.stringify(backdropUrl)})`,
              ]
                .filter(Boolean)
                .join(", ")
            : undefined,
          backgroundSize: backdropFit ?? "cover",
          backgroundPosition: backdropPosition,
        }}
      >
        <div
          ref={virtual}
          style={{
            width: fit.width,
            height: fit.height,
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: `translate(-50%,-50%) scale(${fit.scale})`,
            transformOrigin: "center",
          }}
        >
          <StageFitContainer
            widthOverride={fit.width}
            heightOverride={fit.height}
          >
            <NativeGameSurface theme={theme}>
              {heading}
              {content}
            </NativeGameSurface>
          </StageFitContainer>
        </div>
      </div>
    </I18nextProvider>
  )
}
