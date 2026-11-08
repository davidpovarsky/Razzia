import AlertDialog from "@razzia/web/components/AlertDialog"
import { Copy, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

export function QuestionCardActions({
  canDelete,
  onDelete,
  onDuplicate,
}: {
  canDelete: boolean
  onDelete: () => void
  onDuplicate?: () => void
}) {
  const { t } = useTranslation()

  return (
    <div className="absolute top-1.5 right-1.5 hidden items-center gap-1 group-focus-within:flex group-hover:flex focus-within:flex">
      {onDuplicate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDuplicate()
          }}
          title={t("quizz:question.duplicateQuestion", "Duplicate question")}
          aria-label={t(
            "quizz:question.duplicateQuestion",
            "Duplicate question",
          )}
          className="text-muted-foreground bg-background hover:bg-accent hover:text-foreground focus:ring-primary rounded-sm p-1 focus:ring-2 focus:outline-none"
        >
          <Copy className="size-3.5" />
        </button>
      )}

      {canDelete && (
        <AlertDialog
          trigger={
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={t("quizz:question.deleteQuestion")}
              className="text-muted-foreground bg-background rounded-sm p-1 hover:bg-red-50 hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </button>
          }
          title={t("quizz:question.deleteQuestion")}
          description={t("quizz:question.deleteQuestionConfirm")}
          confirmLabel={t("common:delete")}
          onConfirm={onDelete}
        />
      )}
    </div>
  )
}
