import type { CueId } from "@razzia/extensions/core"
import { Video, Image as ImageIcon } from "lucide-react"
import {
  clsx,
  type MediaPickerRequestOptions,
  type PerQuestionExtras,
} from "./utils"

interface Props {
  activeQuestionId?: string
  currentPerQuestion?: PerQuestionExtras
  updateCurrentQuestionItem: (
    _updater: (_item: PerQuestionExtras) => void,
  ) => void
  onOpenMediaPicker?: (
    _onSelect: (_url: string) => void,
    _options?: MediaPickerRequestOptions,
  ) => void
  tr: (_key: string, _fallback: string) => string
}

export const InterludeSection = ({
  activeQuestionId,
  currentPerQuestion,
  updateCurrentQuestionItem,
  onOpenMediaPicker,
  tr,
}: Props) => {
  const interlude = currentPerQuestion?.interlude

  return (
    <div className="flex flex-col gap-6" data-testid="panel-interlude">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("interludes.interludeTitle", "Interlude Slide")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "interludes.interludeDesc",
            "Present a dramatic title, media slide, or countdown before transitioning to the next question.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={Boolean(interlude)}
            onChange={(e) => {
              const enabled = e.target.checked
              updateCurrentQuestionItem((item) => {
                if (enabled) {
                  item.interlude = {
                    kind: item.interlude?.kind ?? "title",
                    title: item.interlude?.title ?? "",
                    durationMs: item.interlude?.durationMs ?? 5000,
                    advance: item.interlude?.advance ?? "auto",
                    url: item.interlude?.url,
                    audioCue: item.interlude?.audioCue,
                  }
                } else {
                  delete item.interlude
                }
              })
            }}
            className="accent-primary size-4 rounded"
            data-testid="interlude-enabled-checkbox"
          />
          <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
            {tr(
              "interludes.enableInterlude",
              "Show Interlude After Question Results",
            )}
          </span>
        </label>

        {interlude && (
          <div className="flex flex-col gap-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {tr("editor.effect", "Slide Kind")}
              </label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    {
                      kind: "title",
                      label: tr("interludes.kindTitle", "Title Card"),
                    },
                    {
                      kind: "image",
                      label: tr("interludes.kindImage", "Image Slide"),
                    },
                    {
                      kind: "video",
                      label: tr("interludes.kindVideo", "Video Clip"),
                    },
                    {
                      kind: "countdown",
                      label: tr("interludes.kindCountdown", "Countdown Screen"),
                    },
                  ] as const
                ).map(({ kind, label }) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.kind = kind
                        }
                      })
                    }}
                    className={clsx(
                      "rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                      interlude.kind === kind
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300",
                    )}
                    data-testid={`interlude-kind-${kind}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {tr("interludes.slideHeading", "Slide Heading / Title")}
              </label>
              <input
                type="text"
                value={interlude.title ?? ""}
                onChange={(e) => {
                  const title = e.target.value
                  updateCurrentQuestionItem((item) => {
                    if (item.interlude) {
                      item.interlude.title = title
                    }
                  })
                }}
                placeholder={tr("interludes.slideHeading", "Slide Heading")}
                className="focus:ring-primary rounded-lg border border-neutral-300 bg-white p-2 text-sm focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                data-testid="interlude-title-input"
              />
            </div>

            {(interlude.kind === "image" || interlude.kind === "video") && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  {tr("interludes.mediaUrl", "Slide Media URL")}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={interlude.url ?? ""}
                    onChange={(e) => {
                      const url = e.target.value
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.url = url
                        }
                      })
                    }}
                    placeholder={
                      interlude.kind === "video"
                        ? "/media/video.mp4"
                        : "/media/slide.jpg"
                    }
                    className="focus:ring-primary flex-1 rounded-lg border border-neutral-300 bg-white p-2 text-xs focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                    data-testid="interlude-media-url-input"
                  />
                  {onOpenMediaPicker && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenMediaPicker(
                          (selectedUrl) => {
                            updateCurrentQuestionItem((item) => {
                              if (item.interlude) {
                                item.interlude.url = selectedUrl
                              }
                            })
                          },
                          {
                            target: {
                              questionId: activeQuestionId ?? "",
                              kind: "interlude",
                            },
                            expectedType:
                              interlude.kind === "video" ? "video" : "image",
                          },
                        )
                      }}
                      className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition-all"
                    >
                      {interlude.kind === "video" ? (
                        <Video className="size-3.5" />
                      ) : (
                        <ImageIcon className="size-3.5" />
                      )}
                      {tr("editor.select", "Select")}
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                <span>{tr("interludes.durationMs", "Duration")}</span>
                <span className="text-primary font-mono font-bold">
                  {Math.round(interlude.durationMs / 1000)}s
                </span>
              </div>
              <input
                type="range"
                min="1000"
                max="30000"
                step="1000"
                value={interlude.durationMs}
                onChange={(e) => {
                  const durationMs = Number(e.target.value)
                  updateCurrentQuestionItem((item) => {
                    if (item.interlude) {
                      item.interlude.durationMs = durationMs
                    }
                  })
                }}
                className="accent-primary w-full cursor-pointer"
                data-testid="interlude-duration-slider"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {tr("interludes.advanceMode", "Advance Behavior")}
              </label>
              <div className="flex gap-2">
                {(["auto", "manual"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.advance = mode
                        }
                      })
                    }}
                    className={clsx(
                      "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                      interlude.advance === mode
                        ? "bg-primary text-white shadow-sm"
                        : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-300",
                    )}
                    data-testid={`interlude-advance-${mode}`}
                  >
                    {mode === "auto"
                      ? tr("interludes.advanceAuto", "Automatic Advance")
                      : tr(
                          "interludes.advanceManual",
                          "Manual Manager Advance",
                        )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                {tr("interludes.audioCue", "Accompanying Audio Cue")}
              </label>
              <select
                value={interlude.audioCue ?? ""}
                onChange={(e) => {
                  const val = e.target.value as CueId | ""

                  updateCurrentQuestionItem((item) => {
                    if (item.interlude) {
                      item.interlude.audioCue = val || undefined
                    }
                  })
                }}
                className="focus:ring-primary rounded-lg border border-neutral-300 bg-white p-2 text-sm focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                data-testid="interlude-audiocue-select"
              >
                <option value="">{tr("common:none", "None (Silent)")}</option>
                <option value="start">
                  {tr("audio.cueStart", "Game Start")}
                </option>
                <option value="showQuestion">
                  {tr("audio.cueShowQuestion", "Show Question")}
                </option>
                <option value="answersMusic">
                  {tr("audio.cueAnswersMusic", "Answering Music")}
                </option>
                <option value="leaderboard">
                  {tr("audio.cueLeaderboard", "Leaderboard Display")}
                </option>
                <option value="revealResults">
                  {tr("audio.cueRevealResults", "Reveal Results")}
                </option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
