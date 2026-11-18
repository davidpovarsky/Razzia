import { PlatformButton } from "../../presentation/platform-controls"
import type { ComponentType, ReactNode } from "react"
import {
  BarChart2,
  Copy,
  DoorOpen,
  Flag,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react"

interface TimelineSceneCardProps {
  kind: string
  title?: string
  durationText: string
  isActive: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate: () => void
  t: (key: string, fallback?: string) => string
  DeleteConfirmation: ComponentType<{
    trigger?: ReactNode
    title: string
    description: string
    confirmLabel?: string
    onConfirm: () => void
  }>
}

const getSceneIcon = (kind: string) => {
  switch (kind) {
    case "transition":
      return <Layers className="text-primary size-5" />

    case "animation":
      return <Sparkles className="text-primary size-5" />

    case "media":
      return <ImageIcon className="text-primary size-5" />

    case "leaderboard":
      return <Trophy className="text-primary size-5" />

    case "interimResults":
      return <BarChart2 className="text-primary size-5" />

    case "answerRecap":
      return <ListChecks className="text-primary size-5" />

    case "countdown":
      return <Timer className="text-primary size-5" />

    case "opening":
      return <DoorOpen className="text-primary size-5" />

    case "closing":
      return <Flag className="text-primary size-5" />

    default:
      return <Layers className="text-primary size-5" />
  }
}

export const TimelineSceneCard = ({
  kind,
  title,
  durationText,
  isActive,
  onClick,
  onDelete,
  onDuplicate,
  DeleteConfirmation,
  t,
}: TimelineSceneCardProps) => {
  const kindLabel = t(`extensions:timeline.${kind}`, kind)
  const cardTitle = title?.trim() || kindLabel
  const duplicateLabel = t(
    "extensions:timeline.duplicateCard",
    "Duplicate card",
  )
  const deleteLabel = t("extensions:timeline.deleteCard", "Delete scene card")

  return (
    <div
      data-testid="editor-scene-card"
      data-scene-kind={kind}
      className={[
        "group border-accent bg-background relative flex h-36 cursor-pointer flex-col justify-between gap-1 rounded-lg border-2 px-6 py-2 transition-all",
        isActive ? "border-primary shadow-sm" : "",
      ].join(" ")}
    >
      <PlatformButton
        type="button"
        size="sm"
        classNameContent="contents"
        onClick={onClick}
        aria-label={cardTitle}
        aria-pressed={isActive}
        data-testid="editor-scene-select"
        className="flex h-full w-full flex-1 flex-col justify-between gap-1 bg-transparent p-0"
      >
        <div className="absolute start-2 top-2 flex max-w-[calc(100%-4rem)] items-center gap-1.5">
          <span className="bg-accent/40 text-muted-foreground truncate rounded px-1.5 py-0.5 text-[10px] font-bold">
            {kindLabel}
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 pt-4">
          {getSceneIcon(kind)}
          <p className="text-foreground max-w-[180px] truncate text-center text-xs font-semibold">
            {cardTitle}
          </p>
        </div>

        <div className="border-accent/40 text-muted-foreground flex items-center justify-between border-t pt-1 text-[11px]">
          <span>{durationText}</span>
        </div>
      </PlatformButton>
      <div
        className={[
          "absolute end-1.5 top-1.5 flex items-center gap-1 group-focus-within:flex group-hover:flex focus-within:flex",
          isActive ? "" : "lg:hidden",
        ].join(" ")}
      >
        <PlatformButton
          size="sm"
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title={duplicateLabel}
          aria-label={duplicateLabel}
          className="text-muted-foreground bg-background hover:bg-accent hover:text-foreground rounded-sm p-1"
        >
          <Copy className="size-3.5" />
        </PlatformButton>

        <DeleteConfirmation
          trigger={
            <PlatformButton
              size="sm"
              type="button"
              onClick={(e) => e.stopPropagation()}
              title={deleteLabel}
              aria-label={deleteLabel}
              className="text-muted-foreground bg-background rounded-sm p-1 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </PlatformButton>
          }
          title={deleteLabel}
          description={t(
            "extensions:timeline.deleteCardConfirm",
            "Delete this scene card from the timeline?",
          )}
          confirmLabel={t("common:delete")}
          onConfirm={onDelete}
        />
      </div>
    </div>
  )
}
