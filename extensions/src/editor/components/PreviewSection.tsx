import { RichAnswerCard } from "@razzia/extensions/media"
import { InterludePreview } from "@razzia/extensions/presentation"
import { CANONICAL_ANSWER_COLORS, type PerQuestionExtras } from "./utils"

interface Props {
  currentQuestionTitle: string
  currentQuestionAnswers: string[]
  currentPerQuestion?: PerQuestionExtras
  tr: (_key: string, _fallback: string) => string
}

export const PreviewSection = ({
  currentQuestionTitle,
  currentQuestionAnswers,
  currentPerQuestion,
  tr,
}: Props) => (
  <div className="flex flex-col gap-6" data-testid="panel-preview">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("preview.title", "Question Preview")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "preview.description",
            "Preview how the current question and answers render with visuals.",
          )}
        </p>
      </div>
      <span className="rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-bold tracking-wider text-neutral-600 uppercase dark:bg-neutral-800 dark:text-neutral-400">
        {tr("preview.badge", "Editor Preview")}
      </span>
    </div>

    <div className="flex flex-col gap-4 rounded-xl bg-neutral-900 p-6 text-white shadow-inner">
      <h2 className="text-center text-2xl font-bold">{currentQuestionTitle}</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {currentQuestionAnswers.map((ans, idx) => {
          const visual = currentPerQuestion?.answerVisuals?.find(
            (v) => v.answerIndex === idx,
          )

          return (
            <RichAnswerCard
              key={idx}
              label={String.fromCharCode(65 + idx)}
              text={ans}
              visual={visual}
              colorClass={
                CANONICAL_ANSWER_COLORS[idx % CANONICAL_ANSWER_COLORS.length]
              }
              disabled
              aria-disabled="true"
            />
          )
        })}
      </div>

      {currentPerQuestion?.interlude && (
        <div className="mt-6 border-t border-white/20 pt-4">
          <h4 className="mb-2 text-sm font-semibold tracking-wider text-white/70 uppercase">
            {tr("preview.interludeTitle", "Interlude Slide Preview")}
          </h4>
          <InterludePreview interlude={currentPerQuestion.interlude} />
        </div>
      )}
    </div>
  </div>
)
