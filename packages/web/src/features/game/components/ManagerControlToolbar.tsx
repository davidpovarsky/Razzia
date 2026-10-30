import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  EXTENSION_EVENTS,
  type ExtensionCommand,
  type ExtensionStateEnvelope,
} from "@razzia/extensions/core"
import { formatHistoryItem } from "@razzia/extensions/presentation"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import HistoryDialog from "@razzia/web/features/game/components/HistoryDialog"
import RoomLockButton from "@razzia/web/features/game/components/RoomLockButton"
import { useSocket } from "@razzia/web/features/game/contexts/socket-context"
import { useQuestionStore } from "@razzia/web/features/game/stores/question"
import clsx from "clsx"
import {
  Check,
  ChevronRight,
  Copy,
  History,
  LogOut,
  Monitor,
  Play,
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

  const storeGameId = useQuestionStore((s) => s.gameId)
  const gameId = extensionState?.gameId || storeGameId
  const [copiedDisplay, setCopiedDisplay] = useState(false)

  const handleOpenDisplay = useCallback(() => {
    if (!gameId || typeof window === "undefined") return
    window.open(`/display/${gameId}`, "_blank")
  }, [gameId])

  const handleCopyDisplayUrl = useCallback(async () => {
    if (!gameId || typeof window === "undefined") return
    const url = `${window.location.origin}/display/${gameId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedDisplay(true)
      setTimeout(() => setCopiedDisplay(false), 2000)
    } catch {
      // fallback
    }
  }, [gameId])

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

        {gameId && (
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/20 p-1 shadow-md backdrop-blur-md">
            <Button
              onClick={handleOpenDisplay}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/20"
              title={t("extensions:host.openDisplay")}
            >
              <Monitor className="size-4" />
              <span>{t("extensions:host.openDisplay")}</span>
            </Button>
            <Button
              onClick={handleCopyDisplayUrl}
              className="flex items-center rounded-md p-1.5 text-white hover:bg-white/20"
              title={t("extensions:host.copyDisplayUrl")}
            >
              {copiedDisplay ? (
                <Check className="size-4 text-emerald-400" />
              ) : (
                <Copy className="size-4" />
              )}
            </Button>
          </div>
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
              "bg-primary flex items-center gap-2 rounded-lg px-5 py-2.5 text-base font-bold text-white shadow-lg transition-transform hover:brightness-105 active:scale-95",
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
