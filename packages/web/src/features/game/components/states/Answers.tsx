import {
  AnswerStageHud,
  LegacyVotingMotion,
} from "../tadazz-show/answer-stage-elements"
import {
  useQuestionPresentation,
  useNativeVotingGate,
} from "../tadazz-show/use-question-presentation"
import { QuestionUnderline } from "@razzia/extensions/presentation"
import { EVENTS, MEDIA_TYPES } from "@razzia/common/constants"
import type { QuestionMediaType } from "@razzia/common/types/game"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import { type AnswerVisual, type QuestionReveal } from "@razzia/extensions/core"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import QuestionDialog from "@razzia/web/features/game/components/QuestionDialog"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"
import { TadazzSurveyCards, useStageFit } from "@razzia/extensions/presentation"
import { useViewRole } from "@razzia/web/features/game/contexts/view-role-context"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { SFX } from "@razzia/web/features/game/utils/constants"
import { QUESTION_REGISTRY } from "@razzia/web/features/questions"
import useScreenSize from "@razzia/web/hooks/useScreenSize"
import clsx from "clsx"
import { CircleQuestionMark, Image, Video } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import useSound from "use-sound"

// Tailwind sm breakpoint
const MOBILE_BREAKPOINT = 640

interface Props {
  data: CommonStatusDataMap["SELECT_ANSWER"]
}

const Answers = ({
  data: {
    question,
    answers,
    media,
    time,
    totalPlayer,
    questionType,
    options,
    answersOnly,
    playMode,
    votingStartsAt,
  },
  data,
}: Props & { data?: { remainingTime?: number } }) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const { questionStates } = useQuestionStore()
  const viewRole = useViewRole()
  const isSpectator = viewRole === "spectator"
  const isVisualPlayerMode = Boolean(player) || isSpectator
  const roleCanSubmit = Boolean(player) && !isSpectator

  const initialCooldown =
    typeof data?.remainingTime === "number" ? data.remainingTime : time
  const [cooldown, setCooldown] = useState(initialCooldown)
  const [totalAnswer, setTotalAnswer] = useState(0)
  const {
    effectiveExtensionState,
    defaultsObj,
    stageAnimations,
    questionDecoration,
    animationEpochKey,
  } = useQuestionPresentation(question, "answers")
  const nativeVotingOpen = useNativeVotingGate(
    votingStartsAt,
    Boolean(effectiveExtensionState?.pause?.paused),
  )
  const canSubmit =
    roleCanSubmit && nativeVotingOpen && !effectiveExtensionState?.pause?.paused
  const { t } = useTranslation()
  const { width } = useScreenSize()
  const { isUltraCompact } = useStageFit()

  const rawAnswerVisuals = effectiveExtensionState?.extras.answerVisuals as
    AnswerVisual[] | undefined

  const currentVisuals =
    rawAnswerVisuals &&
    rawAnswerVisuals.length === answers.length &&
    rawAnswerVisuals.some((v) => Boolean(v.url))
      ? rawAnswerVisuals
      : undefined

  const popupMedia: QuestionMediaType[] = [MEDIA_TYPES.IMAGE, MEDIA_TYPES.VIDEO]
  const isPopupMedia = popupMedia.includes(media?.type)
  const showAnswersOnly = isVisualPlayerMode && answersOnly
  const showMediaInPopup =
    isVisualPlayerMode && width < MOBILE_BREAKPOINT && isPopupMedia

  const [sfxPop] = useSound(SFX.ANSWERS.SOUND, {
    volume: 0.1,
  })

  const [playMusic, { stop: stopMusic }] = useSound(SFX.ANSWERS.MUSIC, {
    volume: 0.2,
    interrupt: true,
    loop: true,
  })

  const handleSubmit = (answerKeys: number[]) => {
    if (!canSubmit || !gameId) {
      return
    }

    socket.emit(EVENTS.PLAYER.SELECTED_ANSWER, {
      gameId,
      data: {
        answerKeys,
      },
    })
    sfxPop()
  }

  useEffect(() => {
    // When extensionState is present, GameWrapper's unified AudioCuePlayer manages answersMusic
    if (effectiveExtensionState?.gameId) {
      stopMusic()

      return
    }

    const disabledMusicMedia: QuestionMediaType[] = [
      MEDIA_TYPES.AUDIO,
      MEDIA_TYPES.VIDEO,
    ]

    if (disabledMusicMedia.includes(media?.type)) {
      return
    }

    playMusic()

    return () => {
      stopMusic()
    }
    // oxlint-disable-next-line
  }, [playMusic, effectiveExtensionState?.gameId])

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  useEvent(EVENTS.GAME.PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    sfxPop()
  })

  const { AnswerComponent } = QUESTION_REGISTRY[questionType]

  const MediaIcon = media?.type === MEDIA_TYPES.VIDEO ? Video : Image

  const showTadazzCards =
    defaultsObj?.tadazzBackground?.mode !== undefined &&
    defaultsObj.tadazzBackground.mode !== "original" &&
    playMode === "survey" &&
    questionType === "single" &&
    answers.length >= 2 &&
    answers.length <= 5 &&
    Boolean(currentVisuals)

  return (
    <QuestionEntrance
      entrance={stageAnimations.questionEntrance}
      epoch={animationEpochKey}
      className="relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden"
    >
      <LegacyVotingMotion
        showTadazzCards={showTadazzCards}
        defaultsObj={defaultsObj}
        viewRole={viewRole}
        isSpectator={isSpectator}
        currentVisuals={currentVisuals}
        effectiveExtensionState={effectiveExtensionState}
        gameId={gameId}
        animationEpochKey={animationEpochKey}
        question={question}
        questionStates={questionStates}
        answers={answers}
        time={time}
      />
      {/* Question Header & Media Area */}
      <div
        className={clsx("mx-auto w-full max-w-7xl px-2 text-center", {
          "shrink-0 pt-1 pb-1 sm:pt-2":
            showAnswersOnly || Boolean(currentVisuals),
          "inline-flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-hidden sm:gap-4":
            !showAnswersOnly && !currentVisuals,
        })}
      >
        <h2
          data-testid="game-question-title"
          className={clsx(
            "text-center leading-tight font-bold break-words text-white drop-shadow-lg",
            isUltraCompact
              ? "text-sm sm:text-base"
              : showAnswersOnly || currentVisuals
                ? "text-base sm:text-xl md:text-2xl"
                : "text-lg sm:text-2xl md:text-3xl lg:text-4xl",
          )}
        >
          {question}
        </h2>

        <QuestionUnderline
          decoration={questionDecoration}
          className="mx-auto mt-1 flex w-40 items-center justify-center sm:w-56"
          playerClassName="h-4 w-full"
        />

        {showAnswersOnly ? (
          <>
            {isPopupMedia && (
              <QuestionDialog
                question={question}
                media={media}
                label={t("game:question.show")}
                className="hover:bg-accent absolute top-4 right-4 flex size-11 items-center justify-center rounded-md bg-white text-black shadow-lg"
              >
                <CircleQuestionMark className="size-6" />
              </QuestionDialog>
            )}

            {media?.type === MEDIA_TYPES.AUDIO && (
              <div className="mt-1 flex justify-center">
                <QuestionMedia media={media} alt={question} />
              </div>
            )}
          </>
        ) : (
          <>
            {showMediaInPopup ? (
              <QuestionDialog
                question={question}
                media={media}
                className="hover:bg-accent flex items-center gap-2 rounded-lg bg-white px-4 py-2 font-bold text-black drop-shadow-md"
              >
                <MediaIcon className="size-5" />
                {t(
                  media?.type === MEDIA_TYPES.VIDEO
                    ? "game:media.showVideo"
                    : "game:media.showImage",
                )}
              </QuestionDialog>
            ) : (
              <QuestionMedia
                media={media}
                alt={question}
                reveal={
                  effectiveExtensionState?.extras.reveal as
                    QuestionReveal | undefined
                }
                serverStartedAt={effectiveExtensionState?.startedAt}
                currentEpoch={effectiveExtensionState?.epoch}
                isManager={!isVisualPlayerMode}
                isManuallyRevealed={
                  (
                    effectiveExtensionState?.extras.reveal as
                      { isRevealed?: boolean } | undefined
                  )?.isRevealed
                }
              />
            )}
          </>
        )}
      </div>

      <div
        className={clsx(
          "flex min-h-0 flex-col overflow-y-auto overscroll-contain",
          {
            "flex-1 justify-end": showAnswersOnly || Boolean(currentVisuals),
          },
        )}
      >
        <AnswerStageHud
          time={time}
          cooldown={cooldown}
          totalAnswer={totalAnswer}
          totalPlayer={totalPlayer}
          isUltraCompact={isUltraCompact}
          isVisualPlayerMode={isVisualPlayerMode}
        />

        {showTadazzCards ? (
          <div className="flex min-h-0 w-full flex-1 flex-col justify-center overflow-hidden px-2">
            <TadazzSurveyCards
              key={animationEpochKey}
              answers={answers}
              visuals={currentVisuals}
              epochKey={animationEpochKey}
              onSubmit={(index) => handleSubmit([index])}
              readOnly={!canSubmit}
              animations={stageAnimations}
              choicesAriaLabel={t("game:hud.answers", "Answer choices")}
            />
          </div>
        ) : (
          <AnswerComponent
            answers={answers}
            options={options}
            onSubmit={handleSubmit}
            readOnly={!canSubmit}
            fill={showAnswersOnly}
            visuals={currentVisuals}
            stageAnimations={stageAnimations}
            animationEpochKey={animationEpochKey}
          />
        )}
      </div>
    </QuestionEntrance>
  )
}

export default Answers
