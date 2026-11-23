import { PlatformButton } from "../../presentation/platform-controls"
import { useId, type ComponentType, type ReactNode } from "react"
import {
  getSceneCardPresentation,
  type SceneCardIcon,
  type SceneCardMetadata,
} from "../scene-card-presentation"
import {
  BarChart2,
  BookOpen,
  Building2,
  CircleCheck,
  Coffee,
  Copy,
  DoorOpen,
  Flag,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Music,
  Phone,
  Scale,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  Video,
  WandSparkles,
  type LucideIcon,
} from "lucide-react"

interface TimelineSceneCardProps {
  kind: string
  scene?: SceneCardMetadata
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

export const SCENE_CARD_ICONS: Record<SceneCardIcon, LucideIcon> = {
  animation: Sparkles,
  transition: Layers,
  image: ImageIcon,
  video: Video,
  audio: Music,
  leaderboard: Trophy,
  results: BarChart2,
  recap: ListChecks,
  countdown: Timer,
  opening: DoorOpen,
  closing: Flag,
  company: Building2,
  participants: Users,
  phone: Phone,
  ready: UserCheck,
  round: Flag,
  tie: Scale,
  assembly: WandSparkles,
  story: BookOpen,
  winner: CircleCheck,
  interlude: Coffee,
}

export const TimelineSceneCard = ({
  kind,
  scene,
  title,
  durationText,
  isActive,
  onClick,
  onDelete,
  onDuplicate,
  DeleteConfirmation,
  t,
}: TimelineSceneCardProps) => {
  const descriptionId = useId()
  const presentation = getSceneCardPresentation(kind, scene)
  const Icon = SCENE_CARD_ICONS[presentation.icon]
  const kindLabel = t(presentation.labelKey, kind)
  const cardTitle = title?.trim() || presentation.authoredTitle || kindLabel
  const description =
    presentation.authoredDescription ||
    (presentation.descriptionKey ? t(presentation.descriptionKey, "") : "")
  const advanceText = presentation.advanceLabelKey
    ? t(presentation.advanceLabelKey, durationText)
    : durationText
  const duplicateLabel = t(
    "extensions:timeline.duplicateCard",
    "Duplicate card",
  )
  const deleteLabel = t("extensions:timeline.deleteCard", "Delete scene card")

  return (
    <div
      data-testid="editor-scene-card"
      data-scene-kind={kind}
      data-scene-role={presentation.semanticKind}
      data-scene-preset={scene?.preset}
      className={[
        "group border-accent bg-background relative flex h-44 cursor-pointer flex-col justify-between gap-1 rounded-lg border-2 px-6 py-2 transition-all",
        isActive ? "border-primary shadow-sm" : "",
      ].join(" ")}
    >
      <PlatformButton
        type="button"
        size="sm"
        classNameContent="contents"
        onClick={onClick}
        aria-label={cardTitle}
        aria-describedby={description ? descriptionId : undefined}
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
          <Icon aria-hidden="true" className="text-primary size-6" />
          <p className="text-foreground line-clamp-2 w-full text-center text-xs font-semibold">
            {cardTitle}
          </p>
          {description && (
            <p
              id={descriptionId}
              className="text-muted-foreground line-clamp-2 w-full text-center text-[11px] leading-snug font-normal"
            >
              {description}
            </p>
          )}
        </div>

        <div className="border-accent/40 text-muted-foreground flex items-center justify-between border-t pt-1 text-[11px]">
          <span>{advanceText}</span>
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
