import {PlatformButton} from "../../presentation/platform-controls"
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
  onOpenMediaPicker?: (_options?: MediaPickerRequestOptions) => void
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

      <div className="border-border bg-card/60 flex flex-col gap-4 rounded-xl border p-4">
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
            data-testid="toggle-interlude"
          />
          <span className="text-foreground text-sm font-bold">
            {tr(
              "interludes.enableInterlude",
              "Show Interlude After Question Results",
            )}
          </span>
        </label>

        {interlude && (
          <div className="border-border flex flex-col gap-4 border-t pt-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
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
                  <PlatformButton size="sm"
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
                        ? "bg-primary ring-primary text-white shadow-sm ring-1"
                        : "border-accent bg-accent/40 text-foreground hover:bg-accent border",
                    )}
                    data-testid={`interlude-kind-${kind}`}
                  >
                    {label}
                  </PlatformButton>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
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
                className="focus:ring-primary border-accent bg-background text-foreground rounded-lg border p-2 text-sm focus:ring-2 focus:outline-none"
                data-testid="interlude-title-input"
              />
            </div>

            {(interlude.kind === "image" || interlude.kind === "video") && (
              <div className="flex flex-col gap-1.5">
                <label className="text-foreground text-xs font-semibold">
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
                    className="focus:ring-primary border-accent bg-background text-foreground flex-1 rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none"
                    data-testid="interlude-media-url-input"
                  />
                  {onOpenMediaPicker && (
                    <PlatformButton size="sm"
                      type="button"
                      onClick={() => {
                        onOpenMediaPicker({
                          target: {
                            questionId: activeQuestionId ?? "",
                            kind: "interlude",
                          },
                          expectedType:
                            interlude.kind === "video" ? "video" : "image",
                        })
                      }}
                      className="hover:bg-accent border-primary/30 bg-primary/10 text-primary flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold shadow-sm transition-all"
                    >
                      {interlude.kind === "video" ? (
                        <Video className="size-3.5" />
                      ) : (
                        <ImageIcon className="size-3.5" />
                      )}
                      {tr("editor.select", "Select")}
                    </PlatformButton>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <div className="text-foreground flex justify-between text-xs font-semibold">
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
              <label className="text-foreground text-xs font-semibold">
                {tr("interludes.advanceMode", "Advance Behavior")}
              </label>
              <div className="flex gap-2">
                {(["auto", "manual"] as const).map((mode) => (
                  <PlatformButton size="sm"
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
                        ? "bg-primary ring-primary text-white shadow-sm ring-1"
                        : "border-accent bg-accent/40 text-foreground hover:bg-accent border",
                    )}
                    data-testid={`interlude-advance-${mode}`}
                  >
                    {mode === "auto"
                      ? tr("interludes.advanceAuto", "Automatic Advance")
                      : tr(
                          "interludes.advanceManual",
                          "Manual Manager Advance",
                        )}
                  </PlatformButton>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
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
                className="focus:ring-primary border-accent bg-background text-foreground rounded-lg border p-2 text-sm focus:ring-2 focus:outline-none"
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
