import type { FormattedHistoryItem } from "@razzia/extensions/presentation"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import clsx from "clsx"
import { ArrowLeft, History, RotateCcw, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useTranslation } from "react-i18next"

interface Props {
  open: boolean
  onClose: () => void
  currentQuestionIdx: number
  selectedHistoryIndex: number | null
  onSelectHistoryIndex: (_idx: number) => void
  historyItem: FormattedHistoryItem | null
  onReplayFromCheckpoint: (_idx: number) => void
}

export const HistoryDialog = ({
  open,
  onClose,
  currentQuestionIdx,
  selectedHistoryIndex,
  onSelectHistoryIndex,
  historyItem,
  onReplayFromCheckpoint,
}: Props) => {
  const { t } = useTranslation()

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="bg-background border-border data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border p-6 shadow-2xl"
          data-testid="history-dialog-content"
        >
          <div className="mb-4 flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <History className="text-primary size-5" />
              <Dialog.Title className="text-foreground text-xl font-bold">
                {t("extensions:host.previous")}
              </Dialog.Title>
            </div>
            <Dialog.Close
              aria-label={t("common:close")}
              className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-1"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          {/* Question Index Tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto border-b pb-2">
            {Array.from({ length: currentQuestionIdx }).map((_, idx) => (
              <Button
                size="sm"
                classNameContent="contents"
                key={idx}
                type="button"
                onClick={() => onSelectHistoryIndex(idx)}
                className={clsx(
                  "focus:ring-primary shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold transition-colors focus:ring-2 focus:outline-none",
                  selectedHistoryIndex === idx
                    ? "bg-primary text-white shadow-sm"
                    : "bg-accent/50 text-foreground hover:bg-accent",
                )}
                data-testid={`history-tab-${idx}`}
              >
                {t("extensions:host.questionNum", { num: idx + 1 })}
              </Button>
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
                  <span className="text-muted-foreground rounded bg-black/10 px-2 py-1 text-xs font-semibold uppercase dark:bg-white/10">
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
                    <span className="text-primary font-bold">
                      {t("extensions:host.skipped")}
                    </span>
                  )}
                </div>

                {/* Choices & Solutions */}
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
                              ? "border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400"
                              : "border-neutral-200 bg-neutral-100 text-neutral-800 dark:border-white/10 dark:bg-black/20 dark:text-white/80",
                          )}
                        >
                          <span>{ans}</span>
                          {isCorrect && (
                            <span className="text-xs font-bold text-emerald-600 uppercase dark:text-emerald-400">
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

          {/* Bottom Actions */}
          <div className="mt-4 flex items-center justify-between border-t pt-4">
            <Button
              onClick={onClose}
              className="bg-accent text-accent-foreground hover:bg-accent/80 rounded-lg px-4 py-2 text-sm font-semibold"
            >
              <ArrowLeft className="mr-1.5 inline size-4" />
              {t("extensions:host.returnToLive")}
            </Button>

            {selectedHistoryIndex !== null && (
              <AlertDialog
                trigger={
                  <Button className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:bg-red-700">
                    <RotateCcw className="size-4" />
                    {t("extensions:host.replayFromHere")}
                  </Button>
                }
                title={t("extensions:host.replayConfirmTitle")}
                description={t("extensions:host.replayConfirmDesc")}
                confirmLabel={t("extensions:host.replayFromHere")}
                onConfirm={() => {
                  onReplayFromCheckpoint(selectedHistoryIndex)
                  onClose()
                }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default HistoryDialog
