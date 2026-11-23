import { QUESTION_LEAD_IN_SECONDS } from "@razzia/common/constants"
import type {
  AuthoredQuizCard,
  AuthoredSurveyCard,
} from "../show-authoring-schema"

export type Round = AuthoredQuizCard | AuthoredSurveyCard

const picture = (name: string) => `/tadazz-show/gallery/picture-${name}.png`

export const quiz = (
  key: string,
  question: string,
  {
    answers,
    correct,
    pictures,
  }: {
    answers: string[]
    correct: number
    pictures?: string[]
  },
): Round => ({
  key,
  kind: "quiz",
  questionType: "single",
  question,
  timeSeconds: 25,
  cooldownSeconds: QUESTION_LEAD_IN_SECONDS,
  maxPoints: 1000,
  penalty: 0,
  correctAnswers: [correct],
  answers: answers.map((text, index) =>
    pictures
      ? {
          text,
          display: "both",
          imageUrl: pictures[index].startsWith("/")
            ? pictures[index]
            : picture(pictures[index]),
          alt: text,
        }
      : { text, display: "text" },
  ),
})

export const poll = (
  key: string,
  question: string,
  {
    answers,
    pictures,
  }: {
    answers: string[]
    pictures?: string[]
  },
): Round => ({
  key,
  kind: "survey",
  questionType: "single",
  question,
  timeSeconds: 25,
  cooldownSeconds: QUESTION_LEAD_IN_SECONDS,
  maxPoints: 0,
  penalty: 0,
  correctAnswers: [],
  answers: answers.map((text, index) =>
    pictures
      ? { text, display: "both", imageUrl: pictures[index], alt: text }
      : { text, display: "text" },
  ),
})
