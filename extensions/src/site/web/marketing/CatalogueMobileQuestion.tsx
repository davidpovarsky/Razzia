import { useSyncExternalStore } from "react"
import { TadazzAnswerPad } from "@razzia/web/features/game/components/tadazz-show/TadazzAnswerPad"
import type { StageQuestion } from "../../../presentation/tadazz-show/TadazzStage"
import {
  showThemeStyle,
  useShowTheme,
} from "../../../presentation/show-themes/context"
import { siteText as t } from "../../locales"
import mobileQuestionCss from "./catalogue-mobile-question.css?inline"

const MOBILE_CONTROLS_QUERY =
  "(max-width: 700px), (max-height: 500px) and (orientation: landscape)"

function subscribeToMobileControls(onChange: () => void) {
  const media = window.matchMedia(MOBILE_CONTROLS_QUERY)
  media.addEventListener("change", onChange)

  return () => media.removeEventListener("change", onChange)
}

function mobileControlsSnapshot() {
  return window.matchMedia(MOBILE_CONTROLS_QUERY).matches
}

function serverMobileControlsSnapshot() {
  return false
}

/** Matches the companion CSS without introducing a second game state. */
export function useCatalogueMobileControls() {
  return useSyncExternalStore(
    subscribeToMobileControls,
    mobileControlsSnapshot,
    serverMobileControlsSnapshot,
  )
}

interface CatalogueMobileQuestionProps {
  question: StageQuestion
  questionType: "quiz" | "survey"
  voting: boolean
  showAnswers?: boolean
  busy: boolean
  selected: number | undefined
  correctAnswers?: readonly number[]
  audienceFavourite?: string
  onChoose: (index: number) => void
}

/** The native player pad reads the same question and submits to the solo controller. */
export function CatalogueMobileQuestion({
  question,
  questionType,
  voting,
  showAnswers = true,
  busy,
  selected,
  correctAnswers,
  audienceFavourite,
  onChoose,
}: CatalogueMobileQuestionProps) {
  const theme = useShowTheme("player")
  const selectedLabel =
    selected === undefined ? undefined : question.options[selected]?.label
  const correctLabels = correctAnswers
    ?.map((index) => question.options[index]?.label)
    .filter((label): label is string => Boolean(label))

  let phase = voting ? "voting" : "results"

  if (!showAnswers) {
    phase = "question"
  }

  return (
    <section
      className="catalogue-mobile-question"
      data-testid="catalogue-mobile-question"
      data-question-key={question.key}
      data-question-type={questionType}
      data-phase={phase}
      data-theme-id={theme.definition.id}
      aria-label={t("Choose an answer")}
      dir="auto"
      style={showThemeStyle(theme)}
    >
      <style>{mobileQuestionCss}</style>
      <h2 data-testid="catalogue-mobile-question-heading" dir="auto">
        {question.question}
      </h2>
      {question.questionImage && (
        <img
          className="catalogue-mobile-question-image"
          data-testid="catalogue-mobile-question-image"
          src={question.questionImage}
          alt={question.photoAlt ?? question.question}
        />
      )}
      {showAnswers && (
        <TadazzAnswerPad
          question={question}
          questionType="single"
          selected={selected === undefined ? [] : [selected]}
          submitted={false}
          disabled={!voting || busy}
          onToggle={onChoose}
          onSubmit={(keys) => {
            const [choice] = keys

            if (
              keys.length === 1 &&
              Number.isInteger(choice) &&
              choice >= 0 &&
              choice < question.options.length
            ) {
              onChoose(choice)
            }
          }}
        />
      )}
      {showAnswers && !voting && (
        <div className="catalogue-mobile-feedback" role="status">
          <p data-testid="catalogue-mobile-selected-answer" dir="auto">
            {t("Your choice")}: <bdi>{selectedLabel ?? "—"}</bdi>
          </p>
          {correctLabels && correctLabels.length > 0 && (
            <p data-testid="catalogue-mobile-correct-answer" dir="auto">
              {t("Correct answer")}: <bdi>{correctLabels.join(", ")}</bdi>
            </p>
          )}
          {audienceFavourite && (
            <p data-testid="catalogue-mobile-audience-favourite" dir="auto">
              Audience favourite: <bdi>{audienceFavourite}</bdi>
            </p>
          )}
        </div>
      )}
    </section>
  )
}
