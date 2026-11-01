import { EVENTS, MEDIA_TYPES, NO_TIME_LIMIT } from "@razzia/common/constants"
import type { QuestionMediaType } from "@razzia/common/types/game"
import type { CommonStatusDataMap } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type AnswerVisual,
  type ExtensionStateEnvelope,
  type QuestionReveal,
} from "@razzia/extensions/core"
import QuestionMedia from "@razzia/web/components/QuestionMedia"
import AnswerCountdown from "@razzia/web/features/game/components/AnswerCountdown"
import QuestionDialog from "@razzia/web/features/game/components/QuestionDialog"
import QuestionEntrance from "@razzia/web/features/game/components/QuestionEntrance"
import {
  getAuthoritativeEnvelope,
  useExtensionState,
} from "@razzia/web/features/game/contexts/extension-state-context"
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
  },
  data,
}: Props & { data?: { remainingTime?: number } }) => {
  const { socket } = useSocket()
  const { player, gameId } = usePlayerStore()
  const viewRole = useViewRole()
  const isSpectator = viewRole === "spectator"
  const isVisualPlayerMode = Boolean(player) || isSpectator
  const canSubmit = Boolean(player) && !isSpectator

  const initialCooldown =
    typeof (data as any)?.remainingTime === "number"
      ? (data as any).remainingTime
      : time
  const [cooldown, setCooldown] = useState(initialCooldown)
  const [totalAnswer, setTotalAnswer] = useState(0)
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const contextExtensionState = useExtensionState()
  const effectiveExtensionState = getAuthoritativeEnvelope(
    extensionState,
    contextExtensionState,
  )
  const { t } = useTranslation()
  const { width } = useScreenSize()

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  const rawAnswerVisuals = effectiveExtensionState?.extras.answerVisuals as
    | AnswerVisual[]
    | undefined

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
  }, [playMusic])

  useEvent(EVENTS.GAME.COOLDOWN, (sec) => {
    setCooldown(sec)
  })

  useEvent(EVENTS.GAME.PLAYER_ANSWER, (count) => {
    setTotalAnswer(count)
    sfxPop()
  })

  const { AnswerComponent } = QUESTION_REGISTRY[questionType]

  const MediaIcon = media?.type === MEDIA_TYPES.VIDEO ? Video : Image

  const questionEntrance = effectiveExtensionState?.extras?.questionEntrance as
    | any
    | undefined

  return (
    <QuestionEntrance
      entrance={questionEntrance}
      epoch={effectiveExtensionState?.epoch}
      className="flex h-full flex-1 flex-col justify-between"
    >
      {/* Question Header & Media Area */}
      <div
        className={clsx("mx-auto w-full max-w-7xl px-2 text-center", {
          "pt-2 sm:pt-3 pb-1": showAnswersOnly,
          "inline-flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-5":
            !showAnswersOnly,
        })}
      >
        <h2
          data-testid="game-question-title"
          className={clsx(
            "text-center font-bold text-white drop-shadow-lg",
            showAnswersOnly
              ? "text-xl sm:text-2xl md:text-3xl line-clamp-3"
              : "text-2xl md:text-4xl lg:text-5xl",
          )}
        >
          {question}
        </h2>

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
              <div className="mt-2 flex justify-center">
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
                  extensionState?.extras.reveal as QuestionReveal | undefined
                }
                serverStartedAt={extensionState?.startedAt}
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

      <div className={clsx({ "flex flex-1 flex-col": showAnswersOnly })}>
        <div className="mx-auto mb-3 flex w-full max-w-7xl items-center justify-between gap-2 px-2">
          {time !== NO_TIME_LIMIT && (
            <AnswerCountdown
              seconds={cooldown}
              totalSeconds={time}
              variant={isVisualPlayerMode ? "player" : "host"}
            />
          )}
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/60 px-4 py-1.5 shadow-lg backdrop-blur-md">
            <div className="flex flex-col items-center leading-none">
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider text-white/60">
                {t("game:hud.answers")}
              </span>
              <span className="text-2xl sm:text-3xl font-mono font-black text-white tabular-nums">
                {totalAnswer}/{totalPlayer}
              </span>
            </div>
          </div>
        </div>

        <AnswerComponent
          answers={answers}
          options={options}
          onSubmit={handleSubmit}
          readOnly={!canSubmit}
          fill={showAnswersOnly}
          visuals={currentVisuals}
        />
      </div>
    </QuestionEntrance>
  )
}

export default Answers
