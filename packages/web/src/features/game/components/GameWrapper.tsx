import { EVENTS, QUIZZ_MODES } from "@razzia/common/constants"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type CueId,
  type ExtensionStateEnvelope,
  type Interlude,
  type QuizExtrasV1,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  AudioCuePlayer,
  InterludePresenter,
} from "@razzia/extensions/presentation"
import GameBackground from "@razzia/web/components/GameBackground"
import Loader from "@razzia/web/components/Loader"
import Tooltip from "@razzia/web/components/Tooltip"
import GameSettingsModal from "@razzia/web/features/game/components/GameSettingsModal"
import ManagerControlToolbar from "@razzia/web/features/game/components/ManagerControlToolbar"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { useFullscreen } from "@razzia/web/hooks/useFullscreen"
import clsx from "clsx"
import { Maximize, Minimize, Users } from "lucide-react"
import { type PropsWithChildren, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
}

const GameWrapper = ({
  children,
  statusName,
  onNext,
  onBack,
  manager,
}: Props) => {
  const { isConnected } = useSocket()
  const { player, gameMode } = usePlayerStore()
  const { players, inviteCode, locked } = useManagerStore()
  const { questionStates, setQuestionStates } = useQuestionStore()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const { t } = useTranslation()
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null)
  const [countdown, setCountdown] = useState<{
    seconds: number
    total: number
  } | null>(null)
  const [extensionState, setExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const { socket, clientId } = useSocket()

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setExtensionState(payload)
  })

  useEvent(EVENTS.GAME.UPDATE_QUESTION, ({ current, total }) => {
    setQuestionStates({
      current,
      total,
    })
  })

  useEvent(EVENTS.GAME.TOTAL_PLAYERS, (total) => {
    setTotalPlayers(total)
  })

  useEvent(EVENTS.MANAGER.AUTO_ADVANCE, (state) => {
    setCountdown((current) => {
      if (state === null) {
        return null
      }

      return current ?? state
    })
  })

  useEvent(EVENTS.GAME.ERROR_MESSAGE, (message) => {
    toast.error(t(message))
    console.log(t(message))
  })

  const defaultExit = () => undefined

  return (
    <section className="relative flex min-h-dvh">
      <GameBackground />

      <div className="z-10 flex w-full flex-1 flex-col justify-between">
        {!isConnected && !statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-4xl font-bold text-white">
              {t("common:connecting")}
            </h1>
          </div>
        ) : (
          <>
            {manager ? (
              <ManagerControlToolbar
                statusName={statusName ?? null}
                extensionState={extensionState}
                questionStates={questionStates}
                onExit={onBack ?? defaultExit}
                onStartGame={
                  statusName === STATUS.SHOW_ROOM ? onNext : undefined
                }
                onAdvanceFallback={onNext}
                countdown={countdown}
              />
            ) : (
              <div className="flex w-full justify-between p-4">
                {questionStates && (
                  <div className="flex items-center rounded-md bg-white p-2 px-4 text-lg font-bold text-black">
                    {`${questionStates.current} / ${questionStates.total}`}
                  </div>
                )}
              </div>
            )}

            {extensionState?.phase === "interlude" &&
            extensionState.extras.interlude ? (
              <div className="flex h-full w-full flex-1 items-center justify-center p-4 sm:p-8">
                <InterludePresenter
                  interlude={extensionState.extras.interlude as Interlude}
                  serverStartedAt={extensionState.startedAt}
                  isManager={Boolean(manager)}
                  onAdvance={() => {
                    if (manager && extensionState.gameId) {
                      socket.emit(EXTENSION_EVENTS.COMMAND, {
                        v: 1,
                        gameId: extensionState.gameId,
                        action: "END_OR_SKIP_INTERLUDE",
                        payload: {
                          reason: "auto",
                          epoch: extensionState.epoch,
                        },
                        requestId: `advance-${Date.now()}`,
                      })
                    }
                  }}
                  onSkip={() => {
                    if (manager && extensionState.gameId) {
                      socket.emit(EXTENSION_EVENTS.COMMAND, {
                        v: 1,
                        gameId: extensionState.gameId,
                        action: "END_OR_SKIP_INTERLUDE",
                        payload: {
                          reason: "manual",
                          epoch: extensionState.epoch,
                        },
                        requestId: `skip-${Date.now()}`,
                      })
                    }
                  }}
                />
              </div>
            ) : (
              children
            )}

            {extensionState?.extras.audioCue && (
              <AudioCuePlayer
                cueId={extensionState.extras.audioCue as CueId}
                audioExtras={
                  extensionState.extras.audio as
                    QuizExtrasV1["audio"] | undefined
                }
              />
            )}

            {manager ? (
              <div
                className={clsx("z-50 flex items-stretch gap-3 p-4", {
                  "absolute inset-x-0 bottom-0": statusName === STATUS.FINISHED,
                })}
              >
                {inviteCode && statusName !== STATUS.SHOW_ROOM && (
                  <div className="flex items-center gap-3 rounded-lg bg-black/40 px-3 py-1.5 text-xl font-bold text-white drop-shadow-md">
                    {!locked && (
                      <>
                        <span>{window.location.host}</span>
                        <span className="h-5 w-px bg-white/40" />
                        <span>{inviteCode}</span>
                      </>
                    )}
                    <RoomLockButton className="-mx-1 rounded-md p-1 hover:bg-white/20" />
                  </div>
                )}

                <Tooltip content={t("game:playersJoined")}>
                  <div className="ml-auto flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-xl font-bold text-white drop-shadow-md">
                    <Users className="size-5" />
                    {totalPlayers ?? players.length}
                  </div>
                </Tooltip>

                {statusName === STATUS.SHOW_ROOM && <GameSettingsModal />}

                <Tooltip
                  content={t(
                    isFullscreen
                      ? "common:exitFullscreen"
                      : "common:fullscreen",
                  )}
                >
                  <button
                    onClick={toggleFullscreen}
                    aria-label={t(
                      isFullscreen
                        ? "common:exitFullscreen"
                        : "common:fullscreen",
                    )}
                    className="flex items-center justify-center rounded-lg bg-black/40 px-2.5 text-white drop-shadow-md hover:bg-black/60"
                  >
                    {isFullscreen ? (
                      <Minimize className="size-5" />
                    ) : (
                      <Maximize className="size-5" />
                    )}
                  </button>
                </Tooltip>
              </div>
            ) : (
              <div className="z-50 flex items-center justify-between bg-white px-4 py-2 text-lg font-bold text-white">
                <div className="flex items-center gap-2">
                  <p className="text-gray-800">{player?.username}</p>
                  {(() => {
                    const teamsData = extensionState?.extras.teams as
                      | {
                          teams?: TeamDefinition[]
                          assignments?: Record<string, string>
                        }
                      | undefined
                    const assignedTeamId =
                      (clientId
                        ? teamsData?.assignments?.[clientId]
                        : undefined) ??
                      teamsData?.assignments?.[
                        (player as { id?: string } | null)?.id ??
                          player?.username ??
                          ""
                      ]
                    const assignedTeam = teamsData?.teams?.find(
                      (team) => team.id === assignedTeamId,
                    )

                    if (!assignedTeam) {
                      return null
                    }

                    return (
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-bold text-white shadow-sm"
                        style={{ backgroundColor: assignedTeam.color }}
                      >
                        {assignedTeam.name}
                      </span>
                    )
                  })()}
                </div>
                {gameMode !== QUIZZ_MODES.SURVEY && (
                  <div className="rounded-lg bg-gray-800 px-3 py-1 text-lg">
                    {player?.points}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default GameWrapper
