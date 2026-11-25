import type { ComponentType } from "react"
import type { QuestionType } from "@razzia/common/types/game"
import type { AnswerComponentProps, ResponsesComponentProps } from "./types"
import SingleAnswers from "./single/components/SingleAnswers"
import MultiAnswers from "./multi/components/MultiAnswers"
import EstimationAnswers from "./estimation/components/EstimationAnswers"
import EstimationResponses from "./estimation/components/EstimationResponses"

/** The same original views, without editor or live-room dependencies. */
export const QUESTION_PRESENTATIONS = {
  single: { AnswerComponent: SingleAnswers },
  multi: { AnswerComponent: MultiAnswers },
  estimation: {
    AnswerComponent: EstimationAnswers,
    ResponsesComponent: EstimationResponses,
  },
} satisfies Record<
  QuestionType,
  {
    AnswerComponent: ComponentType<AnswerComponentProps>
    ResponsesComponent?: ComponentType<ResponsesComponentProps>
  }
>
