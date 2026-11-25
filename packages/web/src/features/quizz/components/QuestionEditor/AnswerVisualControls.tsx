import type { AnswerDisplay, AnswerVisual } from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import { Image as ImageIcon, Trash2 } from "lucide-react"
import { useId } from "react"
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
  const altId = useId()
  const displayMode: AnswerDisplay = visual?.display ?? "text"
  const usesImage = displayMode !== "text"
  const hasImage = Boolean(visual?.url)

  return (
    <div
      data-testid={`answer-visual-controls-${i}`}
      className="flex min-w-0 flex-col gap-2 border-t border-white/15 pt-2 text-xs text-white"
    >
      <div data-testid={`answer-display-mode-${i}`}>
        <ToggleGroup
          aria-label={`${t("extensions:visuals.displayMode")}: ${t("extensions:visuals.optionLabel", { index: i + 1 })}`}
          value={displayMode}
          onChange={(mode) => handleDisplayModeChange(i, mode)}
          items={(
            [
              ["text", "displayText"],
              ["image", "displayImage"],
              ["both", "displayBoth"],
            ] as const
          ).map(([value, key]) => ({
            value,
            label: t(`extensions:visuals.${key}`),
          }))}
          itemMetadata={(mode) => ({
            "data-testid": `answer-mode-${i}-${mode}`,
          })}
          className="h-auto flex-wrap bg-black/20 [&>button]:min-h-8 [&>button]:min-w-0 [&>button]:flex-1 [&>button]:justify-center [&>button]:px-2 [&>button]:text-xs [&>button]:text-white/80 [&>button[data-state=on]]:bg-white [&>button[data-state=on]]:text-black"
        />
      </div>

      {usesImage && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              type="button"
              data-testid={`answer-pick-image-${i}`}
              onClick={() => setPickingAnswerIdx(i)}
              className="min-w-0 flex-1 bg-black/25 px-2.5 py-1.5 text-xs text-white hover:bg-black/40"
            >
              <ImageIcon className="size-4 shrink-0" aria-hidden="true" />
              {hasImage
                ? t("extensions:editor.browse")
                : t("extensions:visuals.chooseMedia")}
            </Button>
            {hasImage && (
              <Button
                size="sm"
                type="button"
                data-testid={`answer-remove-image-${i}`}
                onClick={() => handleRemoveAnswerImage(i)}
                aria-label={t("extensions:visuals.removeMedia")}
                title={t("extensions:visuals.removeMedia")}
                className="flex size-8 shrink-0 items-center justify-center bg-black/25 p-1.5 text-white hover:bg-red-500/80"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
          {hasImage && visual?.url && (
            <div className="flex min-w-0 items-start gap-2.5 rounded-lg bg-black/20 p-2">
              <img
                src={visual.url}
                alt={
                  visual.alt ||
                  t("extensions:visuals.optionLabel", { index: i + 1 })
                }
                data-testid={`answer-image-preview-${i}`}
                className="size-14 shrink-0 rounded-lg bg-black/30 object-contain"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <label htmlFor={altId} className="font-semibold">
                  {t("extensions:visuals.altText")}
                </label>
                <input
                  id={altId}
                  type="text"
                  dir="auto"
                  data-testid={`answer-alt-input-${i}`}
                  value={visual.alt}
                  onChange={(event) => handleAltChange(i, event.target.value)}
                  placeholder={t("extensions:visuals.altPlaceholder")}
                  className="w-full min-w-0 rounded-md bg-black/20 px-2 py-1 text-xs font-medium text-white outline-none placeholder:text-white/60 focus-visible:ring-2 focus-visible:ring-white/70"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
