import { EVENTS, MEDIA_TYPES, QUIZZ_MODES } from "@razzia/common/constants"
import {
  STATUS,
  type Status,
  type StatusDataMap,
} from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  resolveEffectiveCardBackground,
  resolveTadazzStageBackground,
  type TadazzShowBackground,
  type CardAudioOverrides,
  type CardBackgroundOverride,
  type CueId,
  type ExtensionStateEnvelope,
  type HostPresenceSnapshot,
  type Interlude,
  type QuizExtrasV1,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  AudioCuePlayer,
  TADAZZ_IMAGE_URL,
  TadazzAnimatedBackdrop,
  InterludePresenter,
  ScenePresenter,
  StageFitContainer,
  type ScenePresenterProps,
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
import {
  TadazzMotionStage,
  type TadazzMotionScene,
} from "@razzia/web/features/game/components/TadazzMotionStage"
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
import {
  ViewRoleContext,
  type ViewRole,
} from "@razzia/web/features/game/contexts/view-role-context"
import { useTranslation } from "react-i18next"

type Props = PropsWithChildren & {
  statusName: Status | undefined
  onNext?: () => void
  onBack?: () => void
  manager?: boolean
  viewRole?: ViewRole
}

const GameWrapper = ({
  children,
  statusName,
  onNext,
  onBack,
  manager,
  viewRole,
}: Props) => {
  const effectiveRole: ViewRole = manager ? "manager" : (viewRole ?? "player")
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
  const [roomMediaReady, setRoomMediaReady] = useState(false)
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

  // Browser <img>/<audio> elements cannot attach the manager's Bearer token.
  // Refresh the short-lived room media cookie whenever a host opens a room.
  // Remount the stage once authorized so images retried after an initial 401.
  useEffect(() => {
    if (!manager || !gameId) return
    let alive = true
    setRoomMediaReady(false)
    void fetch(`/api/games/${encodeURIComponent(gameId)}/display-media`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => {
        if (alive && response.ok) setRoomMediaReady(true)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [manager, gameId])

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

  useEvent(EVENTS.MANAGER.HOST_PRESENCE, (snapshot: HostPresenceSnapshot) => {
    if (manager) {
      updateManager({ hostPresence: snapshot })
    }
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

  const playerStatus = usePlayerStore((s) => s.status)
  const activeStatus = status ?? playerStatus
  const activeStatusMediaType = (
    activeStatus?.data as { media?: { type?: string } } | undefined
  )?.media?.type

  const currentSceneObj = extensionState?.extras.currentScene as
    | {
        id?: string
        mediaType?: string
        mediaUrl?: string
        muted?: boolean
        background?: CardBackgroundOverride
        audio?: {
          mode?: "inherit" | "mute" | "custom"
          cueId?: CueId
          url?: string
          volume?: number
          loop?: boolean
        }
      }
    | undefined

  const rawCardBackground =
    (extensionState?.extras.cardBackground as
      CardBackgroundOverride | undefined) ?? currentSceneObj?.background

  const effectiveBackground = useMemo(
    () => resolveEffectiveCardBackground(rawCardBackground),
    [rawCardBackground],
  )

  const [cardBgErrorUrl, setCardBgErrorUrl] = useState<string | null>(null)
  const showCustomCardBackground =
    effectiveBackground.mode === "card" &&
    Boolean(effectiveBackground.url) &&
    cardBgErrorUrl !== effectiveBackground.url

  const [tadazzImageUnavailable, setTadazzImageUnavailable] = useState(false)
  const tadazzSettings = (
    extensionState?.extras.defaults as
      { tadazzBackground?: TadazzShowBackground } | undefined
  )?.tadazzBackground
  // Video scenes and card-specific art always override the show backdrop.
  const tadazzBackdrop = resolveTadazzStageBackground({
    settings: tadazzSettings,
    cardBackground: showCustomCardBackground ? rawCardBackground : undefined,
    fullScreenVideo:
      (extensionState?.phase === "scene" &&
        currentSceneObj?.mediaType === "video") ||
      activeStatusMediaType === MEDIA_TYPES.VIDEO,
    imageReady: !tadazzImageUnavailable,
    tadazzImageUrl: TADAZZ_IMAGE_URL,
  })

  const activePhaseCueId: CueId | undefined = useMemo(() => {
    if (!extensionState) {
      return undefined
    }
    if (extensionState.extras.audioCue) {
      return extensionState.extras.audioCue as CueId
    }
    if (extensionState.phase === "scene") {
      return (
        currentSceneObj?.audio?.cueId ??
        (currentSceneObj?.audio?.url ? "start" : undefined)
      )
    }
    if (statusName === STATUS.SHOW_QUESTION) {
      return "showQuestion"
    }
    if (statusName === STATUS.SELECT_ANSWER) {
      return "answersMusic"
    }
    if (statusName === STATUS.SHOW_RESPONSES) {
      return "revealResults"
    }
    if (statusName === STATUS.SHOW_LEADERBOARD) {
      return "leaderboard"
    }
    return undefined
  }, [extensionState, statusName, currentSceneObj])

  const hasCompetingMediaAudio = Boolean(
    activeStatusMediaType === MEDIA_TYPES.VIDEO ||
    activeStatusMediaType === MEDIA_TYPES.AUDIO ||
    (extensionState?.phase === "scene" &&
      (currentSceneObj?.mediaType === "video" ||
        currentSceneObj?.mediaType === "audio") &&
      !currentSceneObj?.muted &&
      Boolean(currentSceneObj?.mediaUrl)),
  )

  const activeCardKey =
    extensionState?.phase === "scene"
      ? (currentSceneObj?.id ?? "scene")
      : (extensionState?.questionId ?? "question")

  // Goldy's original Motion Kit is an explicitly opt-in visual presentation layer.
  // The underlying Razzia manager/player logic remains the source of truth.
  const motionEnabled =
    (manager || effectiveRole === "spectator") &&
    (extensionState?.extras.defaults as { motionKit?: string } | undefined)
      ?.motionKit === "goldy-20261105"
  const sceneKind = (
    extensionState?.extras.currentScene as { kind?: string } | undefined
  )?.kind
  const activeSceneData = extensionState?.extras.activeSceneData as
    | {
        interimResults?: {
          questionText: string
          options: Array<{
            answerIndex?: number
            label: string
            imageUrl?: string
            count?: number
          }>
        }
      }
    | undefined
  const motionResults = activeSceneData?.interimResults
  const motionQuestionIndex = questionStates?.current ?? 1
  const motionQuestion =
    motionResults?.options?.length === 5 && sceneKind === "interimResults"
      ? {
          question: motionResults.questionText,
          round: motionQuestionIndex <= 5 ? 1 : 2,
          number: motionQuestionIndex,
          totalQuestions: questionStates?.total ?? 10,
          options: motionResults.options.map((opt) => ({
            label: opt.label,
            image: opt.imageUrl ?? "",
          })),
        }
      : undefined
  const motionMode =
    sceneKind === "opening"
      ? "intro"
      : sceneKind === "transition"
        ? "transition"
        : sceneKind === "interimResults"
          ? "results"
          : null
  const motionScene: TadazzMotionScene | null =
    motionEnabled &&
    motionMode &&
    (motionMode === "intro" ||
      motionMode === "transition" ||
      (motionQuestion?.question &&
        motionQuestion.options.every((option) => Boolean(option.image))))
      ? {
          key: [
            extensionState?.gameId ?? "",
            motionMode,
            motionQuestionIndex,
            extensionState?.epoch ?? 0,
            extensionState?.questionId ?? "",
            sceneKind ?? "",
          ].join(":"),
          mode: motionMode,
          question: motionQuestion,
          counts: motionResults?.options.map((opt) => opt.count ?? 0),
        }
      : null

  const renderStageContent = () => {
    // The Goldy Motion Kit paints the whole branded opening. Do not mount
    // the legacy black cinema card underneath while its iframe initializes.
    // The manager's independent Next Screen control remains available.
    if (motionEnabled && sceneKind === "opening" && motionScene) {
      return (
        <ExtensionStateProvider value={extensionState}>
          <ViewRoleContext.Provider value={effectiveRole}>
            <div
              data-testid="tadazz-opening-background"
              className="flex min-h-0 w-full flex-1"
            />
          </ViewRoleContext.Provider>
        </ExtensionStateProvider>
      )
    }

    if (!extensionState) {
      return (
        <ExtensionStateProvider value={extensionState}>
          <ViewRoleContext.Provider value={effectiveRole}>
            <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </ViewRoleContext.Provider>
        </ExtensionStateProvider>
      )
    }

    if (
      extensionState.phase === "scene" &&
      (Boolean(extensionState.extras.currentScene) ||
        (extensionState.extras.activeTimelineStep &&
          (extensionState.extras.activeTimelineStep as { kind?: string })
            .kind !== "question"))
    ) {
      const activeStep = extensionState.extras.activeTimelineStep as
        ScenePresenterProps["step"] | undefined
      const currentScene = extensionState.extras.currentScene as
        ScenePresenterProps["scene"] | undefined
      const activeSceneData = extensionState.extras.activeSceneData as
        ScenePresenterProps["activeSceneData"] | undefined
      const globalStageAnimations = (
        extensionState.extras.defaults as
          | { stageAnimations?: ScenePresenterProps["globalStageAnimations"] }
          | undefined
      )?.stageAnimations

      const scenePresenterLabels: ScenePresenterProps["labels"] = {
        rankLabel: t("extensions:studio.scene.rankLabel", "Rank"),
        scoreLabel: t("extensions:studio.scene.scoreLabel", "pts"),
        noRankingsYet: t(
          "extensions:studio.scene.noRankingsYet",
          "No player scores yet.",
        ),
        noResponsesYet: t(
          "extensions:studio.scene.noResponsesYet",
          "No responses recorded yet.",
        ),
        votesSuffix: t("extensions:studio.scene.votesSuffix", "votes"),
        advanceButtonLabel: t(
          "extensions:studio.scene.advanceButtonLabel",
          "Next →",
        ),
        intermissionDefaultTitle: t(
          "extensions:studio.scene.intermissionDefaultTitle",
          "Take a Breather",
        ),
        intermissionDefaultSubtitle: t(
          "extensions:studio.scene.intermissionDefaultSubtitle",
          "The next question will begin shortly...",
        ),
        leaderboardDefaultTitle: t(
          "extensions:studio.scene.leaderboardDefaultTitle",
          "Leaderboard",
        ),
        leaderboardDefaultSubtitle: t(
          "extensions:studio.scene.leaderboardDefaultSubtitle",
          "Top scorers right now",
        ),
        interimResultsDefaultTitle: t(
          "extensions:studio.scene.interimResultsDefaultTitle",
          "Interim Results",
        ),
        interimResultsDefaultSubtitle: t(
          "extensions:studio.scene.interimResultsDefaultSubtitle",
          "Latest question breakdown",
        ),
      }

      return (
        <ExtensionStateProvider value={extensionState}>
          <ViewRoleContext.Provider value={effectiveRole}>
            <StageFitContainer className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 sm:p-2 md:p-4">
              <ScenePresenter
                step={activeStep}
                scene={currentScene}
                activeSceneData={activeSceneData}
                globalStageAnimations={globalStageAnimations}
                tadazzEnabled={
                  tadazzBackdrop.source === "tadazz" ||
                  tadazzBackdrop.source === "static"
                }
                labels={scenePresenterLabels}
                serverStartedAt={extensionState.startedAt}
                epoch={extensionState.epoch}
                isManager={Boolean(manager)}
                onMediaEnded={() => {
                  if (manager && extensionState.gameId) {
                    socket.emit(EXTENSION_EVENTS.COMMAND, {
                      v: 1,
                      gameId: extensionState.gameId,
                      action: "ADVANCE_TIMELINE_SCENE",
                      payload: {
                        epoch: extensionState.epoch,
                        sceneId: activeStep?.sceneId ?? currentScene?.id,
                        timelineStepIndex: activeStep?.stepIndex,
                        reason: "mediaEnded",
                      },
                      requestId: `media-end-${extensionState.epoch}-${activeStep?.stepIndex ?? 0}`,
                    })
                  }
                }}
                onAdvance={() => {
                  if (manager && extensionState.gameId) {
                    socket.emit(EXTENSION_EVENTS.COMMAND, {
                      v: 1,
                      gameId: extensionState.gameId,
                      action: "ADVANCE_TIMELINE_SCENE",
                      payload: {
                        epoch: extensionState.epoch,
                      },
                      requestId: `adv-${Date.now()}`,
                    })
                  }
                }}
                onSkip={() => {
                  if (manager && extensionState.gameId) {
                    socket.emit(EXTENSION_EVENTS.COMMAND, {
                      v: 1,
                      gameId: extensionState.gameId,
                      action: "SKIP_TIMELINE_SCENE",
                      payload: {
                        epoch: extensionState.epoch,
                      },
                      requestId: `skip-${Date.now()}`,
                    })
                  }
                }}
              />
            </StageFitContainer>
          </ViewRoleContext.Provider>
        </ExtensionStateProvider>
      )
    }

    if (
      extensionState.phase === "interlude" &&
      extensionState.extras.interlude
    ) {
      return (
        <ExtensionStateProvider value={extensionState}>
          <ViewRoleContext.Provider value={effectiveRole}>
            <StageFitContainer className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 sm:p-2 md:p-4">
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
            </StageFitContainer>
          </ViewRoleContext.Provider>
        </ExtensionStateProvider>
      )
    }

    return (
      <ExtensionStateProvider value={extensionState}>
        <ViewRoleContext.Provider value={effectiveRole}>
          <StageFitContainer className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
            {children}
          </StageFitContainer>
        </ViewRoleContext.Provider>
      </ExtensionStateProvider>
    )
  }

  return (
    <section className="relative isolate flex h-dvh max-h-dvh w-full max-w-full flex-col overflow-hidden">
      <GameBackground />

      {(tadazzBackdrop.source === "tadazz" ||
        tadazzBackdrop.source === "static") && (
        <div className="pointer-events-none fixed inset-0 z-[1] overflow-hidden">
          <TadazzAnimatedBackdrop
            state={tadazzBackdrop}
            onImageFailure={() => setTadazzImageUnavailable(true)}
          />
        </div>
      )}

      {showCustomCardBackground && effectiveBackground.url && (
        <div
          data-testid="stage-card-background"
          data-bg-url={effectiveBackground.url}
          data-bg-fit={effectiveBackground.fit}
          data-bg-position={effectiveBackground.position}
          className="pointer-events-none fixed inset-0 z-[1] overflow-hidden"
        >
          <img
            src={effectiveBackground.url}
            alt=""
            onError={() => setCardBgErrorUrl(effectiveBackground.url ?? null)}
            className={clsx(
              "pointer-events-none h-full w-full select-none",
              effectiveBackground.fit === "contain"
                ? "object-contain"
                : "object-cover",
              effectiveBackground.position === "top" && "object-top",
              effectiveBackground.position === "bottom" && "object-bottom",
              effectiveBackground.position === "left" && "object-left",
              effectiveBackground.position === "right" && "object-right",
              effectiveBackground.position === "center" && "object-center",
            )}
          />
          {effectiveBackground.overlayOpacity > 0 && (
            <div
              data-testid="stage-card-background-overlay"
              className="pointer-events-none absolute inset-0 bg-black"
              style={{ opacity: effectiveBackground.overlayOpacity }}
            />
          )}
        </div>
      )}

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
            {renderHeader()}

            <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden">
              <div
                key={
                  manager && roomMediaReady
                    ? "media-authorized"
                    : "media-pending"
                }
                className="flex h-full min-h-0 w-full flex-1 flex-col"
              >
                {renderStageContent()}
              </div>
              {motionScene && <TadazzMotionStage scene={motionScene} />}
            </div>

            {extensionState && (!manager || roomMediaReady) && (
              <AudioCuePlayer
                cueId={activePhaseCueId}
                audioExtras={
                  extensionState.extras.audio as
                    QuizExtrasV1["audio"] | undefined
                }
                cardAudioCues={
                  extensionState.extras.cardAudioCues as
                    CardAudioOverrides | undefined
                }
                sceneAudio={
                  (extensionState.extras.sceneAudio as
                    | {
                        mode?: "inherit" | "mute" | "custom"
                        cueId?: CueId
                        url?: string
                        volume?: number
                        loop?: boolean
                      }
                    | undefined) ?? currentSceneObj?.audio
                }
                gameId={extensionState.gameId}
                activeCardKey={activeCardKey}
                phase={
                  extensionState.phase === "scene"
                    ? "scene"
                    : (statusName ?? extensionState.phase)
                }
                epoch={extensionState.epoch}
                hasCompetingMedia={hasCompetingMediaAudio}
              />
            )}

            {manager ? (
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
                      "ml-auto flex shrink-0 items-center gap-1.5 rounded-lg bg-black/40 px-2.5 py-1 text-sm font-bold text-white drop-shadow-md transition-colors hover:bg-black/60 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-base md:text-xl",
                      !isConnected && "opacity-60",
                    )}
                  >
                    <Users className="size-5" />
                    <span data-testid="host-connected-counter">
                      {(() => {
                        const connectedCount =
                          hostPresence?.connectedNow ??
                          players.filter((p) => p.connected).length
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
                    <span className="ml-1 hidden items-center gap-1 rounded bg-white/20 px-2 py-0.5 text-xs font-semibold sm:inline-flex">
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
            ) : effectiveRole === "spectator" ? null : (
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
    </section>
  )
}

export default GameWrapper
