import { TimelineSceneCard } from "@razzia/extensions/editor"
import type { Question } from "@razzia/common/types/game"
import type { TimelineItemKind } from "@razzia/extensions/core"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useStudioEditor } from "./studio-editor-context"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Plus } from "lucide-react"
import { useState, type ComponentType } from "react"
import { useFormContext } from "react-hook-form"
import { useTranslation } from "react-i18next"

export interface SortableItemProps {
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
  const { t } = useTranslation()
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
        DeleteConfirmation={AlertDialog}
        t={(key, fallback) =>
          fallback === undefined ? t(key) : t(key, fallback)
        }
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

export function useStudioTimelineSidebar({
  isDragging,
  QuestionItem,
}: {
  isDragging: { current: boolean }
  QuestionItem: ComponentType<SortableItemProps>
}) {
  const { questions, questionIds, addQuestion } = useQuizzEditor()
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
    {
      value: "animation",
      label: t("extensions:timeline.animation", "Animation"),
    },
    {
      value: "transition",
      label: t("extensions:timeline.transition", "Transition"),
    },
    { value: "opening", label: t("extensions:timeline.opening", "Opening") },
    { value: "closing", label: t("extensions:timeline.closing", "Closing") },
    {
      value: "countdown",
      label: t("extensions:timeline.countdown", "Countdown"),
    },
    {
      value: "leaderboard",
      label: t("extensions:timeline.leaderboard", "Leaderboard"),
    },
    {
      value: "interimResults",
      label: t("extensions:timeline.interimResults", "Interim Results"),
    },
    {
      value: "answerRecap",
      label: t("extensions:timeline.answerRecap", "Answer Recap"),
    },
  ]

  const items =
    timeline.length > 0
      ? timeline.map((item, index) => {
          if (item.kind === "question") {
            let qIndex = questionIds.findIndex((id) => id === item.questionId)

            if (qIndex < 0) {
              const questionOrdinal =
                timeline
                  .slice(0, index + 1)
                  .filter((tlItem) => tlItem.kind === "question").length - 1

              if (questionOrdinal >= 0 && questionOrdinal < questions.length) {
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
              <QuestionItem
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
      : null
  const addControls = (
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
                placeholder={t("extensions:studio.cardKindLabel", "Card Type")}
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
  )

  return {
    ids: timeline.length > 0 ? timeline.map((item) => item.id) : null,
    items,
    addControls,
    reorder(activeId: string | number, overId: string | number): boolean {
      if (timeline.length === 0) {
        return false
      }

      const from = timeline.findIndex((item) => item.id === activeId)
      const to = timeline.findIndex((item) => item.id === overId)

      if (from >= 0 && to >= 0) {
        reorderTimelineCards(from, to)
      }

      return true
    },
  }
}
