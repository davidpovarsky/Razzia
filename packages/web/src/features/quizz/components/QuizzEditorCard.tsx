import { QuestionCardActions } from "./studio/QuestionCardActions"
import { MEDIA_TYPES, QUESTION_TYPES } from "@razzia/common/constants"
import type { Question, QuestionMedia } from "@razzia/common/types/game"
import clsx from "clsx"
import { CircleAlert, Music, Video } from "lucide-react"
import { useTranslation } from "react-i18next"
import { twMerge } from "tailwind-merge"

const SlideMedia = ({ media }: { media?: QuestionMedia }) => {
  if (media?.type === MEDIA_TYPES.IMAGE) {
    return (
      <img src={media.url} className="mx-auto max-h-14 w-auto rounded-md" />
    )
  }

  if (media?.type === MEDIA_TYPES.VIDEO) {
    return <Video className="text-muted-foreground mx-auto size-10" />
  }

  if (media?.type === MEDIA_TYPES.AUDIO) {
    return <Music className="text-muted-foreground mx-auto size-10" />
  }

  return null
}

interface Props {
  question: Question
  index: number
  isActive: boolean
  isInvalid: boolean
  canDelete: boolean
  onClick: () => void
  onDelete: () => void
  onDuplicate?: () => void
}

const QuizzEditorCard = ({
  question,
  index,
  isActive,
  isInvalid,
  canDelete,
  onClick,
  onDelete,
  onDuplicate,
}: Props) => {
  const { t } = useTranslation()

  return (
    <div
      data-testid={`editor-question-card-${index}`}
      onClick={onClick}
      className={twMerge(
        clsx(
          "group border-accent bg-background relative flex h-36 cursor-pointer flex-col justify-between gap-1 rounded-lg border-2 px-6 py-2",
          {
            "border-primary": isActive,
            "border-red-500": isInvalid,
          },
        ),
      )}
    >
      <div className="absolute top-2 left-2 flex items-center gap-1">
        <span className="text-muted-foreground text-xs font-semibold">
          {index + 1}
        </span>

        {isInvalid && (
          <CircleAlert
            aria-label={t("quizz:questionHasErrors")}
            className="size-3.5 text-red-500"
          />
        )}
      </div>
      <p className="text-foreground truncate px-3 text-center text-xs font-semibold">
        {question.question || t("quizz:noQuestionYet")}
      </p>

      <SlideMedia media={question.media} />

      {question.type === QUESTION_TYPES.ESTIMATION ? (
        <div className="border-accent flex h-4 items-center rounded-md border px-1.5">
          <div className="bg-accent relative h-1 w-full rounded-full">
            <div className="bg-correct absolute top-1/2 left-1/2 size-1.5 -translate-1/2 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1">
          {question.answers.map((_, i) => (
            <div
              key={i}
              className="border-accent flex h-4 flex-1 items-center rounded-md border px-0.5"
            >
              {question.solutions?.includes(i) && (
                <div className="bg-correct ml-auto size-1.5 rounded-full" />
              )}
            </div>
          ))}
        </div>
      )}

      <QuestionCardActions
        canDelete={canDelete}
        onDelete={onDelete}
        onDuplicate={onDuplicate}
      />
    </div>
  )
}

export default QuizzEditorCard
