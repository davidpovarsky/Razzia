import AnswerButton from "../AnswerButton"
import {ANSWERS_COLORS,ANSWERS_LABELS} from "../../utils/constants"
import NativeButton from "@razzia/web/components/Button"
import type { StageQuestion } from "@razzia/extensions/presentation"
import {
  formatValue,
  getEstimationOptions,
  snapToStep,
} from "@razzia/web/features/questions/estimation/utils"
import { ESTIMATION_INPUT_MODES } from "@razzia/common/constants"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useTadazzShellText } from "./useTadazzLabels"

export interface TadazzAnswerPadProps {
  question: StageQuestion
  questionType: string
  options?: unknown
  selected: number[]
  submitted: boolean
  disabled: boolean
  onToggle: (index: number) => void
  onSubmit: (answerKeys: number[]) => void
}

/**
 * Player controls rendered under the 16:9 stage on portrait phones, using the
 * Motion Kit card skin. Selection semantics mirror the registry components:
 * single → submit on tap; multi → toggle + submit; estimation → value submit.
 */
export function TadazzAnswerPad({ question, questionType, options, selected, submitted, disabled, onToggle, onSubmit }: TadazzAnswerPadProps) {
  const { t } = useTranslation()
  const tx = useTadazzShellText()

  if (submitted) {
    return (
      <div className="tz-pad" data-testid="tadazz-answer-pad">
        <div className="tz-pad-status" data-testid="tadazz-answer-sent">{tx("answerSent", "ANSWER SENT")}</div>
      </div>
    )
  }

  if (questionType === "estimation") {
    return <EstimationPad options={options} disabled={disabled} onSubmit={onSubmit} />
  }

  const multi = questionType === "multi"
  return (
    <div className="tz-pad" data-testid="tadazz-answer-pad" role="group" aria-label={tx("answerChoices", "Answer choices")}>
      {question.options.map((opt, i) => (
        <AnswerButton
          label={ANSWERS_LABELS[i]}
          answerIndex={i}
          selected={multi ? selected.includes(i) : undefined}
          visual={opt.image ? {answerIndex:i,url:opt.image,display:"both",alt:opt.label} : undefined}
          key={`${question.key}:${i}`}
          type="button"
          className={ANSWERS_COLORS[i]}
          disabled={disabled}
          aria-pressed={selected.includes(i)}
          aria-label={`${ANSWERS_LABELS[i]} ${opt.label}`}
          data-testid={`tadazz-pad-option-${i}`}
          onClick={() => (multi ? onToggle(i) : onSubmit([i]))}
        >
          {opt.label}
        </AnswerButton>
      ))}
      {multi && (
        <NativeButton size="sm" type="button" className="font-display" disabled={disabled || selected.length === 0} onClick={() => onSubmit([...selected].sort((a, b) => a - b))} data-testid="tadazz-pad-submit">
          {t("game:confirm")}
        </NativeButton>
      )}
    </div>
  )
}

function EstimationPad({ options, disabled, onSubmit }: { options?: unknown; disabled: boolean; onSubmit: (keys: number[]) => void }) {
  const { t } = useTranslation()
  const estimation = getEstimationOptions(options as never)
  const { min, max, step, inputMode } = estimation
  const isSlider = inputMode === ESTIMATION_INPUT_MODES.SLIDER
  const [value, setValue] = useState(() => snapToStep((min + max) / 2, estimation))
  const [input, setInput] = useState("")
  const parsed = input.trim() === "" ? NaN : Number(input)
  const valid = isSlider || (Number.isFinite(parsed) && parsed >= min && parsed <= max)
  return (
    <div className="tz-pad" data-testid="tadazz-answer-pad">
      {isSlider ? (
        <>
          <div className="tz-pad-range-value">{formatValue(value)}</div>
          <input
            className="tz-pad-range"
            type="range"
            aria-label={t("game:estimation.yourAnswer")}
            min={min}
            max={max}
            step={step}
            value={value}
            disabled={disabled}
            onChange={(e) => setValue(snapToStep(Number(e.target.value), estimation))}
          />
        </>
      ) : (
        <input
          className="tz-pad-option"
          inputMode="decimal"
          aria-label={t("game:estimation.yourAnswer")}
          value={input}
          disabled={disabled}
          placeholder={`${formatValue(min)} – ${formatValue(max)}`}
          onChange={(e) => setInput(e.target.value)}
        />
      )}
      <NativeButton size="sm" type="button" className="font-display" disabled={disabled || !valid} onClick={() => onSubmit([isSlider ? value : parsed])}>
        {t("game:confirm")}
      </NativeButton>
    </div>
  )
}
