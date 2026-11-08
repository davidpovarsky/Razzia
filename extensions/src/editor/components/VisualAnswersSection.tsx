import {PlatformButton} from "../../presentation/platform-controls"
import type { AnswerDisplay } from "@razzia/extensions/core"
import { Image as ImageIcon, Trash2 } from "lucide-react"
import {
  CANONICAL_ANSWER_COLORS,
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
  onOpenMediaPicker?: (_options?: MediaPickerRequestOptions) => void
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
              className="border-border bg-card/60 flex flex-col gap-3 rounded-xl border p-4"
              data-testid={`answer-visual-card-${answerIndex}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-foreground flex items-center gap-2 text-sm font-bold">
                  <span
                    className={clsx(
                      "flex size-6 items-center justify-center rounded-md text-xs font-black shadow-xs",
                      CANONICAL_ANSWER_COLORS[answerIndex] ??
                        CANONICAL_ANSWER_COLORS[
                          answerIndex % CANONICAL_ANSWER_COLORS.length
                        ],
                    )}
                  >
                    {String.fromCharCode(65 + answerIndex)}
                  </span>
                  {answerText ||
                    tr("editor.choiceNum", `Choice ${answerIndex + 1}`).replace(
                      "{{num}}",
                      String(answerIndex + 1),
                    )}
                </span>

                {visual && (
                  <PlatformButton size="sm"
                    type="button"
                    onClick={() => handleRemoveVisual(answerIndex)}
                    className="hover:bg-accent flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                    title={tr("visuals.removeMedia", "Remove Image")}
                    aria-label={tr("visuals.removeMedia", "Remove Image")}
                  >
                    <Trash2 className="size-3.5" />
                    <span>{tr("common:delete", "Remove")}</span>
                  </PlatformButton>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-muted-foreground text-xs font-semibold">
                  {tr("visuals.displayMode", "Display Mode")}:
                </label>
                <select
                  data-testid={`display-select-${answerIndex}`}
                  value={displayMode}
                  onChange={(e) =>
                    handleModeSelect(
                      answerIndex,
                      e.target.value as AnswerDisplay,
                      answerText,
                    )
                  }
                  className="border-accent bg-background text-foreground focus:ring-primary rounded-lg border p-1.5 text-xs font-medium focus:ring-2 focus:outline-none"
                >
                  <option value="text">
                    {tr("visuals.displayText", "Text Only")}
                  </option>
                  <option value="image">
                    {tr("visuals.displayImage", "Image Only")}
                  </option>
                  <option value="both">
                    {tr("visuals.displayBoth", "Text & Image")}
                  </option>
                </select>
                <div className="hidden">
                  {(["text", "image", "both"] as const).map((mode) => (
                    <PlatformButton size="sm"
                      key={mode}
                      type="button"
                      onClick={() =>
                        handleModeSelect(answerIndex, mode, answerText)
                      }
                      data-testid={`mode-toggle-${answerIndex}-${mode}`}
                    />
                  ))}
                </div>
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
                      className="focus:ring-primary border-accent bg-background text-foreground flex-1 rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none"
                      data-testid={`media-url-input-${answerIndex}`}
                    />

                    {onOpenMediaPicker && (
                      <PlatformButton size="sm"
                        type="button"
                        onClick={() => {
                          onOpenMediaPicker({
                            target: {
                              questionId: activeQuestionId ?? "",
                              kind: "answer",
                              answerIndex,
                            },
                            expectedType: "image",
                          })
                        }}
                        className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition-all"
                      >
                        <ImageIcon className="size-3.5" />
                        {tr("editor.browse", "Browse")}
                      </PlatformButton>
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
                        "focus:ring-primary w-full rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none",
                        visual && !visual.alt.trim()
                          ? "border-red-400 bg-red-50/50 dark:border-red-600 dark:bg-red-950/20"
                          : "border-accent bg-background text-foreground",
                      )}
                      data-testid={`alt-input-${answerIndex}`}
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
