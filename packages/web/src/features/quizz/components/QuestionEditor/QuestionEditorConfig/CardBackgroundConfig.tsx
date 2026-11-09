// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import {
  isLegacyShowRollback,
  type BackgroundFit,
  type CardBackgroundOverride,
} from "@razzia/extensions/core"
import { useStudioEditor } from "@razzia/web/features/quizz/components/studio/studio-editor-context"
import { ThemeScopeControls } from "@razzia/web/features/quizz/components/studio/theme-scope-controls"
import type { UploadedMedia } from "@razzia/common/types/game"
import Button from "@razzia/web/components/Button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Image as ImageIcon, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

interface CardBackgroundConfigProps {
  backgroundOverride?: CardBackgroundOverride
  onBackgroundChange?: (next: CardBackgroundOverride | undefined) => void
}

const LegacyCardBackgroundConfig = ({
  backgroundOverride,
  onBackgroundChange,
}: CardBackgroundConfigProps = {}) => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()
  const [libraryOpen, setLibraryOpen] = useState(false)

  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const activeBackground =
    onBackgroundChange !== undefined
      ? backgroundOverride
      : currentPerQ?.background

  const updateBackground = (next: CardBackgroundOverride | undefined) => {
    if (onBackgroundChange) {
      onBackgroundChange(next)

      return
    }

    if (!currentQuestionId) {
      return
    }

    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = { ...(existingPerQ[currentQuestionId] ?? {}) }

      if (next) {
        existingItem.background = next
      } else {
        delete existingItem.background
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: existingItem,
        },
      }
    })
  }

  const handleSelectImage = (item: UploadedMedia) => {
    updateBackground({
      url: item.url,
      fit: activeBackground?.fit ?? "cover",
      position: activeBackground?.position ?? "center",
      overlayOpacity: activeBackground?.overlayOpacity ?? 0.35,
    })
    setLibraryOpen(false)
  }

  const handleFitChange = (fit: BackgroundFit) => {
    if (!activeBackground) {
      return
    }

    updateBackground({
      ...activeBackground,
      fit,
    })
  }

  const handleOverlayChange = (raw: string) => {
    if (!activeBackground) {
      return
    }

    const num = Math.max(0, Math.min(0.85, Number(raw) || 0))
    updateBackground({
      ...activeBackground,
      overlayOpacity: num,
    })
  }

  const hasCustom = Boolean(activeBackground?.url)

  return (
    <ConfigSection
      title={t("extensions:cardBackground.title", "Card Background")}
    >
      <div
        data-testid="card-background-section"
        className="flex flex-col gap-3"
      >
        <div className="bg-muted flex items-center gap-1.5 rounded-lg p-1">
          <Button
            size="sm"
            type="button"
            data-testid="card-bg-mode-default"
            onClick={() => updateBackground(undefined)}
            className={clsx(
              "flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
              !hasCustom
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("extensions:cardBackground.useGameDefault", "Game Default")}
          </Button>
          <Button
            size="sm"
            type="button"
            data-testid="card-bg-mode-custom"
            onClick={() => {
              if (!hasCustom) {
                setLibraryOpen(true)
              }
            }}
            className={clsx(
              "flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
              hasCustom
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t("extensions:cardBackground.useCustom", "Custom Image")}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            data-testid="card-bg-choose-btn"
            onClick={() => setLibraryOpen(true)}
            className="bg-accent text-accent-foreground flex flex-1 items-center justify-center gap-1.5 text-xs font-semibold"
          >
            <ImageIcon className="size-3.5" />
            <span>
              {t("extensions:cardBackground.chooseImage", "Choose Background")}
            </span>
          </Button>
          {hasCustom && (
            <Button
              size="sm"
              type="button"
              data-testid="card-bg-remove-btn"
              onClick={() => updateBackground(undefined)}
              title={t(
                "extensions:cardBackground.removeFromCard",
                "Remove from Card",
              )}
              className="bg-accent text-muted-foreground flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
              <span>
                {t(
                  "extensions:cardBackground.removeFromCard",
                  "Remove from Card",
                )}
              </span>
            </Button>
          )}
        </div>

        {hasCustom && activeBackground?.url && (
          <>
            <div className="border-accent relative aspect-video w-full overflow-hidden rounded-xl border bg-black/40">
              <img
                src={activeBackground.url}
                alt="Card Background Preview"
                data-testid="card-bg-preview"
                className={clsx(
                  "h-full w-full",
                  activeBackground.fit === "contain"
                    ? "object-contain"
                    : "object-cover",
                )}
              />
              <div
                className="pointer-events-none absolute inset-0 bg-black"
                style={{ opacity: activeBackground.overlayOpacity ?? 0.35 }}
              />
            </div>

            <ConfigField>
              <ConfigField.Label
                label={t("extensions:cardBackground.fitLabel", "Image Fit")}
              />
              <Select
                value={activeBackground.fit ?? "cover"}
                onValueChange={(val) => handleFitChange(val as BackgroundFit)}
              >
                <SelectTrigger
                  data-testid="card-bg-fit-select"
                  aria-label={t(
                    "extensions:cardBackground.fitLabel",
                    "Image Fit",
                  )}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cover">
                    {t("extensions:cardBackground.fitCover", "Cover")}
                  </SelectItem>
                  <SelectItem value="contain">
                    {t("extensions:cardBackground.fitContain", "Contain")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </ConfigField>

            <ConfigField>
              <ConfigField.Label
                label={t(
                  "extensions:cardBackground.overlayLabel",
                  "Contrast Overlay",
                )}
                unit={`${Math.round((activeBackground.overlayOpacity ?? 0.35) * 100)}%`}
              />
              <input
                type="range"
                min={0}
                max={0.85}
                step={0.05}
                data-testid="card-bg-overlay-input"
                value={activeBackground.overlayOpacity ?? 0.35}
                onChange={(e) => handleOverlayChange(e.target.value)}
                className="accent-primary w-full cursor-pointer"
              />
            </ConfigField>
          </>
        )}
      </div>

      <MediaLibrary
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        onSelect={handleSelectImage}
        acceptType="image"
      />
    </ConfigSection>
  )
}

const CardBackgroundConfig = (props: CardBackgroundConfigProps = {}) => {
  const { defaults } = useStudioEditor()

  return isLegacyShowRollback(defaults) ? (
    <LegacyCardBackgroundConfig {...props} />
  ) : (
    <ThemeScopeControls
      section="background"
      kind={props.onBackgroundChange ? "scene" : "question"}
    />
  )
}

export default CardBackgroundConfig
