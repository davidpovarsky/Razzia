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
import {
  generateQuestionId,
  isQuizExtrasV2,
  type AnyQuizExtras,
} from "@razzia/extensions/core"
import {
  CompositeApiClient,
  duplicateQuestionInExtras,
  removeQuestionFromExtras,
  reorderQuestionsInExtras,
} from "@razzia/extensions/editor"
import {
  createContext,
  useContext,
  useEffect,
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
  const [extras, setExtras] = useState<AnyQuizExtras | null>(null)
  const [conflict, setConflict] = useState<{
    serverRevision?: number
    expectedRevision?: number | null
  } | null>(null)

  const [questionIds, setQuestionIds] = useState<string[]>(() => {
    const count = initialData?.questions.length ?? 1

    return Array.from({ length: count }, () => generateQuestionId())
  })

  useEffect(() => {
    if (!initialData?.id) {
      return
    }

    let isSubscribed = true
    const client = new CompositeApiClient({
      getAuthToken: () => localStorage.getItem("token"),
    })
    client
      .getQuizComposite(initialData.id)
      .then((res) => {
        if (!isSubscribed) {
          return
        }

        if (res.exists && res.extras) {
          setExtras((prev) => {
            // Guard: do not overwrite if user has already modified extras locally
            if (prev) {
              return prev
            }

            return res.extras
          })

          if (
            Array.isArray(res.extras.questionIds) &&
            res.extras.questionIds.length > 0
          ) {
            setQuestionIds(res.extras.questionIds)
          }
        }
      })
      .catch(() => undefined)

    return () => {
      isSubscribed = false
    }
  }, [initialData?.id])

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
    const newUuid = generateQuestionId()

    append({ ...defaultQuestion(), ...(category ? { category } : {}) })
    setQuestionIds((prev) => [...prev, newUuid])
    setCurrentIndex(questions.length)

    if (extras) {
      setExtras({
        ...extras,
        questionIds: [...extras.questionIds, newUuid],
      })
    }
  }

  const removeQuestion = (index: number) => {
    flushSync(() => setRemovingFrom(questions))
    remove(index)

    setQuestionIds((prev) => prev.filter((_, i) => i !== index))

    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const removedQId = effectiveQuestionIds[index]
        const nextPerQuestion = extras.perQuestion ? { ...extras.perQuestion } : {}
        if (removedQId && removedQId in nextPerQuestion) {
          delete nextPerQuestion[removedQId]
        }
        setExtras({
          ...extras,
          questionIds: effectiveQuestionIds.filter((_, i) => i !== index),
          perQuestion: nextPerQuestion,
        })
      } else {
        setExtras(removeQuestionFromExtras(extras, index))
      }
    }

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

    setQuestionIds((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)

      if (moved) {
        next.splice(to, 0, moved)
      }

      return next
    })

    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const nextQIds = [...effectiveQuestionIds]
        const [moved] = nextQIds.splice(from, 1)
        if (moved) {
          nextQIds.splice(to, 0, moved)
        }
        setExtras({
          ...extras,
          questionIds: nextQIds,
        })
      } else {
        setExtras(reorderQuestionsInExtras(extras, from, to))
      }
    }
  }

  const duplicateQuestion = (index: number) => {
    const questionToClone = questions[index]
    const cloned: Question = structuredClone(questionToClone)
    insert(index + 1, cloned)
    setCurrentIndex(index + 1)

    if (extras) {
      if (isQuizExtrasV2(extras)) {
        const sourceQId = effectiveQuestionIds[index]
        const newUuid = generateQuestionId()
        const nextPerQuestion = extras.perQuestion ? { ...extras.perQuestion } : {}
        if (sourceQId && sourceQId in nextPerQuestion) {
          nextPerQuestion[newUuid] = structuredClone(nextPerQuestion[sourceQId])
        }
        setExtras({
          ...extras,
          questionIds: [
            ...effectiveQuestionIds.slice(0, index + 1),
            newUuid,
            ...effectiveQuestionIds.slice(index + 1),
          ],
          perQuestion: nextPerQuestion,
        })
        setQuestionIds((prev) => {
          const next = [...prev]
          next.splice(index + 1, 0, newUuid)

          return next
        })
      } else {
        const { extras: newExtras, newQuestionId } = duplicateQuestionInExtras(
          extras,
          index,
        )
        setExtras(newExtras)
        setQuestionIds((prev) => {
          const next = [...prev]
          next.splice(index + 1, 0, newQuestionId)

          return next
        })
      }
    } else {
      const newUuid = generateQuestionId()
      setQuestionIds((prev) => {
        const next = [...prev]
        next.splice(index + 1, 0, newUuid)

        return next
      })
    }
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
