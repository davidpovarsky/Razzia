import {
  useStudioTimelineSidebar,
  type SortableItemProps,
} from "./studio/use-studio-timeline-sidebar"
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
import QuizzEditorCard from "@razzia/web/features/quizz/components/QuizzEditorCard"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { useRef } from "react"
import { useFormContext } from "react-hook-form"

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

const QuizzEditorSidebar = () => {
  const {
    questions,
    questionIds,
    currentIndex,
    setCurrentIndex,
    removeQuestion,
    reorderQuestions,
    duplicateQuestion,
  } = useQuizzEditor()

  const {
    formState: { errors },
  } = useFormContext<QuizzFormValues>()

  const isDragging = useRef(false)
  const timelineControls = useStudioTimelineSidebar({
    isDragging,
    QuestionItem: SortableItem,
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    isDragging.current = false
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    if (timelineControls.reorder(active.id, over.id)) {
      return
    }

    const from = questionIds.findIndex((id) => id === active.id)
    const to = questionIds.findIndex((id) => id === over.id)
    reorderQuestions(from, to)
  }

  const sortableIds = timelineControls.ids ?? questionIds

  return (
    <aside className="bg-background z-10 m-2 flex max-h-56 w-[calc(100%-1rem)] shrink-0 flex-col gap-2 overflow-y-auto rounded-xl p-2.5 shadow-sm lg:m-3 lg:max-h-none lg:w-64 lg:p-3 xl:w-72">
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
            {timelineControls.items ??
              questions.map((question, index) => (
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

      {timelineControls.addControls}
    </aside>
  )
}

export default QuizzEditorSidebar
