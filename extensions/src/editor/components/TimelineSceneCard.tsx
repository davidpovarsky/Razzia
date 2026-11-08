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
}: TimelineSceneCardProps) => (
  <div
    onClick={onClick}
    className={[
      "group border-accent bg-background relative flex h-36 cursor-pointer flex-col justify-between gap-1 rounded-lg border-2 px-6 py-2 transition-all",
      isActive ? "border-primary shadow-sm" : "",
    ].join(" ")}
  >
    <div className="absolute top-2 left-2 flex items-center gap-1.5">
      <span className="bg-accent/40 text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider uppercase">
        {kind}
      </span>
    </div>

    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 pt-4">
      {getSceneIcon(kind)}
      <p className="text-foreground max-w-[180px] truncate text-center text-xs font-semibold">
        {title ?? t(`extensions:timeline.${kind}`, kind)}
      </p>
    </div>

    <div className="border-accent/40 text-muted-foreground flex items-center justify-between border-t pt-1 text-[11px]">
      <span>{durationText}</span>
    </div>

    <div className="absolute top-1.5 right-1.5 hidden items-center gap-1 group-focus-within:flex group-hover:flex focus-within:flex">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDuplicate()
        }}
        title="Duplicate card"
        className="text-muted-foreground bg-background hover:bg-accent hover:text-foreground rounded-sm p-1"
      >
        <Copy className="size-3.5" />
      </button>

      <DeleteConfirmation
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="text-muted-foreground bg-background rounded-sm p-1 hover:bg-red-50 hover:text-red-500"
          >
            <Trash2 className="size-3.5" />
          </button>
        }
        title="Delete Scene Card"
        description="Are you sure you want to delete this scene card from the timeline?"
        confirmLabel={t("common:delete")}
        onConfirm={onDelete}
      />
    </div>
  </div>
)
