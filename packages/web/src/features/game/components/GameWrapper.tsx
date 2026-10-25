import { EVENTS, QUIZZ_MODES } from "@razzia/common/constants"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type CueId,
  type ExtensionStateEnvelope,
  type HostPresenceSnapshot,
  type Interlude,
  type QuizExtrasV1,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  AudioCuePlayer,
  InterludePresenter,
} from "@razzia/extensions/presentation"
import Button from "@razzia/web/components/Button"
import GameBackground from "@razzia/web/components/GameBackground"
import Loader from "@razzia/web/components/Loader"
import Tooltip from "@razzia/web/components/Tooltip"
import {
  ExtensionStateProvider,
  getAuthoritativeEnvelope,
  isNewerEnvelope,
} from "@razzia/web/features/game/contexts/extension-state-context"
import GameSettingsModal from "@razzia/web/features/game/components/GameSettingsModal"
import HostPlayersModal from "@razzia/web/features/game/components/HostPlayersModal"
import ManagerControlToolbar from "@razzia/web/features/game/components/ManagerControlToolbar"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { MANAGER_SKIP_BTN } from "@razzia/web/features/game/utils/constants"
import type { Status as GameStatus } from "@razzia/web/features/game/utils/createStatus"
import { fetchGameRoster } from "@razzia/web/features/manager/queries"
import { useFullscreen } from "@razzia/web/hooks/useFullscreen"
import clsx from "clsx"
import { Maximize, Minimize, PhoneCall, Users } from "lucide-react"
import { type PropsWithChildren, useEffect, useMemo, useState } from "react"
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
  const {
    gameId,
    players,
    inviteCode,
    locked,
    status,
    hostPresence,
    updateManager,
  } = useManagerStore()
  const { questionStates, setQuestionStates } = useQuestionStore()
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()
  const { t } = useTranslation()
  const [skippedStatus, setSkippedStatus] =
    useState<GameStatus<StatusDataMap> | null>(null)
  const [totalPlayers, setTotalPlayers] = useState<number | null>(null)
  const [playersModalOpen, setPlayersModalOpen] = useState(false)
  const [countdown, setCountdown] = useState<{
    seconds: number
    total: number
  } | null>(null)
  const storeExtensionState = useManagerStore((s) => s.extensionState)
  const [localExtensionState, setLocalExtensionState] =
    useState<ExtensionStateEnvelope | null>(null)
  const { socket, clientId } = useSocket()

  useEffect(() => {
    if (manager && gameId && !hostPresence) {
      fetchGameRoster(gameId)
        .then(({ presence }) => {
          updateManager({ hostPresence: presence })
        })
        .catch(() => undefined)
    }
  }, [manager, gameId, hostPresence, updateManager])

  // Single authoritative state: resolve between store and local event state by epoch/seq
  const extensionState = useMemo(() => {
    if (manager) {
      if (!storeExtensionState && !localExtensionState) {
        return null
      }

      return getAuthoritativeEnvelope(localExtensionState, storeExtensionState)
    }

    return localExtensionState
  }, [manager, storeExtensionState, localExtensionState])

  const isEnhancedQuiz = Boolean(extensionState?.gameId)
  const next = statusName ? MANAGER_SKIP_BTN[statusName] : null
  const isDisabled = skippedStatus !== null && skippedStatus === status

  const handleNext = () => {
    setSkippedStatus(status)
    onNext?.()
  }

  const renderHeader = () => {
    if (manager && !isEnhancedQuiz) {
      return (
        <div className="flex w-full justify-between p-4">
          {questionStates && (
            <div className="flex items-center rounded-md bg-white p-2 px-4 text-lg font-bold text-black">
              {`${questionStates.current} / ${questionStates.total}`}
            </div>
          )}

          {onBack && (
            <Button
              onClick={onBack}
              className="hover:bg-accent bg-white px-4 text-black"
            >
              {t("common:exit")}
            </Button>
          )}

          {next && (
            <div className="ml-auto flex gap-2">
              {statusName === STATUS.SHOW_ROOM && (
                <RoomLockButton className="hover:bg-accent rounded-lg bg-white px-3 text-black" />
              )}

              <Button
                className={clsx(
                  "hover:bg-accent relative overflow-hidden bg-white px-4 text-black",
                  { "pointer-events-none": isDisabled },
                )}
                onClick={handleNext}
              >
                {countdown && (
                  <span
                    className="bg-primary/40 absolute inset-y-0 left-0"
                    style={{
                      animation: `progressBar ${countdown.total}s linear forwards`,
                    }}
                  />
                )}

                <span className="relative">{t(next)}</span>
              </Button>
            </div>
          )}
        </div>
      )
    }

    if (manager && isEnhancedQuiz) {
      return (
        <ManagerControlToolbar
          statusName={statusName ?? null}
          extensionState={extensionState}
          questionStates={questionStates}
          onExit={onBack ?? defaultExit}
          onStartGame={statusName === STATUS.SHOW_ROOM ? onNext : undefined}
          onAdvanceFallback={onNext}
          countdown={countdown}
        />
      )
    }

    return (
      <div className="flex w-full justify-between p-4">
        {questionStates && (
          <div className="flex items-center rounded-md bg-white p-2 px-4 text-lg font-bold text-black">
            {`${questionStates.current} / ${questionStates.total}`}
          </div>
        )}
      </div>
    )
  }

  useEvent(EXTENSION_EVENTS.STATE, (payload: ExtensionStateEnvelope) => {
    setLocalExtensionState((prev) => {
      const current = getAuthoritativeEnvelope(prev, storeExtensionState)

      if (isNewerEnvelope(payload, current)) {
        return payload
      }

      return prev
    })
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

  useEvent(
    EVENTS.MANAGER.HOST_PRESENCE,
    (snapshot: HostPresenceSnapshot) => {
      if (manager) {
        updateManager({ hostPresence: snapshot })
      }
    },
  )

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
    setSkippedStatus(null)
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
            {renderHeader()}

            {extensionState?.phase === "interlude" &&
            extensionState.extras.interlude ? (
              <div className="flex h-full w-full flex-1 items-center justify-center p-4 sm:p-8">
                <InterludePresenter
                  interlude={extensionState.extras.interlude as Interlude}
                  serverStartedAt={extensionState.startedAt}
                  isManager={Boolean(manager)}
                  labels={{
                    secondsRemaining: (sec) =>
                      t("extensions:interludes.secondsRemaining", {
                        seconds: sec,
                      }),
                    awaitingHost: t("extensions:interludes.awaitingHost"),
                    skipInterlude: t("extensions:interludes.skipInterlude"),
                    skipped: t("extensions:interludes.skipped"),
                    slideAlt: t("extensions:interludes.slideAlt"),
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
              <ExtensionStateProvider value={extensionState}>
                {children}
              </ExtensionStateProvider>
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

                <Tooltip
                  content={t(
                    "extensions:roster.liveModalTitle",
                    "Players & Live Connection Status",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPlayersModalOpen(true)}
                    data-testid="host-bottom-players-btn"
                    className={clsx(
                      "ml-auto flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-xl font-bold text-white drop-shadow-md transition-colors hover:bg-black/60",
                      !isConnected && "opacity-60",
                    )}
                  >
                    <Users className="size-5" />
                    <span data-testid="host-connected-counter">
                      {(() => {
                        const connectedCount =
                          hostPresence?.connectedNow ??
                          players.filter((p) =>  p.connected).length
                        const registeredCount =
                          hostPresence?.registeredTotal ??
                          totalPlayers ??
                          players.length

                        if (
                          (registeredCount > 0 &&
                            registeredCount !== connectedCount) ||
                          hostPresence
                        ) {
                          return `${connectedCount} / ${registeredCount}`
                        }

                        return String(totalPlayers ?? players.length)
                      })()}
                    </span>
                    <span className="ml-1 hidden rounded bg-white/20 px-2 py-0.5 text-xs font-semibold sm:inline-flex items-center gap-1">
                      <PhoneCall className="size-3" />
                      {t("extensions:roster.playersButton", "Players")}
                    </span>
                  </button>
                </Tooltip>

                <GameSettingsModal
                  onOpenRoster={() => setPlayersModalOpen(true)}
                />

                <HostPlayersModal
                  open={playersModalOpen}
                  onOpenChange={setPlayersModalOpen}
                />

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
