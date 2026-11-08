import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type ActiveSceneData,
  type ExtensionCommand,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { formatHistoryItem } from "@razzia/extensions/presentation"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import HistoryDialog from "@razzia/web/features/game/components/HistoryDialog"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import clsx from "clsx"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  LogOut,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Timer,
} from "lucide-react"
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

  return (
    <div
      className="box-border flex w-full max-w-full flex-wrap items-center justify-between gap-2 p-2 sm:gap-3 sm:p-4"
      data-testid="manager-control-toolbar"
    >
      {(
        extensionState?.extras.activeSceneData as ActiveSceneData | undefined
      )?.fullShow?.tieCandidates?.map((option) => (
        <Button
          key={option.answerIndex}
          data-testid={`host-resolve-tie-${option.answerIndex}`}
          disabled={isPending}
          onClick={() =>
            sendCommand({
              action: "RESOLVE_STORY_TIE",
              payload: {
                answerIndex: option.answerIndex,
                epoch: extensionState!.epoch,
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

        {isLobby && (
          <RoomLockButton className="hover:bg-accent shrink-0 rounded-lg bg-white px-3 py-2 font-semibold text-black shadow-md" />
        )}

        {gameId && (
          <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-white/20 p-1 shadow-md backdrop-blur-md">
            <Button
              onClick={handleOpenDisplay}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20 sm:px-3 sm:text-sm"
              title={t("extensions:host.openDisplay")}
              data-testid="host-open-display-btn"
            >
              <Monitor className="size-4 shrink-0" />
              <span>{t("extensions:host.openDisplay")}</span>
            </Button>
            <Button
              onClick={handleCopyDisplayUrl}
              className="flex items-center rounded-md p-1.5 text-white hover:bg-white/20"
              title={t("extensions:host.copyDisplayUrl")}
              data-testid="host-copy-display-btn"
            >
              {copiedDisplay ? (
                <Check className="size-4 shrink-0 text-emerald-400" />
              ) : (
                <Copy className="size-4 shrink-0" />
              )}
            </Button>
          </div>
        )}

        {onPresent && (
          <Button
            onClick={onPresent}
            className="bg-primary flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-white shadow-lg hover:brightness-105 sm:px-4 sm:py-2 sm:text-base"
            data-testid="host-present-from-host-btn"
          >
            <Monitor className="size-5 shrink-0" />
            <span>
              {t("extensions:host.presentFromHost", "Present from Host")}
            </span>
          </Button>
        )}

        {/* Exit Button with confirmation when game in progress */}
        {isLobby || isFinished ? (
          <Button
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

        {/* Previous Screen Button (authoritative one-click step back, permanently at upper LEFT) */}
        {gameId && (
          <>
            <Button
              onClick={handlePreviousScreen}
              disabled={!canPrevious || isPending}
              title={
                !canPrevious
                  ? previousReason ||
                    t(
                      "extensions:host.cannotPrevious",
                      "Cannot navigate to previous screen",
                    )
                  : t("extensions:host.previousScreen", "Previous Screen")
              }
              className={clsx(
                "relative flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold shadow-md transition-all active:scale-95 sm:px-4 sm:py-2 sm:text-base",
                canPrevious && !isPending
                  ? "bg-white text-black hover:bg-white/90"
                  : "border border-white/10 bg-white/10 text-white/40 opacity-40",
              )}
              data-testid="host-previous-screen-btn"
            >
              <ChevronLeft className="size-5 shrink-0" />
              <span>
                {t("extensions:host.previousScreen", "Previous Screen")}
              </span>
            </Button>

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
            trigger={
              <Button
                disabled={isPending}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3 py-1.5 text-sm font-bold text-white hover:bg-white/30"
                data-testid="host-restart-question-btn"
              >
                <RotateCcw className="size-4" />
                {t("extensions:host.restartQuestion")}
              </Button>
            }
            title={t("extensions:host.restartQuestion")}
            description={t("extensions:host.restartQuestionDesc")}
            confirmLabel={t("extensions:host.restartQuestion")}
            confirmTestId="confirm-restart-question-btn"
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
        {/* Lobby Start Game */}
        {isLobby && onStartGame && (
          <Button
            onClick={onStartGame}
            className="hover:bg-accent flex shrink-0 items-center gap-2 rounded-lg bg-white px-5 py-2 text-base font-bold text-black shadow-lg sm:px-6 sm:py-2.5 sm:text-lg"
          >
            <Play className="size-5 shrink-0 fill-black" />
            <span>{t("game:startGame")}</span>
          </Button>
        )}

        {/* History button (retained separately on the right) */}
        {canViewHistory && (
          <Button
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

        {!isLobby && !isFinished && (
          <Button
            onClick={handlePauseToggle}
            disabled={isPending}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3 py-1.5 text-sm font-bold text-white shadow-md hover:bg-white/30 sm:px-4 sm:py-2"
            data-testid="host-pause-resume-btn"
          >
            {isPaused ? (
              <Play className="size-4" />
            ) : (
              <Pause className="size-4" />
            )}
            <span>
              {isPaused
                ? t("extensions:host.resumeGame", "Resume")
                : t("extensions:host.pauseGame", "Pause")}
            </span>
          </Button>
        )}

        {/* End Timer button during answering */}
        {canEndTimer && (
          <Button
            onClick={handleEndTimer}
            disabled={isPending}
            className={clsx(
              "bg-primary flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold text-white shadow-lg transition-transform hover:brightness-105 active:scale-95 sm:px-5 sm:py-2.5 sm:text-base",
              isPending && "pointer-events-none opacity-60",
            )}
            data-testid="host-end-timer-btn"
          >
            <Timer className="size-5 shrink-0" />
            <span>{t("extensions:host.endTimer")}</span>
          </Button>
        )}

        {/* Next Screen / Advance button during results, leaderboard, or interlude */}
        {canNextScreen && (
          <Button
            onClick={handleNextScreen}
            disabled={isPending}
            className={clsx(
              "hover:bg-accent relative flex shrink-0 items-center gap-2 overflow-hidden rounded-lg bg-white px-5 py-2 text-sm font-bold text-black shadow-lg active:scale-95 sm:px-6 sm:py-2.5 sm:text-base",
              isPending && "pointer-events-none opacity-60",
            )}
            data-testid="host-next-screen-btn"
          >
            {countdown && (
              <span
                className="bg-primary/30 absolute inset-y-0 left-0"
                style={{
                  animation: `progressBar ${countdown.total}s linear forwards`,
                }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              <span>{t("extensions:host.nextScreen")}</span>
              <ChevronRight className="size-5 shrink-0" />
            </span>
          </Button>
        )}
      </div>

      <p
        className="w-full text-xs text-white/70"
        data-testid="host-shortcut-hint"
      >
        {t("extensions:host.doublePressShortcuts")}
      </p>

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
    </div>
  )
}

export default ManagerControlToolbar
