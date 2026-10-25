import type {
  RevealAudience,
  RevealEffect,
  RevealTrigger,
} from "@razzia/extensions/core"
import { clsx, type PerQuestionExtras } from "./utils"

interface Props {
  currentPerQuestion?: PerQuestionExtras
  updateCurrentQuestionItem: (
    _updater: (_item: PerQuestionExtras) => void,
  ) => void
  tr: (_key: string, _fallback: string) => string
}

export const RevealSection = ({
  currentPerQuestion,
  updateCurrentQuestionItem,
  tr,
}: Props) => {
  const reveal = currentPerQuestion?.reveal

  return (
    <div className="flex flex-col gap-6" data-testid="panel-reveal">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("visuals.revealTitle", "Question Image Reveal Effect")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "visuals.revealDesc",
            "Animate the presentation question image reveal during question display.",
          )}
        </p>
      </div>

      <div className="border-border bg-card/60 flex flex-col gap-4 rounded-xl border p-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-foreground text-xs font-semibold">
            {tr("editor.effect", "Effect")}
          </label>
          <select
            value={reveal?.effect ?? "none"}
            onChange={(e) => {
              const effect = e.target.value as RevealEffect
              updateCurrentQuestionItem((item) => {
                item.reveal = {
                  effect,
                  durationMs: item.reveal?.durationMs ?? 3000,
                  trigger: item.reveal?.trigger ?? "automatic",
                  audience: item.reveal?.audience ?? "manager",
                }
              })
            }}
            className="focus:ring-primary border-accent bg-background text-foreground rounded-lg border p-2 text-sm focus:ring-2 focus:outline-none"
            data-testid="reveal-effect-select"
          >
            <option value="none">
              {tr("visuals.effectNone", "None (Instant)")}
            </option>
            <option value="blur">
              {tr("visuals.effectBlur", "Blur to Clear")}
            </option>
            <option value="pixelate">
              {tr("visuals.effectPixelate", "Pixelate to Crisp")}
            </option>
            <option value="tiles">
              {tr("visuals.effectTiles", "Tiles Uncover")}
            </option>
            <option value="zoom">
              {tr("visuals.effectZoom", "Zoom to Fit")}
            </option>
          </select>
        </div>

        {reveal && reveal.effect !== "none" && (
          <>
            <div className="flex flex-col gap-1.5">
              <div className="text-foreground flex justify-between text-xs font-semibold">
                <span>{tr("visuals.durationMs", "Reveal Duration (ms)")}</span>
                <span className="text-primary font-mono font-bold">
                  {reveal.durationMs}ms
                </span>
              </div>
              <input
                type="range"
                min="250"
                max="15000"
                step="250"
                value={reveal.durationMs}
                onChange={(e) => {
                  const durationMs = Number(e.target.value)
                  updateCurrentQuestionItem((item) => {
                    if (item.reveal) {
                      item.reveal.durationMs = durationMs
                    }
                  })
                }}
                className="accent-primary w-full cursor-pointer"
                data-testid="reveal-duration-slider"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {tr("visuals.triggerMode", "Trigger")}
              </label>
              <div className="flex gap-2">
                {(["automatic", "manual"] as const).map(
                  (mode: RevealTrigger) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        updateCurrentQuestionItem((item) => {
                          if (item.reveal) {
                            item.reveal.trigger = mode
                          }
                        })
                      }}
                      className={clsx(
                        "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                        reveal.trigger === mode
                          ? "bg-primary text-white shadow-sm"
                          : "border-accent bg-accent/40 text-foreground hover:bg-accent border",
                      )}
                      data-testid={`reveal-trigger-${mode}`}
                    >
                      {mode === "automatic"
                        ? tr(
                            "visuals.triggerAuto",
                            "Automatic (on question start)",
                          )
                        : tr(
                            "visuals.triggerManual",
                            "Manual (manager button)",
                          )}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-foreground text-xs font-semibold">
                {tr("visuals.audience", "Audience")}
              </label>
              <div className="flex gap-2">
                {(["manager", "all"] as const).map((aud: RevealAudience) => (
                  <button
                    key={aud}
                    type="button"
                    onClick={() => {
                      updateCurrentQuestionItem((item) => {
                        if (item.reveal) {
                          item.reveal.audience = aud
                        }
                      })
                    }}
                    className={clsx(
                      "flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors",
                      reveal.audience === aud
                        ? "bg-primary text-white shadow-sm"
                        : "border-accent bg-accent/40 text-foreground hover:bg-accent border",
                    )}
                    data-testid={`reveal-audience-${aud}`}
                  >
                    {aud === "manager"
                      ? tr(
                          "visuals.audienceManager",
                          "Presenter / Manager Only",
                        )
                      : tr("visuals.audienceAll", "All Participants")}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
