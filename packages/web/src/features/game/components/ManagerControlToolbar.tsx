// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  readPlatformOpening,
  type ActiveSceneData,
  type ExtensionCommand,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { formatHistoryItem } from "@razzia/extensions/presentation"
import {
  AlertDialog,
  Button,
  PlatformScope,
  HostDisplayControls,
  PresentationControls,
  type PresentationControlsProps,
} from "@razzia/extensions/platform-ui"
import HistoryDialog from "@razzia/web/features/game/components/HistoryDialog"
import HostShortcutsDialog from "@razzia/web/features/game/components/HostShortcutsDialog"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { History, LogOut, SkipForward } from "lucide-react"
import { useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

/**
 * Determines whether a keyboard shortcut (Space / Enter) should be ignored
 * to avoid hijacking interactive elements, open dialogs, or form controls.
 */
export function shouldIgnoreKeyboardShortcut(
  e: KeyboardEvent,
  isHistoryOpen = false,
  allowAlt = false,
): boolean {
  if (e.ctrlKey || e.metaKey || (!allowAlt && e.altKey) || e.defaultPrevented) {
    return true
  }

  if (isHistoryOpen) {
    return true
  }

  const active =
    (e.target as HTMLElement | null) ??
    (typeof document !== "undefined"
      ? (document.activeElement as HTMLElement | null)
      : null)

  if (active) {
    const tag = active.tagName ? active.tagName.toUpperCase() : ""

    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      return true
    }

    if (active.isContentEditable) {
      return true
    }

    if (tag === "BUTTON" || tag === "A") {
      return true
    }

    if (
      active.getAttribute("role") === "button" ||
      active.getAttribute("role") === "link"
    ) {
      return true
    }

    if (
      typeof active.closest === "function" &&
      active.closest(
        "dialog, [role='dialog'], [role='alertdialog'], [data-state='open'], [data-radix-portal]",
      )
    ) {
      return true
    }
  }

  if (typeof document !== "undefined") {
    const openDialogs = document.getElementsByTagName("dialog")

    for (const dialog of openDialogs) {
      if (dialog.hasAttribute("open")) {
        return true
      }
    }
  }

  return false
}

interface Props {
  statusName: Status | null
  extensionState: ExtensionStateEnvelope | null
  questionStates: { current: number; total: number | null } | null
  onExit: () => void
  onStartGame?: () => void
  onAdvanceFallback?: () => void
  onPresent?: () => void
  countdown?: { seconds: number; total: number } | null
}

const generateRequestId = (action: string) =>
  `${action}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

export const ManagerControlToolbar = ({
  statusName,
  extensionState,
  questionStates,
  onExit,
  onStartGame,
  onAdvanceFallback,
  onPresent,
  countdown,
}: Props) => {
  const { t } = useTranslation()
  const { socket } = useSocket()
  const [isPending, setIsPending] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false)
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState<
    number | null
  >(null)

  const gameId = extensionState?.gameId
  const [copiedDisplay, setCopiedDisplay] = useState(false)

  const handleOpenDisplay = useCallback(() => {
    if (!gameId || typeof window === "undefined") {
      return
    }

    window.open(`/display/${gameId}`, "_blank")
  }, [gameId])

  const handleCopyDisplayUrl = useCallback(async () => {
    if (!gameId || typeof window === "undefined") {
      return
    }

    const url = `${window.location.origin}/display/${gameId}`

    try {
      await navigator.clipboard.writeText(url)
      setCopiedDisplay(true)
      setTimeout(() => setCopiedDisplay(false), 2000)
    } catch {
      // Fallback
    }
  }, [gameId])

  const currentQuestionIdx = Math.max(0, (questionStates?.current ?? 1) - 1)
  const isInterlude = extensionState?.phase === "interlude"
  const epoch = extensionState?.epoch
  const phase = extensionState?.phase
  const isPaused = Boolean(extensionState?.pause?.paused)

  const sendCommand = useCallback(
    (
      command: Omit<ExtensionCommand, "v" | "gameId" | "requestId"> & {
        gameId?: string
        requestId?: string
      },
    ) => {
      if (!gameId || isPending) {
        return
      }

      setIsPending(true)
      socket.emit(EXTENSION_EVENTS.COMMAND, {
        v: 1,
        gameId,
        action: command.action,
        payload: command.payload,
        requestId: generateRequestId(command.action),
      })
      setTimeout(() => {
        setIsPending(false)
      }, 800)
    },
    [gameId, isPending, socket],
  )

  // 1. End Timer action
  const handleEndTimer = useCallback(() => {
    if (!gameId) {
      return
    }

    sendCommand({
      action: "END_ANSWER_TIMER",
      payload: {
        questionIndex: currentQuestionIdx,
        epoch,
      },
    })
  }, [gameId, currentQuestionIdx, epoch, sendCommand])

  // 2. Next Screen action
  const handlePauseToggle = useCallback(() => {
    if (!gameId) {
      return
    }

    sendCommand({
      action: isPaused ? "RESUME_GAME" : "PAUSE_GAME",
      payload: { epoch },
    })
  }, [epoch, gameId, isPaused, sendCommand])

  const handleNextScreen = useCallback(() => {
    if (!gameId) {
      onAdvanceFallback?.()

      return
    }

    if (isInterlude) {
      sendCommand({
        action: "END_OR_SKIP_INTERLUDE",
        payload: {
          reason: "manual",
          epoch,
        },
      })
    } else {
      sendCommand({
        action: "NEXT_SCREEN",
        payload: {
          phase,
          epoch,
        },
      })
    }
  }, [gameId, onAdvanceFallback, isInterlude, epoch, phase, sendCommand])

  // 2b. Previous Screen action (authoritative one-step back)
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false)

  const willReopenQuestion =
    Boolean(extensionState?.extras?.willReopenQuestion) ||
    statusName === STATUS.SELECT_ANSWER ||
    statusName === STATUS.SHOW_RESPONSES

  const canPreviousAuthoritative =
    typeof extensionState?.extras?.canPrevious === "boolean"
      ? extensionState.extras.canPrevious
      : currentQuestionIdx > 0 &&
        statusName !== STATUS.SHOW_ROOM &&
        statusName !== STATUS.FINISHED &&
        statusName !== STATUS.SUMMARY

  const isLobby = statusName === STATUS.SHOW_ROOM
  const launch = readPlatformOpening(extensionState?.extras.presentationLaunch)
  const isPreLobby = launch?.stage === "standby" || launch?.stage === "opening"
  const isFinished =
    statusName === STATUS.FINISHED || statusName === STATUS.SUMMARY
  const canPrevious = canPreviousAuthoritative && !isLobby && !isFinished

  const previousReason =
    (extensionState?.extras?.previousReason as string | undefined) ??
    (isLobby
      ? t("extensions:host.cannotPreviousLobby", "At start of show")
      : undefined)

  const executePreviousScreen = useCallback(
    (confirmed = false) => {
      if (!gameId || isPending || !canPrevious) {
        return
      }

      sendCommand({
        action: "PREVIOUS_SCREEN",
        payload: {
          phase,
          epoch,
          confirmed,
        },
      })
    },
    [gameId, isPending, canPrevious, phase, epoch, sendCommand],
  )

  const handlePreviousScreen = useCallback(() => {
    if (!gameId || isPending || !canPrevious) {
      return
    }

    if (willReopenQuestion) {
      setReopenConfirmOpen(true)
    } else {
      executePreviousScreen(false)
    }
  }, [
    gameId,
    isPending,
    canPrevious,
    willReopenQuestion,
    executePreviousScreen,
  ])

  // 3. Skip Question action
  const handleSkipQuestion = () => {
    if (!gameId) {
      return
    }

    sendCommand({
      action: "SKIP_QUESTION",
      payload: {
        questionIndex: currentQuestionIdx,
        reason: "Host skipped question",
        epoch: extensionState.epoch,
      },
    })
  }

  // 4. View History action
  const handleOpenHistory = () => {
    setHistoryOpen(true)
    const targetIdx = Math.max(0, currentQuestionIdx - 1)
    setSelectedHistoryIndex(targetIdx)

    if (gameId) {
      sendCommand({
        action: "VIEW_HISTORY",
        payload: {
          questionIndex: targetIdx,
          epoch,
        },
      })
    }
  }

  const handleSelectHistoryIndex = (idx: number) => {
    setSelectedHistoryIndex(idx)

    if (gameId) {
      sendCommand({
        action: "VIEW_HISTORY",
        payload: {
          questionIndex: idx,
          epoch,
        },
      })
    }
  }

  const handleCloseHistory = () => {
    setHistoryOpen(false)
    setSelectedHistoryIndex(null)

    if (gameId) {
      sendCommand({
        action: "VIEW_HISTORY",
        payload: {},
      })
    }
  }

  // 5. Replay from checkpoint action
  const handleReplayFromCheckpoint = (index: number) => {
    if (!gameId) {
      return
    }

    sendCommand({
      action: "REPLAY_FROM_CHECKPOINT",
      payload: {
        questionIndex: index,
        confirmed: true,
        epoch: extensionState.epoch,
      },
    })
    setHistoryOpen(false)
    setSelectedHistoryIndex(null)
  }

  // Primary action shortcut handler (Space / Enter) with robust focus & modal protection
  const isScene =
    extensionState?.phase === "scene" ||
    Boolean(
      extensionState?.extras?.activeTimelineStep &&
      (extensionState.extras.activeTimelineStep as { kind?: string }).kind !==
        "question",
    )

  // Active viewing history snapshot normalized from backend QuestionResult or HistorySummaryItem
  const viewingHistoryEnvelope = extensionState?.extras.viewingHistory as
    | {
        index: number
        data?: unknown
      }
    | undefined

  const historyItem = useMemo(
    () =>
      viewingHistoryEnvelope?.data
        ? formatHistoryItem(
            viewingHistoryEnvelope.data,
            selectedHistoryIndex ?? viewingHistoryEnvelope.index,
          )
        : null,
    [viewingHistoryEnvelope, selectedHistoryIndex],
  )

  const canSkipQuestion =
    statusName === STATUS.SHOW_PREPARED ||
    statusName === STATUS.SHOW_QUESTION ||
    statusName === STATUS.SELECT_ANSWER
  const canEndTimer = statusName === STATUS.SELECT_ANSWER
  const canRestartQuestion =
    !isLobby &&
    !isFinished &&
    (questionStates?.current ?? 0) > 0 &&
    (statusName === STATUS.SHOW_QUESTION ||
      statusName === STATUS.SELECT_ANSWER ||
      statusName === STATUS.SHOW_RESPONSES ||
      phase === "responses")
  const canNextScreen =
    statusName === STATUS.SHOW_RESPONSES ||
    statusName === STATUS.SHOW_LEADERBOARD ||
    isInterlude ||
    isScene
  const canViewHistory = currentQuestionIdx > 0 && !isLobby && !isFinished
  const resolveNextAction = (): PresentationControlsProps["next"] => {
    if (isLobby && onStartGame) {
      return {
        state: "start",
        onClick: onStartGame,
        disabled: isPending,
      }
    }

    if (canEndTimer) {
      return {
        state: "endTimer",
        onClick: handleEndTimer,
        disabled: isPending,
        testId: "host-end-timer-btn",
      }
    }

    if (canNextScreen) {
      return {
        onClick: handleNextScreen,
        disabled: isPending,
        testId: "host-next-screen-btn",
        progress:
          countdown && countdown.total > 0
            ? 1 - countdown.seconds / countdown.total
            : undefined,
      }
    }

    return undefined
  }

  return (
    <PlatformScope
      context="platform.host"
      className="tds-host-toolbar font-display relative z-50 box-border flex w-full max-w-full shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2"
      data-testid="manager-control-toolbar"
      data-host-lobby={isLobby ? "true" : "false"}
    >
      {(
        extensionState?.extras.activeSceneData as ActiveSceneData | undefined
      )?.fullShow?.tieCandidates?.map((option) => (
        <Button
          size="sm"
          key={option.answerIndex}
          data-testid={`host-resolve-tie-${option.answerIndex}`}
          disabled={isPending}
          onClick={() =>
            sendCommand({
              action: "RESOLVE_STORY_TIE",
              payload: {
                answerIndex: option.answerIndex,
                epoch: extensionState?.epoch,
              },
            })
          }
        >
          {option.label}
        </Button>
      ))}
      {/* Left section: Progress / Question Counter & Room Lock */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        {questionStates && !isLobby && !isFinished && (
          <div
            className="flex shrink-0 items-center rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-sm font-bold text-white shadow-md backdrop-blur-md sm:px-4 sm:py-2 sm:text-base md:text-lg"
            data-testid="host-question-counter"
          >
            {`${questionStates.current} / ${questionStates.total}`}
          </div>
        )}

        {isLobby && !isPreLobby && (
          <RoomLockButton className="hover:bg-accent shrink-0 rounded-lg bg-white px-3 py-2 font-semibold text-black shadow-md" />
        )}

        <HostDisplayControls
          gameId={gameId}
          onOpen={handleOpenDisplay}
          onCopy={handleCopyDisplayUrl}
          copied={copiedDisplay}
          onPresent={onPresent}
        />

        {/* Exit Button with confirmation when game in progress */}
        {isLobby || isFinished ? (
          <Button
            size="sm"
            onClick={onExit}
            className="hover:bg-accent flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-black shadow-md sm:px-4 sm:py-2 sm:text-base"
            data-testid="host-exit-btn"
          >
            <LogOut className="size-4 shrink-0" />
            <span>{t("common:exit")}</span>
          </Button>
        ) : (
          <AlertDialog
            trigger={
              <Button
                size="sm"
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/30 px-3 py-1.5 text-sm font-bold text-white shadow-md backdrop-blur-md hover:bg-white/40 sm:px-4 sm:py-2 sm:text-base"
                data-testid="host-exit-btn"
              >
                <LogOut className="size-4 shrink-0" />
                <span>{t("common:exit")}</span>
              </Button>
            }
            title={t("extensions:host.exitConfirmTitle")}
            description={t("extensions:host.exitConfirmDesc")}
            confirmLabel={t("common:exit")}
            onConfirm={onExit}
          />
        )}

        {/* Confirmation for authoritative previous-screen navigation. */}
        {gameId && !isPreLobby && (
          <>
            <AlertDialog
              open={reopenConfirmOpen}
              onOpenChange={setReopenConfirmOpen}
              title={
                statusName === STATUS.SELECT_ANSWER
                  ? t(
                      "extensions:host.cancelActiveVoteConfirmTitle",
                      "Cancel Active Vote",
                    )
                  : t("extensions:host.reopenConfirmTitle", "Reopen Question")
              }
              description={
                statusName === STATUS.SELECT_ANSWER
                  ? t(
                      "extensions:host.cancelActiveVoteConfirmDesc",
                      "Navigating back will cancel the current voting round and discard submitted answers. Continue?",
                    )
                  : t(
                      "extensions:host.reopenConfirmDesc",
                      "Going back will reopen this question, discard its previous votes, and replace its score. Continue?",
                    )
              }
              confirmLabel={t(
                "extensions:host.reopenConfirmButton",
                "Continue",
              )}
              confirmTestId="confirm-reopen-question-btn"
              onConfirm={() => {
                setReopenConfirmOpen(false)
                executePreviousScreen(true)
              }}
            />
          </>
        )}
      </div>

      {/* Right section: Control buttons */}
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:ml-auto sm:gap-2">
        {canRestartQuestion && (
          <AlertDialog
            open={restartConfirmOpen}
            onOpenChange={setRestartConfirmOpen}
            title={t("extensions:host.restartQuestion")}
            description={t("extensions:host.restartQuestionDesc")}
            confirmLabel={t("extensions:host.restartQuestion")}
            confirmTestId="confirm-restart-question-btn"
            returnFocusTo='[data-testid="host-restart-question-btn"]'
            onConfirm={() =>
              sendCommand({
                action: "REPLAY_FROM_CHECKPOINT",
                payload: {
                  questionIndex: currentQuestionIdx,
                  epoch,
                  confirmed: true,
                },
              })
            }
          />
        )}

        {/* History button (retained separately on the right) */}
        {canViewHistory && (
          <Button
            size="sm"
            onClick={handleOpenHistory}
            disabled={isPending}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-md hover:bg-white/30 sm:px-3.5 sm:py-2 sm:text-sm"
            data-testid="host-history-btn"
          >
            <History className="size-4 shrink-0" />
            <span>{t("extensions:host.history", "History")}</span>
          </Button>
        )}

        {/* Skip Question (with explicit confirmation) */}
        {canSkipQuestion && (
          <AlertDialog
            trigger={
              <Button
                size="sm"
                disabled={isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3 py-1.5 text-xs font-semibold text-white shadow-md backdrop-blur-md hover:bg-white/30 sm:px-3.5 sm:py-2 sm:text-sm"
                data-testid="host-skip-question-btn"
              >
                <SkipForward className="size-4 shrink-0" />
                <span>{t("extensions:host.skipQuestion")}</span>
              </Button>
            }
            title={t("extensions:host.skipQuestionConfirmTitle")}
            description={t("extensions:host.skipQuestionConfirmDesc")}
            confirmLabel={t("extensions:host.skipQuestion")}
            onConfirm={handleSkipQuestion}
          />
        )}

        <PresentationControls
          previous={
            gameId && !isPreLobby
              ? {
                  onClick: handlePreviousScreen,
                  disabled: !canPrevious || isPending,
                  description: !canPrevious
                    ? previousReason ||
                      t(
                        "extensions:host.cannotPrevious",
                        "Cannot navigate to previous screen",
                      )
                    : undefined,
                  testId: "host-previous-screen-btn",
                }
              : undefined
          }
          playback={
            launch?.stage === "opening" ||
            launch?.stage === "closing" ||
            (!isLobby && !isFinished)
              ? {
                  state: isPaused ? "paused" : "playing",
                  onClick: handlePauseToggle,
                  disabled: isPending,
                  testId: "host-pause-resume-btn",
                }
              : undefined
          }
          next={resolveNextAction()}
          replay={
            canRestartQuestion
              ? {
                  question: true,
                  onClick: () => setRestartConfirmOpen(true),
                  disabled: isPending,
                  testId: "host-restart-question-btn",
                }
              : undefined
          }
        />
      </div>

      <HostShortcutsDialog />

      {/* History Viewer Modal */}
      <HistoryDialog
        open={historyOpen}
        onClose={handleCloseHistory}
        currentQuestionIdx={currentQuestionIdx}
        selectedHistoryIndex={selectedHistoryIndex}
        onSelectHistoryIndex={handleSelectHistoryIndex}
        historyItem={historyItem}
        onReplayFromCheckpoint={handleReplayFromCheckpoint}
      />
    </PlatformScope>
  )
}

export default ManagerControlToolbar
