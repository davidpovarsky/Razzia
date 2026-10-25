import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type ExtensionCommand,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { formatHistoryItem } from "@razzia/extensions/presentation"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import clsx from "clsx"
import {
  ArrowLeft,
  ChevronRight,
  History,
  LogOut,
  Play,
  RotateCcw,
  SkipForward,
  Timer,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

/**
 * Determines whether a keyboard shortcut (Space / Enter) should be ignored
 * to avoid hijacking interactive elements, open dialogs, or form controls.
 */
export function shouldIgnoreKeyboardShortcut(
  e: KeyboardEvent,
  isHistoryOpen = false,
): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) {
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
  const currentQuestionIdx = Math.max(0, (questionStates?.current ?? 1) - 1)
  const isInterlude = extensionState?.phase === "interlude"
  const epoch = extensionState?.epoch
  const phase = extensionState?.phase

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
          epoch: extensionState.epoch,
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
          epoch: extensionState.epoch,
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
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && historyOpen) {
        setHistoryOpen(false)

        return
      }

      if (e.key === " " || e.key === "Enter") {
        if (shouldIgnoreKeyboardShortcut(e, historyOpen)) {
          return
        }

        if (statusName === STATUS.SELECT_ANSWER) {
          e.preventDefault()
          handleEndTimer()
        } else if (
          statusName === STATUS.SHOW_RESPONSES ||
          statusName === STATUS.SHOW_LEADERBOARD ||
          isInterlude
        ) {
          e.preventDefault()
          handleNextScreen()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [historyOpen, statusName, isInterlude, handleEndTimer, handleNextScreen])

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

  const isLobby = statusName === STATUS.SHOW_ROOM
  const isFinished =
    statusName === STATUS.FINISHED || statusName === STATUS.SUMMARY
  const canSkipQuestion =
    statusName === STATUS.SHOW_PREPARED ||
    statusName === STATUS.SHOW_QUESTION ||
    statusName === STATUS.SELECT_ANSWER
  const canEndTimer = statusName === STATUS.SELECT_ANSWER
  const canNextScreen =
    statusName === STATUS.SHOW_RESPONSES ||
    statusName === STATUS.SHOW_LEADERBOARD ||
    isInterlude
  const canViewHistory = currentQuestionIdx > 0 && !isLobby && !isFinished

  return (
    <div className="flex w-full items-center justify-between gap-3 p-4">
      {/* Left section: Progress / Question Counter & Room Lock */}
      <div className="flex items-center gap-2">
        {questionStates && !isLobby && !isFinished && (
          <div className="flex items-center rounded-lg border border-white/10 bg-black/50 px-4 py-2 text-lg font-bold text-white shadow-md backdrop-blur-md">
            {`${questionStates.current} / ${questionStates.total}`}
          </div>
        )}

        {isLobby && (
          <RoomLockButton className="hover:bg-accent rounded-lg bg-white px-3 py-2 font-semibold text-black shadow-md" />
        )}

        {/* Exit Button with confirmation when game in progress */}
        {isLobby || isFinished ? (
          <Button
            onClick={onExit}
            className="hover:bg-accent flex items-center gap-1.5 rounded-lg bg-white px-4 py-2 font-bold text-black shadow-md"
          >
            <LogOut className="size-4" />
            {t("common:exit")}
          </Button>
        ) : (
          <AlertDialog
            trigger={
              <Button className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/30 px-4 py-2 font-bold text-white shadow-md backdrop-blur-md hover:bg-white/40">
                <LogOut className="size-4" />
                {t("common:exit")}
              </Button>
            }
            title={t("extensions:host.exitConfirmTitle")}
            description={t("extensions:host.exitConfirmDesc")}
            confirmLabel={t("common:exit")}
            onConfirm={onExit}
          />
        )}
      </div>

      {/* Right section: Control buttons */}
      <div className="ml-auto flex items-center gap-2">
        {/* Lobby Start Game */}
        {isLobby && onStartGame && (
          <Button
            onClick={onStartGame}
            className="hover:bg-accent flex items-center gap-2 rounded-lg bg-white px-6 py-2.5 text-lg font-bold text-black shadow-lg"
          >
            <Play className="size-5 fill-black" />
            {t("game:startGame")}
          </Button>
        )}

        {/* Previous / History button */}
        {canViewHistory && (
          <Button
            onClick={handleOpenHistory}
            disabled={isPending}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3.5 py-2 font-semibold text-white shadow-md backdrop-blur-md hover:bg-white/30"
          >
            <History className="size-4" />
            <span>{t("extensions:host.previous")}</span>
          </Button>
        )}

        {/* Skip Question (with explicit confirmation) */}
        {canSkipQuestion && (
          <AlertDialog
            trigger={
              <Button
                disabled={isPending}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/20 px-3.5 py-2 font-semibold text-white shadow-md backdrop-blur-md hover:bg-white/30"
              >
                <SkipForward className="size-4" />
                <span>{t("extensions:host.skipQuestion")}</span>
              </Button>
            }
            title={t("extensions:host.skipQuestionConfirmTitle")}
            description={t("extensions:host.skipQuestionConfirmDesc")}
            confirmLabel={t("extensions:host.skipQuestion")}
            onConfirm={handleSkipQuestion}
          />
        )}

        {/* End Timer button during answering */}
        {canEndTimer && (
          <Button
            onClick={handleEndTimer}
            disabled={isPending}
            className={clsx(
              "flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-base font-bold text-white shadow-lg transition-transform hover:bg-amber-600 active:scale-95",
              isPending && "pointer-events-none opacity-60",
            )}
          >
            <Timer className="size-5" />
            <span>{t("extensions:host.endTimer")}</span>
          </Button>
        )}

        {/* Next Screen / Advance button during results, leaderboard, or interlude */}
        {canNextScreen && (
          <Button
            onClick={handleNextScreen}
            disabled={isPending}
            className={clsx(
              "hover:bg-accent relative flex items-center gap-2 overflow-hidden rounded-lg bg-white px-6 py-2.5 text-base font-bold text-black shadow-lg active:scale-95",
              isPending && "pointer-events-none opacity-60",
            )}
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
              <ChevronRight className="size-5" />
            </span>
          </Button>
        )}
      </div>

      {/* History Viewer Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-background border-border relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <History className="text-primary size-5" />
                <h3 className="text-foreground text-xl font-bold">
                  {t("extensions:host.previous")}
                </h3>
              </div>
              <Button
                onClick={handleCloseHistory}
                className="bg-accent text-accent-foreground rounded-lg px-3 py-1.5 text-sm font-semibold"
              >
                <ArrowLeft className="mr-1 inline size-4" />
                {t("extensions:host.returnToLive")}
              </Button>
            </div>

            {/* Questions navigation tabs */}
            <div className="mb-4 flex gap-2 overflow-x-auto border-b pb-2">
              {Array.from({ length: currentQuestionIdx }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    handleSelectHistoryIndex(idx)
                  }}
                  className={clsx(
                    "shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors",
                    selectedHistoryIndex === idx
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-accent/50 text-foreground hover:bg-accent",
                  )}
                >
                  {t("extensions:host.questionNum", { num: idx + 1 })}
                </button>
              ))}
            </div>

            {/* Question History Details */}
            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {historyItem ? (
                <div className="space-y-4">
                  <div className="bg-accent/30 flex items-center justify-between rounded-xl p-4">
                    <span className="text-foreground text-lg font-bold">
                      {historyItem.questionText ||
                        t("extensions:host.noHistoryAvailable")}
                    </span>
                    <span className="text-muted-foreground rounded bg-black/10 px-2 py-1 text-xs font-semibold uppercase">
                      {historyItem.questionType}
                    </span>
                  </div>

                  <div className="text-muted-foreground flex items-center gap-3 text-sm font-medium">
                    <span>
                      {t("extensions:host.answersCount", {
                        count: historyItem.playerAnswersCount,
                      })}
                    </span>
                    {historyItem.skipped && (
                      <span className="font-bold text-amber-500">
                        {t("extensions:host.skipped")}
                      </span>
                    )}
                  </div>

                  {/* Question Choices & Solution Badges if available */}
                  {historyItem.answers && historyItem.answers.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {historyItem.answers.map((ans, aIdx) => {
                        const isCorrect = historyItem.solutions?.includes(aIdx)

                        return (
                          <div
                            key={aIdx}
                            className={clsx(
                              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
                              isCorrect
                                ? "border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-400"
                                : "border-white/10 bg-black/20 text-white/80",
                            )}
                          >
                            <span>{ans}</span>
                            {isCorrect && (
                              <span className="text-xs font-bold text-emerald-400 uppercase">
                                {t("extensions:reveal.correct")}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-muted-foreground flex flex-col items-center justify-center p-8 text-center">
                  <p>{t("extensions:host.noHistoryAvailable")}</p>
                </div>
              )}
            </div>

            {/* Bottom Actions: Return to live and Replay from here */}
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <Button
                onClick={handleCloseHistory}
                className="bg-accent text-accent-foreground rounded-lg px-4 py-2 font-semibold"
              >
                {t("extensions:host.returnToLive")}
              </Button>

              {selectedHistoryIndex !== null && (
                <AlertDialog
                  trigger={
                    <Button className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 font-bold text-white shadow-md hover:bg-red-700">
                      <RotateCcw className="size-4" />
                      {t("extensions:host.replayFromHere")}
                    </Button>
                  }
                  title={t("extensions:host.replayConfirmTitle")}
                  description={t("extensions:host.replayConfirmDesc")}
                  confirmLabel={t("extensions:host.replayFromHere")}
                  onConfirm={() => {
                    handleReplayFromCheckpoint(selectedHistoryIndex)
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ManagerControlToolbar
