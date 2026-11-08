// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import type { AnswerDisplay, AnswerVisual } from "@razzia/extensions/core"
import clsx from "clsx"
import { Image as ImageIcon, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

interface Props {
  i: number
  visual?: AnswerVisual
  handleDisplayModeChange: (index: number, mode: AnswerDisplay) => void
  setPickingAnswerIdx: (index: number) => void
  handleRemoveAnswerImage: (index: number) => void
  handleAltChange: (index: number, alt: string) => void
}

export function AnswerVisualControls({
  i,
  visual,
  handleDisplayModeChange,
  setPickingAnswerIdx,
  handleRemoveAnswerImage,
  handleAltChange,
}: Props) {
  const { t } = useTranslation()
  const displayMode: AnswerDisplay = visual?.display ?? "text"
  const hasImage = Boolean(visual?.url)

  return (
    <>
      {" "}
      {/* Inline Per-Answer Image & Display Mode Controls */}
      <div
        data-testid={`answer-visual-controls-${i}`}
        className="flex flex-wrap items-center justify-between gap-2 border-t border-white/15 pt-2 text-xs text-white"
      >
        <div
          data-testid={`answer-display-mode-${i}`}
          className="flex items-center gap-1 rounded-lg bg-black/20 p-0.5"
        >
          {(["text", "image", "both"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              data-testid={`answer-mode-${i}-${mode}`}
              onClick={() => handleDisplayModeChange(i, mode)}
              className={clsx(
                "rounded-md px-2 py-0.5 text-[11px] font-semibold transition",
                displayMode === mode
                  ? "bg-white text-black shadow-xs"
                  : "text-white/80 hover:text-white",
              )}
            >
              {mode === "text" && t("extensions:visuals.displayText", "Text")}
              {mode === "image" &&
                t("extensions:visuals.displayImage", "Image")}
              {mode === "both" && t("extensions:visuals.displayBoth", "Both")}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid={`answer-pick-image-${i}`}
            onClick={() => setPickingAnswerIdx(i)}
            className="flex items-center gap-1 rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-black/40"
          >
            <ImageIcon className="size-3.5" />
            <span>
              {hasImage
                ? t("extensions:editor.browse", "Change")
                : t("extensions:visuals.chooseMedia", "Image")}
            </span>
          </button>
          {hasImage && (
            <button
              type="button"
              data-testid={`answer-remove-image-${i}`}
              onClick={() => handleRemoveAnswerImage(i)}
              title={t("extensions:visuals.removeMedia", "Remove Image")}
              className="flex size-6 items-center justify-center rounded-lg bg-black/25 text-white transition hover:bg-red-500/80"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {hasImage && visual?.url && (
        <div className="flex items-center gap-2.5 rounded-xl bg-black/20 p-2">
          <img
            src={visual.url}
            alt={visual.alt || `Option ${i + 1}`}
            data-testid={`answer-image-preview-${i}`}
            className="size-12 shrink-0 rounded-lg bg-black/30 object-cover"
          />
          <input
            type="text"
            data-testid={`answer-alt-input-${i}`}
            value={visual.alt ?? ""}
            onChange={(e) => handleAltChange(i, e.target.value)}
            placeholder={t(
              "extensions:visuals.altPlaceholder",
              "Accessible alt text...",
            )}
            className="min-w-0 flex-1 rounded-md bg-black/20 px-2 py-1 text-xs font-medium text-white placeholder-white/60 outline-none"
          />
        </div>
      )}
    </>
  )
}
