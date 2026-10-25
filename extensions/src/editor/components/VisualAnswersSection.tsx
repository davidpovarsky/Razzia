import type { AnswerDisplay } from "@razzia/extensions/core"
import { Image as ImageIcon, Trash2 } from "lucide-react"
import {
  clsx,
  type MediaPickerRequestOptions,
  type PerQuestionExtras,
} from "./utils"

interface Props {
  activeQuestionId?: string
  currentPerQuestion?: PerQuestionExtras
  currentQuestionAnswers: string[]
  updateCurrentQuestionItem: (
    _updater: (_item: PerQuestionExtras) => void,
  ) => void
  onOpenMediaPicker?: (
    _onSelect: (_url: string) => void,
    _options?: MediaPickerRequestOptions,
  ) => void
  tr: (_key: string, _fallback: string) => string
}

export const VisualAnswersSection = ({
  activeQuestionId,
  currentPerQuestion,
  currentQuestionAnswers,
  updateCurrentQuestionItem,
  onOpenMediaPicker,
  tr,
}: Props) => {
  const handleRemoveVisual = (answerIndex: number) => {
    updateCurrentQuestionItem((item) => {
      item.answerVisuals = (item.answerVisuals ?? []).filter(
        (v) => v.answerIndex !== answerIndex,
      )
    })
  }

  const handleModeSelect = (
    answerIndex: number,
    mode: AnswerDisplay,
    answerText: string,
  ) => {
    updateCurrentQuestionItem((item) => {
      const list = [...(item.answerVisuals ?? [])]
      const existing = list.find((v) => v.answerIndex === answerIndex)

      if (existing) {
        existing.display = mode
      } else {
        list.push({
          answerIndex,
          display: mode,
          url: "",
          alt: answerText || `Answer ${answerIndex + 1}`,
        })
      }

      item.answerVisuals = list
    })
  }

  const handleUrlChange = (answerIndex: number, url: string) => {
    updateCurrentQuestionItem((item) => {
      const target = item.answerVisuals?.find(
        (v) => v.answerIndex === answerIndex,
      )

      if (target) {
        target.url = url
      }
    })
  }

  const handleAltChange = (answerIndex: number, alt: string) => {
    updateCurrentQuestionItem((item) => {
      const target = item.answerVisuals?.find(
        (v) => v.answerIndex === answerIndex,
      )

      if (target) {
        target.alt = alt
      }
    })
  }

  return (
    <div className="flex flex-col gap-6" data-testid="panel-visuals">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("visuals.answerVisualTitle", "Answer Choice Visuals")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "visuals.answerVisualDesc",
            "Configure images and accessibility labels for individual answer choices.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {currentQuestionAnswers.map((answerText, answerIndex) => {
          const visual = currentPerQuestion?.answerVisuals?.find(
            (v) => v.answerIndex === answerIndex,
          )
          const displayMode: AnswerDisplay = visual?.display ?? "text"

          return (
            <div
              key={answerIndex}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40"
              data-testid={`answer-visual-card-${answerIndex}`}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  <span className="flex size-6 items-center justify-center rounded-md bg-neutral-200 text-xs font-black text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                    {String.fromCharCode(65 + answerIndex)}
                  </span>
                  {answerText ||
                    tr("editor.choiceNum", `Choice ${answerIndex + 1}`).replace(
                      "{{num}}",
                      String(answerIndex + 1),
                    )}
                </span>

                {visual && (
                  <button
                    type="button"
                    onClick={() => handleRemoveVisual(answerIndex)}
                    className="hover:bg-accent flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    title={tr("visuals.removeMedia", "Remove Image")}
                    aria-label={tr("visuals.removeMedia", "Remove Image")}
                  >
                    <Trash2 className="size-3.5" />
                    <span>{tr("common:delete", "Remove")}</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                  {tr("visuals.displayMode", "Display Mode")}:
                </label>
                {(["text", "image", "both"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      handleModeSelect(answerIndex, mode, answerText)
                    }
                    className={clsx(
                      "rounded-lg px-3 py-1 text-xs font-bold transition-colors",
                      displayMode === mode
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300",
                    )}
                    data-testid={`mode-toggle-${answerIndex}-${mode}`}
                  >
                    {mode === "text" && tr("visuals.displayText", "Text Only")}
                    {mode === "image" &&
                      tr("visuals.displayImage", "Image Only")}
                    {mode === "both" &&
                      tr("visuals.displayBoth", "Text & Image")}
                  </button>
                ))}
              </div>

              {(displayMode === "image" || displayMode === "both") && (
                <div className="flex flex-col gap-2 pt-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={visual?.url ?? ""}
                      placeholder={tr("audio.url", "Media URL (/media/...)")}
                      onChange={(e) =>
                        handleUrlChange(answerIndex, e.target.value)
                      }
                      className="focus:ring-primary flex-1 rounded-lg border border-neutral-300 bg-white p-2 text-xs focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                      data-testid={`media-url-input-${answerIndex}`}
                    />

                    {onOpenMediaPicker && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenMediaPicker(
                            (selectedUrl) => {
                              updateCurrentQuestionItem((item) => {
                                const list = item.answerVisuals ?? []

                                for (const target of list) {
                                  if (target.answerIndex === answerIndex) {
                                    target.url = selectedUrl

                                    break
                                  }
                                }
                              })
                            },
                            {
                              target: {
                                questionId: activeQuestionId ?? "",
                                kind: "answer",
                                answerIndex,
                              },
                              expectedType: "image",
                            },
                          )
                        }}
                        className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition-all"
                      >
                        <ImageIcon className="size-3.5" />
                        {tr("editor.browse", "Browse")}
                      </button>
                    )}
                  </div>

                  <div>
                    <input
                      type="text"
                      value={visual?.alt ?? ""}
                      placeholder={tr(
                        "visuals.altPlaceholder",
                        "Accessible Alt Text (Required)",
                      )}
                      onChange={(e) =>
                        handleAltChange(answerIndex, e.target.value)
                      }
                      className={clsx(
                        "focus:ring-primary w-full rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none dark:bg-neutral-800",
                        visual && !visual.alt.trim()
                          ? "border-red-400 bg-red-50/50 dark:border-red-600 dark:bg-red-950/20"
                          : "border-neutral-300 bg-white dark:border-neutral-700",
                      )}
                      data-testid={`alt-text-input-${answerIndex}`}
                    />
                    {visual && !visual.alt.trim() && (
                      <span className="text-[10px] font-semibold text-red-500">
                        {tr(
                          "errors.altRequiredForImage",
                          "Accessible alt text is required for image answer options",
                        )}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
