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
import { generateQuestionId, type QuizExtrasV1 } from "@razzia/extensions/core"
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
  useRef,
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
  extras: QuizExtrasV1 | null
  conflict: {
    serverRevision?: number
    expectedRevision?: number | null
  } | null
  setExtras: React.Dispatch<React.SetStateAction<QuizExtrasV1 | null>>
  setConflict: React.Dispatch<
    React.SetStateAction<{
      serverRevision?: number
      expectedRevision?: number | null
    } | null>
  >
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
  const { fields, append, remove, move, insert } = useFieldArray({
    control,
    name: "questions",
  })
  const [currentIndex, setCurrentIndex] = useState(0)
  const [removingFrom, setRemovingFrom] = useState<Question[] | null>(null)
  const [extras, setExtras] = useState<QuizExtrasV1 | null>(null)
  const [conflict, setConflict] = useState<{
    serverRevision?: number
    expectedRevision?: number | null
  } | null>(null)

  const fieldUuidMapRef = useRef<Map<string, string>>(new Map())

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

            fields.forEach((field, idx) => {
              const persistedUuid = res.extras?.questionIds[idx]

              if (persistedUuid) {
                fieldUuidMapRef.current.set(field.id, persistedUuid)
              }
            })

            return res.extras
          })
        }
      })
      .catch(() => undefined)

    return () => {
      isSubscribed = false
    }
  }, [initialData?.id, fields])

  const questions = useWatch({ control, name: "questions" })
  const gameMode = useWatch({ control, name: "gameMode" })
  const safeIndex = clampIndex(currentIndex, questions.length)
  const currentQuestion = questions[safeIndex]

  // Synchronize persisted question UUIDs from extras into fieldUuidMapRef
  useEffect(() => {
    if (!extras?.questionIds) {
      return
    }

    fields.forEach((field, idx) => {
      const persistedUuid = extras.questionIds[idx]

      if (persistedUuid) {
        fieldUuidMapRef.current.set(field.id, persistedUuid)
      }
    })
  }, [extras?.questionIds, fields])

  // Derive stable questionIds: priority to extras.questionIds[idx], then fieldUuidMapRef, then minted UUID
  const questionIds = fields.map((field, idx) => {
    if (extras?.questionIds?.[idx]) {
      const persisted = extras.questionIds[idx]
      fieldUuidMapRef.current.set(field.id, persisted)

      return persisted
    }

    let uuid = fieldUuidMapRef.current.get(field.id)

    if (!uuid) {
      uuid = generateQuestionId()
      fieldUuidMapRef.current.set(field.id, uuid)
    }

    return uuid
  })

  const addQuestion = () => {
    const category = questions.at(-1)?.category
    const newUuid = generateQuestionId()

    append({ ...defaultQuestion(), ...(category ? { category } : {}) })
    setCurrentIndex(questions.length)

    if (extras) {
      setExtras({
        ...extras,
        questionIds: [...extras.questionIds, newUuid],
      })
    }
  }

  const removeQuestion = (index: number) => {
    const fieldId = fields[index]?.id

    if (fieldId) {
      fieldUuidMapRef.current.delete(fieldId)
    }

    flushSync(() => setRemovingFrom(questions))
    remove(index)

    if (extras) {
      setExtras(removeQuestionFromExtras(extras, index))
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

    if (extras) {
      setExtras(reorderQuestionsInExtras(extras, from, to))
    }
  }

  const duplicateQuestion = (index: number) => {
    const questionToClone = questions[index]
    const cloned: Question = structuredClone(questionToClone)
    insert(index + 1, cloned)
    setCurrentIndex(index + 1)

    if (extras) {
      const { extras: newExtras } = duplicateQuestionInExtras(extras, index)
      setExtras(newExtras)
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
          questionIds,
          currentIndex,
          currentQuestion,
          currentQuestionId: questionIds[safeIndex],
          isRemoving: removingFrom === questions,
          extras,
          conflict,
          setExtras,
          setConflict,
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
