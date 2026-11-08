import NativeButton from "@razzia/web/components/Button"
import type { TimelineItemKind } from "@razzia/extensions/core"
import { getTimelineKindOptions } from "@razzia/extensions/editor"
import { useStudioEditor } from "./studio-editor-context"
import ToggleGroup from "./GroupedToggleGroup"
import AlertDialog from "@razzia/web/components/AlertDialog"
import clsx from "clsx"
import { Rocket, Settings, Users } from "lucide-react"
import { useTranslation } from "react-i18next"

export function StudioHeaderNavigation() {
  const { activeTab, setActiveTab } = useStudioEditor()
  const { t } = useTranslation()

  return (
    <div className="bg-accent/80 flex h-8 max-w-full shrink-0 scrollbar-none items-center overflow-x-auto rounded-lg p-0.5">
      <NativeButton size="sm"
        type="button"
        data-testid="studio-tab-questions"
        onClick={() => setActiveTab("questions")}
        className={clsx(
          "bg-transparent flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
          activeTab === "questions"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {t("extensions:studio.tabs.questions", "Questions")}
      </NativeButton>
      <NativeButton size="sm"
        type="button"
        data-testid="studio-tab-participants"
        onClick={() => setActiveTab("participants")}
        className={clsx(
          "bg-transparent flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
          activeTab === "participants"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Users className="size-3.5" />
        {t("extensions:studio.tabs.participants", "Participants")}
      </NativeButton>
      <NativeButton size="sm"
        type="button"
        data-testid="studio-tab-settings"
        onClick={() => setActiveTab("settings")}
        className={clsx(
          "bg-transparent flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
          activeTab === "settings"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Settings className="size-3.5" />
        {t("extensions:studio.tabs.settings", "Settings")}
      </NativeButton>
      <NativeButton size="sm"
        type="button"
        data-testid="studio-tab-launch"
        onClick={() => setActiveTab("launch")}
        className={clsx(
          "bg-transparent flex h-full shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-3",
          activeTab === "launch"
            ? "bg-primary text-white shadow-xs"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Rocket className="size-3.5" />
        {t("extensions:studio.tabs.launch", "Launch")}
      </NativeButton>
    </div>
  )
}

export function StudioCardKindBar() {
  const { activeTab, selectedKind, changeSelectedCardKind } = useStudioEditor()
  const { t } = useTranslation()
  const timelineKinds = getTimelineKindOptions(t)

  return (
    <>
      {" "}
      {activeTab === "questions" && (
        <div
          data-testid="studio-card-type-bar"
          className="bg-muted/30 border-border/40 flex h-11 w-full items-center justify-between border-t px-4"
        >
          <div className="min-w-0 flex-1 scrollbar-none overflow-x-auto py-1">
            <ToggleGroup
              value={selectedKind}
              onChange={(next) =>
                changeSelectedCardKind(next as TimelineItemKind)
              }
              items={timelineKinds}
            />
          </div>

          <div className="text-muted-foreground hidden shrink-0 items-center gap-1.5 pl-3 text-xs sm:flex">
            <span className="font-medium">
              {t("extensions:studio.cardKindLabel", "Card Type")}:
            </span>
            <span className="text-foreground font-semibold capitalize">
              {selectedKind}
            </span>
          </div>
        </div>
      )}
    </>
  )
}

export function StudioConversionDialog() {
  const {
    pendingConversion,
    confirmPendingConversion,
    cancelPendingConversion,
  } = useStudioEditor()
  const { t } = useTranslation()

  return (
    <AlertDialog
      open={Boolean(pendingConversion)}
      onOpenChange={(open: boolean) => {
        if (!open) {
          cancelPendingConversion()
        }
      }}
      title={t(
        "extensions:timeline.deleteConfirmTitle",
        "Convert Question to Scene?",
      )}
      description={t(
        "extensions:timeline.deleteConfirmDesc",
        "Converting this question will replace its question content with the selected scene. This cannot be undone automatically.",
      )}
      confirmLabel={t("extensions:studio.convert.confirm", "Convert to Scene")}
      onConfirm={confirmPendingConversion}
    />
  )
}
