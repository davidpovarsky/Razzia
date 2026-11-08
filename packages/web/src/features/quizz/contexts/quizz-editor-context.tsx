import { useQuizzExtras } from "./extensions/use-quizz-extras"
import { zodResolver } from "@hookform/resolvers/zod"
import { QUESTION_TYPES, QUIZZ_MODES } from "@razzia/common/constants"
import type {
  Question,
  QuizzMode,
  QuizzWithId,
} from "@razzia/common/types/game"
import {
  quizzValidator,
  type QuizzValidated,
} from "@razzia/common/validators/quizz"
import type { AnyQuizExtras } from "@razzia/extensions/core"
import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react"
import { flushSync } from "react-dom"
import {
  FormProvider,
  useFieldArray,
  useForm,
  useWatch,
  type FieldPath,
} from "react-hook-form"

export interface QuizzFormValues {
  gameMode: QuizzMode
  subject: string
  questions: Question[]
}

interface QuizzEditorContextType {
  quizzId: string | null
  gameMode: QuizzMode
  questions: Question[]
  questionIds: string[]
  currentIndex: number
  currentQuestion: Question
  currentQuestionId: string
  isRemoving: boolean
  extras: AnyQuizExtras | null
  conflict: {
    serverRevision?: number
    expectedRevision?: number | null
  } | null
  setExtras: React.Dispatch<React.SetStateAction<AnyQuizExtras | null>>
  setConflict: React.Dispatch<
    React.SetStateAction<{
      serverRevision?: number
      expectedRevision?: number | null
    } | null>
  >
  setQuestionIds?: React.Dispatch<React.SetStateAction<string[]>>
  replaceQuestions?: (_newQuestions: Question[], _newIds: string[]) => void
  hasCurrentQuestion?: boolean
  setCurrentIndex: (_index: number) => void
  addQuestion: () => void
  removeQuestion: (_index: number) => void
  reorderQuestions: (_from: number, _to: number) => void
  duplicateQuestion?: (_index: number) => void
  updateQuestion: (_index: number, _updates: Partial<Question>) => void
  questionPath: <K extends FieldPath<Question>>(
    _field: K,
  ) => `questions.${number}.${K}`
}

const QuizzEditorContext = createContext<QuizzEditorContextType | null>(null)

const defaultQuestion = (): Question => ({
  type: QUESTION_TYPES.SINGLE,
  question: "",
  answers: ["", ""],
  solutions: [0],
  cooldown: 5,
  time: 20,
})

const clampIndex = (index: number, length: number) =>
  Math.max(0, Math.min(index, length - 1))

type QuizzEditorProviderProps = PropsWithChildren<{
  initialData?: QuizzWithId
}>

export const QuizzEditorProvider = ({
  children,
  initialData,
}: QuizzEditorProviderProps) => {
  const form = useForm<QuizzFormValues, unknown, QuizzValidated>({
    resolver: zodResolver(quizzValidator),
    defaultValues: {
      gameMode: initialData?.gameMode ?? QUIZZ_MODES.QUIZ,
      subject: initialData?.subject ?? "Untitled Quizz",
      questions: initialData ? initialData.questions : [defaultQuestion()],
    },
  })

  const { control, getValues, setValue, formState } = form
  const { append, remove, move, insert, replace } = useFieldArray({
    control,
    name: "questions",
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [removingFrom, setRemovingFrom] = useState<Question[] | null>(null)
  const {
    extras,
    setExtras,
    conflict,
    setConflict,
    questionIds,
    setQuestionIds,
    appendQuestionIdentity,
    removeQuestionIdentity,
    reorderQuestionIdentity,
    duplicateQuestionIdentity,
  } = useQuizzExtras(initialData)

  const questions = useWatch({ control, name: "questions" })
  const gameMode = useWatch({ control, name: "gameMode" })
  const hasCurrentQuestion =
    Array.isArray(questions) &&
    questions.length > 0 &&
    currentIndex >= 0 &&
    currentIndex < questions.length
  const safeIndex =
    Array.isArray(questions) && questions.length > 0
      ? clampIndex(currentIndex, questions.length)
      : 0
  const currentQuestion =
    Array.isArray(questions) && questions.length > 0
      ? (questions[safeIndex] ?? defaultQuestion())
      : defaultQuestion()

  const replaceQuestions = (newQuestions: Question[], newIds: string[]) => {
    replace(newQuestions)
    setQuestionIds(newIds)
  }

  // Derive stable questionIds: priority to extras.questionIds when matching questions length, otherwise state
  const effectiveQuestionIds =
    extras?.questionIds && extras.questionIds.length === questions.length
      ? extras.questionIds
      : questionIds

  const addQuestion = () => {
    const category = questions.at(-1)?.category
    append({ ...defaultQuestion(), ...(category ? { category } : {}) })
    appendQuestionIdentity()
    setCurrentIndex(questions.length)
  }

  const removeQuestion = (index: number) => {
    flushSync(() => setRemovingFrom(questions))
    remove(index)

    removeQuestionIdentity(index, effectiveQuestionIds)

    setCurrentIndex((current) => {
      if (current < index) {
        return current
      }

      if (current > index) {
        return current - 1
      }

      return clampIndex(current, questions.length - 1)
    })
  }

  const reorderQuestions = (from: number, to: number) => {
    move(from, to)
    setCurrentIndex(to)

    reorderQuestionIdentity(from, to, effectiveQuestionIds)
  }

  const duplicateQuestion = (index: number) => {
    const questionToClone = questions[index]
    const cloned: Question = structuredClone(questionToClone)
    insert(index + 1, cloned)
    setCurrentIndex(index + 1)

    duplicateQuestionIdentity(index, effectiveQuestionIds)
  }

  const questionPath = <K extends FieldPath<Question>>(field: K) =>
    `questions.${currentIndex}.${field}` as const

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    setValue(
      `questions.${index}`,
      { ...getValues(`questions.${index}`), ...updates },
      { shouldValidate: formState.isSubmitted, shouldDirty: true },
    )
  }

  return (
    <FormProvider {...form}>
      <QuizzEditorContext.Provider
        value={{
          quizzId: initialData?.id ?? null,
          gameMode,
          questions,
          questionIds: effectiveQuestionIds,
          currentIndex,
          currentQuestion,
          currentQuestionId: effectiveQuestionIds[safeIndex] ?? "",
          isRemoving: removingFrom === questions,
          extras,
          conflict,
          setExtras,
          setConflict,
          setQuestionIds,
          replaceQuestions,
          hasCurrentQuestion,
          setCurrentIndex,
          addQuestion,
          removeQuestion,
          reorderQuestions,
          duplicateQuestion,
          updateQuestion,
          questionPath,
        }}
      >
        {children}
      </QuizzEditorContext.Provider>
    </FormProvider>
  )
}

export const useQuizzEditor = () => {
  const ctx = useContext(QuizzEditorContext)

  if (!ctx) {
    throw new Error("useQuizzEditor must be used inside QuizzEditorProvider")
  }

  return ctx
}
