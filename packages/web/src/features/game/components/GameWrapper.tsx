import { NativePublicContent } from "./tadazz-show/NativePublicContent"
import {
  NativeGameFrame,
  NativeGameSurface,
} from "./tadazz-show/NativeGameLayout"
import {
  LegacyStageBackdrops,
  LegacyStageAudio,
  HostPresenceButton,
  PlayerTeamBadge,
} from "./tadazz-show/legacy-stage-elements"
import { useGameExtensionConnection } from "./tadazz-show/use-game-extension-connection"
import { useLegacyPresentation } from "./tadazz-show/use-legacy-presentation"
import { EVENTS, QUIZZ_MODES } from "@razzia/common/constants"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import { EXTENSION_EVENTS } from "@razzia/extensions/core"
import {
  AudioPreferencesScope,
  ShowThemeRenderer,
  useResolvedShowTheme,
  ExtensionStageContent,
  createScenePresenterLabels,
  isTadazzShowActive,
} from "@razzia/extensions/presentation"
import Button from "@razzia/web/components/Button"
import GameBackground from "@razzia/web/components/GameBackground"
import Loader from "@razzia/web/components/Loader"
import Tooltip from "@razzia/web/components/Tooltip"
import GameSettingsModal from "@razzia/web/features/game/components/GameSettingsModal"
import {
  useHostPresentation,
  useHostPresentationCommands,
} from "@razzia/web/features/game/components/host-presentation-controller"
import HostPlayersModal from "@razzia/web/features/game/components/HostPlayersModal"
import ManagerControlToolbar from "@razzia/web/features/game/components/ManagerControlToolbar"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { SHOW_THEME_ADAPTERS } from "@razzia/web/features/game/components/tadazz-show/show-theme-adapters"
import { TadazzMotionStage } from "@razzia/web/features/game/components/TadazzMotionStage"
import { ExtensionStateProvider } from "@razzia/web/features/game/contexts/extension-state-context"
import {
  useEvent,
  useSocket,
} from "@razzia/web/features/game/contexts/socket-context"
import {
  ViewRoleContext,
  type ViewRole,
} from "@razzia/web/features/game/contexts/view-role-context"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { usePlayerStore } from "@razzia/web/features/game/stores/player"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import { MANAGER_SKIP_BTN } from "@razzia/web/features/game/utils/constants"
import type { Status as GameStatus } from "@razzia/web/features/game/utils/createStatus"
import { useFullscreen } from "@razzia/web/hooks/useFullscreen"
import clsx from "clsx"
import { Maximize, Minimize } from "lucide-react"
import {
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type RefObject,
} from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
  viewRole?: ViewRole
}

const GameWrapperView = ({
  children,
  statusName,
  onNext,
  onBack,
  manager,
  viewRole,
  presentationRootRef,
}: Props & { presentationRootRef: RefObject<HTMLDivElement | null> }) => {
  const effectiveRole: ViewRole = manager ? "manager" : (viewRole ?? "player")
  const { isConnected } = useSocket()
  const { player, gameMode } = usePlayerStore()
  const { players, inviteCode, locked, status, hostPresence } =
    useManagerStore()
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
  const { socket, clientId } = useSocket()

  const { extensionState, roomMediaReady } = useGameExtensionConnection(manager)

  const theme = useResolvedShowTheme(extensionState, effectiveRole)
  const isEnhancedQuiz = Boolean(extensionState?.gameId)
  const {
    isPresenting: isHostPresentingConfirmed,
    isPending: isHostPresentationPending,
    error: presentationError,
    enter: enterHostPresentation,
    exit: exitHostPresentation,
  } = useHostPresentation(Boolean(manager && isEnhancedQuiz))
  const isHostPresenting =
    isHostPresentingConfirmed || isHostPresentationPending

  useHostPresentationCommands({
    enabled: Boolean(manager && isEnhancedQuiz),
    statusName,
    extensionState,
    currentQuestion: questionStates?.current ?? 0,
    onExit: () => {
      if (isHostPresenting) exitHostPresentation()
    },
    onAdvanceFallback: onNext,
  })

  useEffect(() => {
    if (isHostPresenting) {
      setPlayersModalOpen(false)
    }
  }, [isHostPresenting])

  useEffect(() => {
    if (presentationError) {
      toast.error(
        t(
          "extensions:host.presentationFullscreenError",
          "Fullscreen presentation could not be started.",
        ),
      )
    }
  }, [presentationError, t])

  const beginHostPresentation = () => {
    void enterHostPresentation(presentationRootRef.current)
  }

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
          onPresent={beginHostPresentation}
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
    setSkippedStatus(null)
  })

  const defaultExit = () => undefined

  const {
    currentSceneObj,
    effectiveBackground,
    showCustomCardBackground,
    setCardBgErrorUrl,
    tadazzBackdrop,
    setTadazzImageUnavailable,
    activePhaseCueId,
    hasCompetingMediaAudio,
    activeCardKey,
    motionEnabled,
    sceneKind,
    motionScene,
  } = useLegacyPresentation({
    extensionState,
    manager,
    effectiveRole,
    statusName,
    status,
    questionStates,
  })

  const renderStageContent = () => (
    <ExtensionStateProvider value={extensionState}>
      <ViewRoleContext.Provider value={effectiveRole}>
        <ExtensionStageContent
          extensionState={extensionState}
          openingPlaceholder={Boolean(
            motionEnabled && sceneKind === "opening" && motionScene,
          )}
          tadazzEnabled={
            tadazzBackdrop.source === "tadazz" ||
            tadazzBackdrop.source === "static"
          }
          isManager={Boolean(manager && !isHostPresenting)}
          scenePresenterLabels={createScenePresenterLabels(t)}
          interludeLabels={{
            secondsRemaining: (seconds) =>
              t("extensions:interludes.secondsRemaining", { seconds }),
            awaitingHost: t("extensions:interludes.awaitingHost"),
            skipInterlude: t("extensions:interludes.skipInterlude"),
            skipped: t("extensions:interludes.skipped"),
            slideAlt: t("extensions:interludes.slideAlt"),
          }}
          onCommand={(command) =>
            socket.emit(EXTENSION_EVENTS.COMMAND, command)
          }
        >
          <NativePublicContent role={effectiveRole} theme={theme}>
            {children}
          </NativePublicContent>
        </ExtensionStageContent>
      </ViewRoleContext.Provider>
    </ExtensionStateProvider>
  )

  // TADAZZ show (UPSTREAM_TOUCHES 2026-11-05 T1): own the whole stage so the
  // legacy background/state components are never mounted, not even for a frame.
  // Operator controls and participant interaction stay in native responsive Razzia.
  // The 16:9 composition belongs to the public display / explicit host projection.
  const cinematicSurface = effectiveRole === "spectator" || isHostPresenting
  if (cinematicSurface && isTadazzShowActive(extensionState)) {
    return (
      <ShowThemeRenderer
        envelope={extensionState}
        role={effectiveRole}
        renderers={SHOW_THEME_ADAPTERS}
        viewProps={{
          nativeContent: renderStageContent(),
          manager: Boolean(manager),
          role: effectiveRole,
          statusName,
          extensionState,
          onNext,
          onBack,
          countdown,
          totalPlayers,
          roomMediaReady,
          audioCueId: activePhaseCueId,
          hasCompetingMediaAudio,
          activeCardKey,
          sceneAudio:
            extensionState?.extras.sceneAudio ?? currentSceneObj?.audio,
          isHostPresenting,
          onPresent: beginHostPresentation,
          onExitPresentation: exitHostPresentation,
          presentationRootRef: () => undefined,
        }}
      />
    )
  }

  return (
    <NativeGameFrame
      onRoot={() => undefined}
      theme={theme}
      extensionState={extensionState}
      statusName={statusName}
      role={effectiveRole}
      isHostPresenting={isHostPresenting}
    >
      <GameBackground />

      <div className="relative z-10 flex h-full min-h-0 w-full max-w-full flex-1 flex-col justify-between overflow-hidden">
        {!isConnected && !statusName ? (
          <div className="flex h-full w-full flex-1 flex-col items-center justify-center">
            <Loader className="h-30" />
            <h1 className="text-4xl font-bold text-white">
              {t("common:connecting")}
            </h1>
          </div>
        ) : (
          <>
            {!isHostPresenting && renderHeader()}
            {manager && !isHostPresenting && theme.diagnostics.length > 0 && (
              <p
                role="status"
                data-testid="show-theme-warning"
                className="relative z-50 rounded-lg bg-white px-3 py-2 text-sm text-foreground"
              >
                {t("extensions:themes.invalidChoice")}
              </p>
            )}

            <NativeGameSurface theme={theme}>
              <LegacyStageBackdrops
                contained
                showBase={
                  theme.requested.id === "tadazz-classic" &&
                  theme.diagnostics.length > 0
                }
                tadazzBackdrop={tadazzBackdrop}
                setTadazzImageUnavailable={setTadazzImageUnavailable}
                showCustomCardBackground={showCustomCardBackground}
                effectiveBackground={effectiveBackground}
                setCardBgErrorUrl={setCardBgErrorUrl}
              />

              <div
                key={
                  manager && roomMediaReady
                    ? "media-authorized"
                    : "media-pending"
                }
                className="relative z-10 flex h-full min-h-0 w-full flex-1 flex-col"
              >
                {renderStageContent()}
              </div>
              {motionScene && <TadazzMotionStage scene={motionScene} />}
            </NativeGameSurface>

            <LegacyStageAudio
              extensionState={extensionState}
              effectiveRole={effectiveRole}
              manager={manager}
              roomMediaReady={roomMediaReady}
              activePhaseCueId={activePhaseCueId}
              currentSceneObj={currentSceneObj}
              activeCardKey={activeCardKey}
              statusName={statusName}
              isHostPresenting={isHostPresenting}
              hasCompetingMediaAudio={hasCompetingMediaAudio}
            />

            {manager ? (
              isHostPresenting ? null : (
                <div
                  className={clsx(
                    "z-50 box-border flex max-w-full flex-wrap items-center gap-2 p-2 sm:gap-3 sm:p-4",
                    {
                      "absolute inset-x-0 bottom-0":
                        statusName === STATUS.FINISHED,
                    },
                  )}
                >
                  {inviteCode && statusName !== STATUS.SHOW_ROOM && (
                    <div className="flex shrink-0 items-center gap-2 rounded-lg bg-black/40 px-2.5 py-1 text-sm font-bold text-white drop-shadow-md sm:gap-3 sm:px-3 sm:py-1.5 sm:text-base md:text-xl">
                      {!locked && (
                        <>
                          <span className="max-w-[120px] truncate sm:max-w-none">
                            {window.location.host}
                          </span>
                          <span className="h-4 w-px bg-white/40 sm:h-5" />
                          <span>{inviteCode}</span>
                        </>
                      )}
                      <RoomLockButton className="-mx-1 rounded-md p-1 hover:bg-white/20" />
                    </div>
                  )}

                  <HostPresenceButton
                    hostPresence={hostPresence}
                    players={players}
                    totalPlayers={totalPlayers}
                    isConnected={isConnected}
                    onClick={() => setPlayersModalOpen(true)}
                  />

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
              )
            ) : effectiveRole === "spectator" ? null : (
              <div className="z-50 flex items-center justify-between bg-white px-4 py-2 text-lg font-bold text-white">
                <div className="flex items-center gap-2">
                  <p className="text-gray-800">{player?.username}</p>
                  <PlayerTeamBadge
                    extensionState={extensionState}
                    clientId={clientId}
                    player={player}
                  />
                </div>
                {(gameMode !== QUIZZ_MODES.SURVEY ||
                  (player?.points !== undefined && player.points > 0)) && (
                  <div className="rounded-lg bg-gray-800 px-3 py-1 text-lg">
                    {player?.points}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </NativeGameFrame>
  )
}

const GameWrapper = (props: Props) => {
  const presentationRootRef = useRef<HTMLDivElement | null>(null)
  const managerGameId = useManagerStore((state) => state.gameId)
  const playerGameId = usePlayerStore((state) => state.gameId)
  const gameId =
    props.manager || props.viewRole === "spectator"
      ? managerGameId
      : playerGameId

  return (
    <AudioPreferencesScope key={gameId ?? "pending"}>
      <div
        ref={presentationRootRef}
        className="h-dvh w-full max-w-full"
        data-testid="game-viewport"
      >
        <GameWrapperView {...props} presentationRootRef={presentationRootRef} />
      </div>
    </AudioPreferencesScope>
  )
}

export default GameWrapper
