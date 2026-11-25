import NativeButton from "@razzia/web/components/Button"
import type { UploadedMedia } from "@razzia/common/types/game"
import clsx from "clsx"
import { AlertTriangle, Music, Volume2 } from "lucide-react"
import { useTranslation } from "react-i18next"

export type MediaScopeTab = "all" | "show" | "builtin"

export function MediaLibraryScopeTabs({
  scopeTab,
  setScopeTab,
  showBuiltInTab,
}: {
  scopeTab: MediaScopeTab
  setScopeTab: (tab: MediaScopeTab) => void
  showBuiltInTab: boolean
}) {
  const { t } = useTranslation()

  return (
    <div
      data-testid="media-library-scope-tabs"
      className="flex flex-wrap items-center gap-1.5"
    >
      <NativeButton
        size="sm"
        type="button"
        data-testid="media-scope-all"
        onClick={() => setScopeTab("all")}
        className={clsx(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
          scopeTab === "all"
            ? "bg-primary text-white shadow-xs"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        {t("extensions:mediaLibrary.allUploaded", {
          defaultValue: "All Uploaded",
        })}
      </NativeButton>
      <NativeButton
        size="sm"
        type="button"
        data-testid="media-scope-show"
        data-tab="in-show"
        onClick={() => setScopeTab("show")}
        className={clsx(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
          scopeTab === "show"
            ? "bg-primary text-white shadow-xs"
            : "bg-muted text-muted-foreground hover:text-foreground",
        )}
      >
        {t("extensions:mediaLibrary.inThisShow", {
          defaultValue: "In This Show",
        })}
      </NativeButton>
      {showBuiltInTab && (
        <NativeButton
          size="sm"
          type="button"
          data-testid="media-scope-builtin"
          data-tab="builtin-sounds"
          onClick={() => setScopeTab("builtin")}
          className={clsx(
            "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
            scopeTab === "builtin"
              ? "bg-primary text-white shadow-xs"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {t("extensions:mediaLibrary.builtInSounds", {
            defaultValue: "Built-in Sounds",
          })}
        </NativeButton>
      )}
    </div>
  )
}

export function MediaDeleteBanner({
  pendingForceDeleteItem,
  onCancel,
  handleConfirmForceDelete,
}: {
  pendingForceDeleteItem: UploadedMedia | null
  onCancel: () => void
  handleConfirmForceDelete: () => void
}) {
  const { t } = useTranslation()

  if (!pendingForceDeleteItem) {
    return null
  }

  return (
    <div
      data-testid="media-delete-in-use-banner"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs"
    >
      <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <span className="font-medium">
          {t("extensions:mediaLibrary.inUseWarning", {
            name: pendingForceDeleteItem.name,
            defaultValue: `"${pendingForceDeleteItem.name}" is currently used by one or more cards or shows. Detach it from all cards and delete permanently?`,
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <NativeButton
          size="sm"
          type="button"
          onClick={() => onCancel()}
          className="bg-muted text-foreground hover:bg-muted/80 rounded-md px-2.5 py-1 font-semibold"
        >
          {t("common:cancel", { defaultValue: "Cancel" })}
        </NativeButton>
        <NativeButton
          size="sm"
          type="button"
          data-testid="media-confirm-force-delete"
          onClick={handleConfirmForceDelete}
          className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700"
        >
          {t("extensions:mediaLibrary.detachAndDelete", {
            defaultValue: "Detach & Delete",
          })}
        </NativeButton>
      </div>
    </div>
  )
}

export function BuiltinSoundList({
  visibleBuiltInSounds,
  playingBuiltinUrl,
  toggleBuiltinPreview,
  handleSelect,
}: {
  visibleBuiltInSounds: Array<UploadedMedia & { label: string }>
  playingBuiltinUrl: string | null
  toggleBuiltinPreview: (url: string) => void
  handleSelect: (item: UploadedMedia) => () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid h-full auto-rows-min grid-cols-1 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
      {visibleBuiltInSounds.map((sound) => (
        <div
          key={sound.url}
          data-testid={`builtin-sound-${sound.name}`}
          className="border-accent bg-muted/40 flex items-center justify-between gap-2 rounded-xl border p-3"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <NativeButton
              size="sm"
              type="button"
              data-testid={`builtin-sound-preview-${sound.name}`}
              onClick={() => toggleBuiltinPreview(sound.url)}
              aria-label={`Preview ${sound.label}`}
              className="bg-primary/15 text-primary hover:bg-primary/25 flex size-9 shrink-0 items-center justify-center rounded-lg transition"
            >
              {playingBuiltinUrl === sound.url ? (
                <Volume2 className="size-4 animate-pulse" />
              ) : (
                <Music className="size-4" />
              )}
            </NativeButton>
            <div className="min-w-0">
              <p className="text-foreground truncate text-sm font-semibold">
                {sound.label}
              </p>
              <p className="text-muted-foreground truncate text-xs">
                {sound.name}
              </p>
            </div>
          </div>
          <NativeButton
            size="sm"
            type="button"
            data-testid={`builtin-sound-select-${sound.name}`}
            onClick={handleSelect(sound)}
            className="bg-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105"
          >
            {t("quizz:media.use")}
          </NativeButton>
        </div>
      ))}
    </div>
  )
}
