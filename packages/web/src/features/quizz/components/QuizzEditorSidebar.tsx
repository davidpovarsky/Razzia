import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  restrictToFirstScrollableAncestor,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Question } from "@razzia/common/types/game"
import type { TimelineItemKind } from "@razzia/extensions/core"
import { useStudioEditor } from "@razzia/web/features/quizz/components/studio"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import QuizzEditorCard from "@razzia/web/features/quizz/components/QuizzEditorCard"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import {
  BarChart2,
  Copy,
  DoorOpen,
  Flag,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Plus,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
} from "lucide-react"
import { useRef, useState } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

interface TimelineSceneCardProps {
  kind: string
  title?: string
  durationText: string
  isActive: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate: () => void
}

const getSceneIcon = (kind: string) => {
  switch (kind) {
    case "transition":
      return <Layers className="size-5 text-primary" />

    case "animation":
      return <Sparkles className="size-5 text-primary" />

    case "media":
      return <ImageIcon className="size-5 text-primary" />

    case "leaderboard":
      return <Trophy className="size-5 text-primary" />

    case "interimResults":
      return <BarChart2 className="size-5 text-primary" />

    case "answerRecap":
      return <ListChecks className="size-5 text-primary" />

    case "countdown":
      return <Timer className="size-5 text-primary" />

    case "opening":
      return <DoorOpen className="size-5 text-primary" />

    case "closing":
      return <Flag className="size-5 text-primary" />

    default:
      return <Layers className="size-5 text-primary" />
  }
}

const TimelineSceneCard = ({
  kind,
  title,
  durationText,
  isActive,
  onClick,
  onDelete,
  onDuplicate,
}: TimelineSceneCardProps) => {
  const { t } = useTranslation()

  return (
    <div
      onClick={onClick}
      className={twMerge(
        clsx(
          "group border-accent bg-background relative flex h-36 cursor-pointer flex-col justify-between gap-1 rounded-lg border-2 px-6 py-2 transition-all",
          {
            "border-primary shadow-sm": isActive,
          },
        ),
      )}
    >
      <div className="absolute top-2 left-2 flex items-center gap-1.5">
        <span className="rounded bg-accent/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {kind}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 pt-4">
        {getSceneIcon(kind)}
        <p className="text-foreground max-w-[180px] truncate text-center text-xs font-semibold">
          {title ?? t(`extensions:timeline.${kind}`, kind)}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-accent/40 pt-1 text-[11px] text-muted-foreground">
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

        <AlertDialog
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
}

interface SortableItemProps {
  id: string
  question: Question
  index: number
  isActive: boolean
  isInvalid: boolean
  canDelete: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate?: () => void
}

const SortableItem = ({
  id,
  question,
  index,
  isActive,
  isInvalid,
  canDelete,
  onClick,
  onDelete,
  onDuplicate,
}: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={clsx(isDragging && "shadow-lg")}
    >
      <QuizzEditorCard
        question={question}
        index={index}
        isActive={isActive}
        isInvalid={isInvalid}
        canDelete={canDelete}
        onClick={onClick}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
    </div>
  )
}

interface SortableSceneItemProps {
  id: string
  kind: string
  title?: string
  durationText: string
  isActive: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate: () => void
}

const SortableSceneItem = ({
  id,
  kind,
  title,
  durationText,
  isActive,
  onClick,
  onDelete,
  onDuplicate,
}: SortableSceneItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={clsx(isDragging && "shadow-lg")}
    >
      <TimelineSceneCard
        kind={kind}
        title={title}
        durationText={durationText}
        isActive={isActive}
        onClick={onClick}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
    </div>
  )
}

const QuizzEditorSidebar = () => {
  const {
    questions,
    questionIds,
    currentIndex,
    setCurrentIndex,
    addQuestion,
    removeQuestion,
    reorderQuestions,
    duplicateQuestion,
  } = useQuizzEditor()

  const {
    timeline,
    selectedTimelineId,
    selectTimelineItem,
    addTimelineCard,
    removeTimelineCard,
    duplicateTimelineCard,
    reorderTimelineCards,
    scenes,
    defaults,
  } = useStudioEditor()

  const {
    formState: { errors },
  } = useFormContext<QuizzFormValues>()
  const { t } = useTranslation()

  const [cardKindToAdd, setCardKindToAdd] = useState<TimelineItemKind>(
    defaults.newQuestionMode,
  )

  const timelineKinds: Array<{ value: TimelineItemKind; label: string }> = [
    { value: "quiz", label: t("extensions:timeline.quiz", "Quiz") },
    { value: "survey", label: t("extensions:timeline.survey", "Survey") },
    { value: "media", label: t("extensions:timeline.media", "Media") },
    { value: "animation", label: t("extensions:timeline.animation", "Animation") },
    { value: "transition", label: t("extensions:timeline.transition", "Transition") },
    { value: "opening", label: t("extensions:timeline.opening", "Opening") },
    { value: "closing", label: t("extensions:timeline.closing", "Closing") },
    { value: "countdown", label: t("extensions:timeline.countdown", "Countdown") },
    { value: "leaderboard", label: t("extensions:timeline.leaderboard", "Leaderboard") },
    { value: "interimResults", label: t("extensions:timeline.interimResults", "Interim Results") },
    { value: "answerRecap", label: t("extensions:timeline.answerRecap", "Answer Recap") },
  ]

  const isDragging = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    isDragging.current = false
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    if (timeline.length > 0) {
      const from = timeline.findIndex((item) => item.id === active.id)
      const to = timeline.findIndex((item) => item.id === over.id)

      if (from >= 0 && to >= 0) {
        reorderTimelineCards(from, to)
      }

      return
    }

    const from = questionIds.findIndex((id) => id === active.id)
    const to = questionIds.findIndex((id) => id === over.id)
    reorderQuestions(from, to)
  }

  const sortableIds =
    timeline.length > 0 ? timeline.map((item) => item.id) : questionIds

  return (
    <aside className="bg-background z-10 m-2 flex max-h-56 w-[calc(100%-1rem)] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl p-2.5 shadow-sm lg:m-3 lg:max-h-none lg:w-64 xl:w-72 lg:p-3">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToFirstScrollableAncestor]}
        onDragStart={() => {
          isDragging.current = true
        }}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortableIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {timeline.length > 0
              ? timeline.map((item, index) => {
                  if (item.kind === "question") {
                    let qIndex = questionIds.findIndex(
                      (id) => id === item.questionId,
                    )

                    if (qIndex < 0) {
                      const questionOrdinal =
                        timeline
                          .slice(0, index + 1)
                          .filter((tlItem) => tlItem.kind === "question")
                          .length - 1

                      if (
                        questionOrdinal >= 0 &&
                        questionOrdinal < questions.length
                      ) {
                        qIndex = questionOrdinal
                      }
                    }

                    if (qIndex < 0 || qIndex >= questions.length) {
                      return null
                    }

                    const question = questions[qIndex]

                    const questionOrdinal = timeline
                      .slice(0, index + 1)
                      .filter((tlItem) => tlItem.kind === "question").length

                    return (
                      <SortableItem
                        key={item.id}
                        id={item.id}
                        question={question}
                        index={questionOrdinal - 1}
                        isActive={selectedTimelineId === item.id}
                        isInvalid={Boolean(errors.questions?.[qIndex])}
                        canDelete={questions.length > 1}
                        onClick={() => {
                          if (!isDragging.current) {
                            selectTimelineItem(item.id)
                          }
                        }}
                        onDelete={() => removeTimelineCard(index)}
                        onDuplicate={() => duplicateTimelineCard(index)}
                      />
                    )
                  }

                  const scene = scenes[item.sceneId] as
                    | {
                        title?: string
                        durationMs?: number
                        durationSeconds?: number
                      }
                    | undefined

                  let durationText = "5s"

                  if (scene?.durationSeconds) {
                    durationText = `${scene.durationSeconds}s`
                  } else if (scene?.durationMs) {
                    durationText = `${Math.round(scene.durationMs / 1000)}s`
                  }

                  return (
                    <SortableSceneItem
                      key={item.id}
                      id={item.id}
                      kind={item.kind}
                      title={scene?.title}
                      durationText={durationText}
                      isActive={selectedTimelineId === item.id}
                      onClick={() => {
                        if (!isDragging.current) {
                          selectTimelineItem(item.id)
                        }
                      }}
                      onDelete={() => removeTimelineCard(index)}
                      onDuplicate={() => duplicateTimelineCard(index)}
                    />
                  )
                })
              : questions.map((question, index) => (
                  <SortableItem
                    key={questionIds[index]}
                    id={questionIds[index]}
                    question={question}
                    index={index}
                    isActive={currentIndex === index}
                    isInvalid={Boolean(errors.questions?.[index])}
                    canDelete={questions.length > 1}
                    onClick={() => {
                      if (!isDragging.current) {
                        setCurrentIndex(index)
                      }
                    }}
                    onDelete={() => removeQuestion(index)}
                    onDuplicate={
                      duplicateQuestion
                        ? () => duplicateQuestion(index)
                        : undefined
                    }
                  />
                ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-1 mb-8 flex flex-col gap-2">
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <Select
              value={cardKindToAdd}
              onValueChange={(val) => setCardKindToAdd(val as TimelineItemKind)}
            >
              <SelectTrigger
                className="h-10 text-xs font-medium"
                data-testid="studio-card-kind-select"
              >
                <SelectValue
                  placeholder={t(
                    "extensions:studio.cardKindLabel",
                    "Card Type",
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {timelineKinds.map((item) => (
                  <SelectItem
                    key={item.value}
                    value={item.value}
                    className="text-xs"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            data-testid="studio-add-card-btn"
            onClick={() => {
              if (timeline.length > 0) {
                addTimelineCard(cardKindToAdd)
              } else {
                addQuestion()
              }
            }}
            className="bg-accent text-accent-foreground flex h-10 shrink-0 items-center justify-center gap-1 px-3 text-xs font-semibold"
          >
            <Plus className="size-4" />
            {t("extensions:studio.addCard", "Add card")}
          </Button>
        </div>
      </div>
    </aside>
  )
}

export default QuizzEditorSidebar
