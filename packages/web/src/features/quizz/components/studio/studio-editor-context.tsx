import { QUIZZ_MODES } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import {
  createDefaultRosterExtras,
  createDefaultQuizExtrasV2,
  isQuestionCardBlankForConversion,
  type AnyQuizExtras,
  type QuizExtrasV2,
  type SceneConfig,
  type StudioDefaults,
  type TimelineItem,
  type TimelineItemKind,
  isQuizExtrasV2,
  upgradeLegacyExtrasToV2,
} from "@razzia/extensions/core"
import {
  useQuizzEditor,
  type QuizzFormValues,
} from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react"
import { useFormContext, useWatch } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

export type StudioTab = "questions" | "participants" | "settings" | "launch"

interface StudioEditorContextType {
  activeTab: StudioTab
  setActiveTab: (tab: StudioTab) => void
  timeline: TimelineItem[]
  selectedTimelineId: string | null
  selectedTimelineItem: TimelineItem | undefined
  selectedTimelineIndex: number
  selectedKind: TimelineItemKind
  scenes: Record<string, SceneConfig>
  defaults: StudioDefaults
  selectTimelineItem: (id: string) => void
  changeSelectedCardKind: (newKind: TimelineItemKind) => void
  addTimelineCard: (kind?: TimelineItemKind) => void
  removeTimelineCard: (index: number) => void
  duplicateTimelineCard: (index: number) => void
  reorderTimelineCards: (from: number, to: number) => void
  updateSceneConfig: (sceneId: string, updates: Partial<SceneConfig>) => void
  updateDefaults: (updates: Partial<StudioDefaults>) => void
  bulkApplyQuestionMode: (mode: "quiz" | "survey") => void
  pendingConversion: { from: TimelineItem; toKind: TimelineItemKind } | null
  confirmPendingConversion: () => void
  cancelPendingConversion: () => void
}

const StudioEditorContext = createContext<StudioEditorContextType | null>(null)

export const useStudioEditor = () => {
  const ctx = useContext(StudioEditorContext)

  if (!ctx) {
    throw new Error("useStudioEditor must be used within a StudioEditorProvider")
  }

  return ctx
}

export const StudioEditorProvider = ({ children }: PropsWithChildren) => {
  const { t } = useTranslation()
  const {
    quizzId,
    questionIds,
    setQuestionIds,
    replaceQuestions,
    extras,
    setExtras,
    currentIndex,
    setCurrentIndex,
  } = useQuizzEditor()

  const { control, getValues, setValue } = useFormContext<QuizzFormValues>()
  const questions = useWatch({ control, name: "questions" })
  const gameMode = useWatch({ control, name: "gameMode" })

  const [activeTab, setActiveTab] = useState<StudioTab>("questions")
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [scenes, setScenes] = useState<Record<string, SceneConfig>>({})
  const [defaults, setDefaults] = useState<StudioDefaults>({
    newQuestionMode: "quiz",
    leaderboardPolicy: "cardOnly",
    advanceMode: "auto",
  })
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null)
  const [pendingConversion, setPendingConversion] = useState<{
    from: TimelineItem
    toKind: TimelineItemKind
  } | null>(null)

  // Initialize or synchronize V2 timeline and scenes from extras
  useEffect(() => {
    if (extras && isQuizExtrasV2(extras)) {
      setTimeline(extras.timeline)
      setScenes(extras.scenes)
      setDefaults(extras.defaults)

      if (extras.timeline.length > 0) {
        setSelectedTimelineId((prev) => prev ?? extras.timeline[0].id)
      }
    } else if (extras && !isQuizExtrasV2(extras)) {
      // Migrate V1 to V2
      const baseQuiz = { questions: getValues("questions") }
      const upgraded = upgradeLegacyExtrasToV2(baseQuiz, extras, {
        quizId: quizzId ?? "temp-quiz",
        baseDigest: extras.baseDigest,
      })
      setTimeline(upgraded.timeline)
      setScenes(upgraded.scenes)
      setDefaults(upgraded.defaults)

      if (upgraded.timeline.length > 0) {
        setSelectedTimelineId((prev) => prev ?? upgraded.timeline[0].id)
      }

      setExtras(upgraded)
    } else {
      // Extras is null: either new unsaved quiz or sidecar is in-flight from server
      if (timeline.length > 0) {
        return
      }

      const currentQuestions = getValues("questions")
      const targetQIds =
        questionIds.length === currentQuestions.length && questionIds.length > 0
          ? questionIds
          : currentQuestions.map(() => crypto.randomUUID())

      if (setQuestionIds && targetQIds !== questionIds) {
        setQuestionIds(targetQIds)
      }

      const defaultV2 = createDefaultQuizExtrasV2(
        quizzId ?? "temp-quiz",
        targetQIds,
        "0".repeat(64),
      )
      setTimeline(defaultV2.timeline)
      setScenes(defaultV2.scenes)
      setDefaults(defaultV2.defaults)

      if (defaultV2.timeline.length > 0) {
        setSelectedTimelineId((prev) => prev ?? defaultV2.timeline[0].id)
      }

      // Only set local extras when creating a brand new quiz with no server sidecar
      if (!quizzId) {
        setExtras(defaultV2)
      }
    }
  }, [extras, quizzId, getValues, setExtras, questionIds, setQuestionIds, timeline.length])

  // Derive selected timeline index & item
  const selectedTimelineIndex = useMemo(() => {
    if (!selectedTimelineId || timeline.length === 0) {return 0}

    const idx = timeline.findIndex((item) => item.id === selectedTimelineId)

    return idx >= 0 ? idx : 0
  }, [timeline, selectedTimelineId])

  const selectedTimelineItem: TimelineItem | undefined =
    timeline.length > 0 ? timeline[selectedTimelineIndex] : undefined

  // Map selected question item to questionIndex and sync with QuizzEditorContext
  useEffect(() => {
    if (!selectedTimelineItem) {return}

    if (selectedTimelineItem.kind === "question") {
      let qIndex = questionIds.findIndex(
        (id) => id === selectedTimelineItem.questionId,
      )

      if (qIndex < 0) {
        const ordinal =
          timeline
            .slice(0, selectedTimelineIndex + 1)
            .filter((entry) => entry.kind === "question").length - 1

        if (ordinal >= 0) {
          qIndex = ordinal
        }
      }

      if (qIndex >= 0 && qIndex !== currentIndex) {
        setCurrentIndex(qIndex)
      }
    }
  }, [
    selectedTimelineItem,
    selectedTimelineIndex,
    timeline,
    questionIds,
    currentIndex,
    setCurrentIndex,
  ])

  // Determine effective kind of currently selected card
  const selectedKind: TimelineItemKind = useMemo(() => {
    if (!selectedTimelineItem) {return "quiz"}

    if (selectedTimelineItem.kind === "question") {
      const qIndex = questionIds.findIndex(
        (id) => id === selectedTimelineItem.questionId,
      )
      const q = qIndex >= 0 ? questions[qIndex] : undefined

      if (q?.playMode === "survey" || (!q?.playMode && gameMode === QUIZZ_MODES.SURVEY)) {
        return "survey"
      }

      return "quiz"
    }

    return selectedTimelineItem.kind
  }, [selectedTimelineItem, questionIds, questions, gameMode])

  // Persist timeline & scenes back to extras atomically
  const syncToExtras = useCallback(
    (
      newTimeline: TimelineItem[],
      newScenes: Record<string, SceneConfig>,
      options?: {
        defaults?: StudioDefaults
        targetQuestionIds?: string[]
        targetPerQuestion?: QuizExtrasV2["perQuestion"]
      },
    ) => {
      setExtras((prev: AnyQuizExtras | null) => {
        if (!prev) {
          return null
        }

        const effectiveQuestionIds =
          options?.targetQuestionIds ??
          (Array.isArray(prev.questionIds) && prev.questionIds.length > 0
            ? prev.questionIds
            : questionIds)

        const v2: QuizExtrasV2 = {
          schemaVersion: 2,
          revision: prev.revision,
          quizId: prev.quizId,
          baseDigest: prev.baseDigest,
          questionIds: effectiveQuestionIds,
          timeline: newTimeline,
          scenes: newScenes,
          defaults: options?.defaults ?? defaults,
          audio: prev.audio,
          teams: prev.teams,
          roster: prev.roster ?? createDefaultRosterExtras(),
          perQuestion: options?.targetPerQuestion ?? prev.perQuestion,
          leaderboard: prev.leaderboard,
          authoring: (prev as QuizExtrasV2).authoring,
          ...(prev.mediaCatalog ? { mediaCatalog: prev.mediaCatalog } : {}),
        }

        return v2
      })
    },
    [questionIds, setExtras, defaults],
  )

  const selectTimelineItem = useCallback(
    (id: string) => {
      setSelectedTimelineId(id)
      const itemIndex = timeline.findIndex((entry) => entry.id === id)

      if (itemIndex < 0) {
        return
      }

      const item = timeline[itemIndex]

      if (item.kind === "question") {
        let qIndex = questionIds.findIndex((qid) => qid === item.questionId)

        if (qIndex < 0) {
          const ordinal =
            timeline
              .slice(0, itemIndex + 1)
              .filter((entry) => entry.kind === "question").length - 1

          if (ordinal >= 0) {
            qIndex = ordinal
          }
        }

        if (qIndex >= 0) {
          setCurrentIndex(qIndex)
        }
      }
    },
    [timeline, questionIds, setCurrentIndex],
  )

  // Create default scene config helper
  const createDefaultScene = useCallback(
    (kind: TimelineItemKind, sceneId: string): SceneConfig => {
      switch (kind) {
        case "transition":
          return {
            id: sceneId,
            kind: "transition",
            title: "",
            description: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "animation":
          return {
            id: sceneId,
            kind: "animation",
            preset: "spotlight",
            title: "",
            durationMs: 3000,
            advance: "auto",
          }

        case "media":
          return {
            id: sceneId,
            kind: "media",
            mediaUrl: "/media/background.png",
            mediaType: "image",
            title: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "leaderboard":
          return {
            id: sceneId,
            kind: "leaderboard",
            title: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "interimResults":
          return {
            id: sceneId,
            kind: "interimResults",
            title: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "countdown":
          return {
            id: sceneId,
            kind: "countdown",
            durationSeconds: 10,
            title: "",
            advance: "auto",
          }

        case "opening":
          return {
            id: sceneId,
            kind: "opening",
            title: getValues("subject") || "Welcome",
            subtitle: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "closing":
          return {
            id: sceneId,
            kind: "closing",
            title: "Thank you for participating!",
            subtitle: "",
            durationMs: 5000,
            advance: "auto",
          }

        default:
          return {
            id: sceneId,
            kind: "transition",
            title: "",
            durationMs: 5000,
            advance: "auto",
          }
      }
    },
    [getValues],
  )

  interface StudioMutationResult {
    nextQuestions: Question[]
    nextQuestionIds: string[]
    nextTimeline: TimelineItem[]
    nextScenes: Record<string, SceneConfig>
    nextSelectedId: string
    nextCurrentIndex: number
    nextPerQuestion?: QuizExtrasV2["perQuestion"]
  }

  const applyStudioMutation = useCallback(
    (result: StudioMutationResult) => {
      if (replaceQuestions) {
        replaceQuestions(result.nextQuestions, result.nextQuestionIds)
      } else {
        setValue("questions", result.nextQuestions, { shouldDirty: true })

        if (setQuestionIds) {
          setQuestionIds(result.nextQuestionIds)
        }
      }

      setTimeline(result.nextTimeline)
      setScenes(result.nextScenes)
      setSelectedTimelineId(result.nextSelectedId)

      if (result.nextCurrentIndex >= 0) {
        setCurrentIndex(result.nextCurrentIndex)
      }

      syncToExtras(result.nextTimeline, result.nextScenes, {
        defaults,
        targetQuestionIds: result.nextQuestionIds,
        targetPerQuestion: result.nextPerQuestion,
      })
    },
    [
      replaceQuestions,
      setValue,
      setQuestionIds,
      setCurrentIndex,
      syncToExtras,
      defaults,
    ],
  )

  // Direct conversion executor
  const executeConversion = useCallback(
    (item: TimelineItem, toKind: TimelineItemKind) => {
      const itemIdx = timeline.findIndex((entry) => entry.id === item.id)

      if (itemIdx < 0) {
        return
      }

      const currentQuestions = getValues("questions")
      const currentQIds = [...questionIds]
      const currentTimeline = [...timeline]
      const currentScenes = { ...scenes }

      // Case 1: Question -> Question (Quiz <-> Survey)
      if (
        item.kind === "question" &&
        (toKind === "quiz" || toKind === "survey")
      ) {
        const qIndex = currentQIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0 && qIndex < currentQuestions.length) {
          const currentQ = currentQuestions[qIndex]
          const updatedQ: Question = {
            ...currentQ,
            playMode: toKind,
            ...(toKind === "quiz" &&
            (!currentQ.solutions || currentQ.solutions.length === 0)
              ? { solutions: [0] }
              : {}),
          }
          const nextQuestions = currentQuestions.map((q, idx) =>
            idx === qIndex ? updatedQ : q,
          )

          if (replaceQuestions) {
            replaceQuestions(nextQuestions, currentQIds)
          } else {
            setValue("questions", nextQuestions, { shouldDirty: true })
          }
        }

        return
      }

      // Case 2: Question -> Non-Question Scene
      if (
        item.kind === "question" &&
        toKind !== "quiz" &&
        toKind !== "survey"
      ) {
        const questionCount = currentTimeline.filter(
          (entry) => entry.kind === "question",
        ).length

        if (questionCount <= 1) {
          toast.error(t("extensions:timeline.cannotDeleteLastQuestion"))

          return
        }

        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(toKind, sceneId)
        const nextScenes = { ...currentScenes, [sceneId]: newScene }
        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? { id: item.id, kind: toKind as never, sceneId }
            : entry,
        )

        const qIndex = currentQIds.findIndex((id) => id === item.questionId)
        const nextQuestions =
          qIndex >= 0
            ? currentQuestions.filter((_, idx) => idx !== qIndex)
            : currentQuestions
        const nextQIds =
          qIndex >= 0
            ? currentQIds.filter((_, idx) => idx !== qIndex)
            : currentQIds
        const nextCurrentIndex = Math.max(
          0,
          Math.min(qIndex, nextQuestions.length - 1),
        )
        const nextPerQuestion = extras?.perQuestion
          ? { ...extras.perQuestion }
          : undefined
        if (nextPerQuestion && item.questionId in nextPerQuestion) {
          delete nextPerQuestion[item.questionId]
        }

        applyStudioMutation({
          nextQuestions,
          nextQuestionIds: nextQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: item.id,
          nextCurrentIndex,
          nextPerQuestion,
        })

        return
      }

      // Case 3: Scene -> Question (Quiz or Survey)
      if (
        item.kind !== "question" &&
        (toKind === "quiz" || toKind === "survey")
      ) {
        const newQId = crypto.randomUUID()
        const oldSceneTitle =
          "sceneId" in item ? currentScenes[item.sceneId]?.title : undefined
        const newQuestion: Question = {
          type: "single",
          playMode: toKind,
          question: oldSceneTitle ?? "",
          answers: ["", ""],
          solutions: toKind === "quiz" ? [0] : [],
          cooldown: 5,
          time: 20,
        }

        const nextQuestions = [...currentQuestions, newQuestion]
        const nextQIds = [...currentQIds, newQId]
        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? { id: item.id, kind: "question" as const, questionId: newQId }
            : entry,
        )

        const nextScenes =
          "sceneId" in item
            ? Object.fromEntries(
                Object.entries(currentScenes).filter(
                  ([id]) => id !== item.sceneId,
                ),
              )
            : { ...currentScenes }

        applyStudioMutation({
          nextQuestions,
          nextQuestionIds: nextQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: item.id,
          nextCurrentIndex: nextQuestions.length - 1,
        })

        return
      }

      // Case 4: Scene -> Another Scene
      if (
        item.kind !== "question" &&
        toKind !== "quiz" &&
        toKind !== "survey"
      ) {
        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(toKind, sceneId)

        if ("sceneId" in item && currentScenes[item.sceneId]?.title) {
          newScene.title = currentScenes[item.sceneId].title
        }

        const filteredScenes =
          "sceneId" in item
            ? Object.fromEntries(
                Object.entries(currentScenes).filter(
                  ([id]) => id !== item.sceneId,
                ),
              )
            : { ...currentScenes }
        const nextScenes = { ...filteredScenes, [sceneId]: newScene }

        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? { id: item.id, kind: toKind as never, sceneId }
            : entry,
        )

        applyStudioMutation({
          nextQuestions: currentQuestions,
          nextQuestionIds: currentQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: item.id,
          nextCurrentIndex: currentIndex,
        })
      }
    },
    [
      timeline,
      getValues,
      questionIds,
      scenes,
      createDefaultScene,
      t,
      replaceQuestions,
      setValue,
      applyStudioMutation,
      currentIndex,
    ],
  )

  const changeSelectedCardKind = useCallback(
    (newKind: TimelineItemKind) => {
      if (!selectedTimelineItem || selectedKind === newKind) {
        return
      }

      // If converting a question to a scene, check if blank or populated
      if (
        selectedTimelineItem.kind === "question" &&
        newKind !== "quiz" &&
        newKind !== "survey"
      ) {
        const questionCount = timeline.filter(
          (entry) => entry.kind === "question",
        ).length
        if (questionCount <= 1) {
          toast.error(t("extensions:timeline.cannotDeleteLastQuestion"))
          return
        }

        const currentQuestions = getValues("questions")
        const qIndex = questionIds.findIndex(
          (id) => id === selectedTimelineItem.questionId,
        )
        const currentQ = qIndex >= 0 ? currentQuestions[qIndex] : undefined
        const perQ = extras?.perQuestion?.[selectedTimelineItem.questionId]

        if (isQuestionCardBlankForConversion(currentQ, perQ)) {
          executeConversion(selectedTimelineItem, newKind)
          return
        }

        setPendingConversion({ from: selectedTimelineItem, toKind: newKind })

        return
      }

      executeConversion(selectedTimelineItem, newKind)
    },
    [
      selectedTimelineItem,
      selectedKind,
      timeline,
      t,
      getValues,
      questionIds,
      extras,
      executeConversion,
    ],
  )

  const confirmPendingConversion = useCallback(() => {
    if (!pendingConversion) {return}

    executeConversion(pendingConversion.from, pendingConversion.toKind)
    setPendingConversion(null)
  }, [pendingConversion, executeConversion])

  const cancelPendingConversion = useCallback(() => {
    setPendingConversion(null)
  }, [])

  // Add card
  const addTimelineCard = useCallback(
    (kind?: TimelineItemKind) => {
      const targetKind = kind ?? defaults.newQuestionMode
      const currentQuestions = getValues("questions")
      const currentQIds = [...questionIds]
      const currentTimeline = [...timeline]
      const currentScenes = { ...scenes }

      if (targetKind === "quiz" || targetKind === "survey") {
        const newQId = crypto.randomUUID()
        const newQuestion: Question = {
          type: "single",
          playMode: targetKind,
          question: "",
          answers: ["", ""],
          solutions: targetKind === "quiz" ? [0] : [],
          cooldown: 5,
          time: 20,
        }

        const nextQuestions = [...currentQuestions, newQuestion]
        const nextQIds = [...currentQIds, newQId]
        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: "question",
          questionId: newQId,
        }
        const nextTimeline = [...currentTimeline, newItem]

        applyStudioMutation({
          nextQuestions,
          nextQuestionIds: nextQIds,
          nextTimeline,
          nextScenes: currentScenes,
          nextSelectedId: newItem.id,
          nextCurrentIndex: nextQuestions.length - 1,
        })
      } else {
        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(targetKind, sceneId)
        const nextScenes = { ...currentScenes, [sceneId]: newScene }
        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: targetKind as never,
          sceneId,
        }
        const nextTimeline = [...currentTimeline, newItem]

        applyStudioMutation({
          nextQuestions: currentQuestions,
          nextQuestionIds: currentQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: newItem.id,
          nextCurrentIndex: currentIndex,
        })
      }
    },
    [
      defaults,
      getValues,
      questionIds,
      timeline,
      scenes,
      createDefaultScene,
      applyStudioMutation,
      currentIndex,
    ],
  )

  // Remove card
  const removeTimelineCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= timeline.length) {
        return
      }

      const item = timeline[index]
      const currentQuestions = getValues("questions")
      const currentQIds = [...questionIds]
      const currentTimeline = [...timeline]
      const currentScenes = { ...scenes }
      const nextPerQuestion = extras?.perQuestion ? { ...extras.perQuestion } : undefined

      let nextQuestions = currentQuestions
      let nextQIds = currentQIds
      let nextScenes = currentScenes

      if (item.kind === "question") {
        const questionCount = currentTimeline.filter(
          (entry) => entry.kind === "question",
        ).length

        if (questionCount <= 1) {
          toast.error(t("extensions:timeline.cannotDeleteLastQuestion"))

          return
        }

        const qIndex = currentQIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0) {
          nextQuestions = currentQuestions.filter((_, idx) => idx !== qIndex)
          nextQIds = currentQIds.filter((_, idx) => idx !== qIndex)
          if (nextPerQuestion && item.questionId in nextPerQuestion) {
            delete nextPerQuestion[item.questionId]
          }
        }
      } else if ("sceneId" in item) {
        nextScenes = Object.fromEntries(
          Object.entries(currentScenes).filter(([id]) => id !== item.sceneId),
        )
      }

      const nextTimeline = currentTimeline.filter((_, idx) => idx !== index)
      const nextSelectedIdx = Math.min(index, nextTimeline.length - 1)
      const nextSelected = nextTimeline[nextSelectedIdx]
      const nextSelectedId = nextSelected.id

      let nextCurrentIndex = 0

      if (nextSelected.kind === "question") {
        const targetQIdx = nextQIds.findIndex(
          (id) => id === nextSelected.questionId,
        )

        nextCurrentIndex = targetQIdx >= 0 ? targetQIdx : 0
      } else {
        nextCurrentIndex = Math.max(
          0,
          Math.min(currentIndex, nextQuestions.length - 1),
        )
      }

      applyStudioMutation({
        nextQuestions,
        nextQuestionIds: nextQIds,
        nextTimeline,
        nextScenes,
        nextSelectedId,
        nextCurrentIndex,
        nextPerQuestion,
      })
    },
    [
      timeline,
      getValues,
      questionIds,
      scenes,
      extras,
      t,
      currentIndex,
      applyStudioMutation,
    ],
  )

  // Duplicate card
  const duplicateTimelineCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= timeline.length) {
        return
      }

      const item = timeline[index]
      const currentQuestions = getValues("questions")
      const currentQIds = [...questionIds]
      const currentTimeline = [...timeline]
      const currentScenes = { ...scenes }
      const nextPerQuestion = extras?.perQuestion ? { ...extras.perQuestion } : undefined

      if (item.kind === "question") {
        const qIndex = currentQIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0 && qIndex < currentQuestions.length) {
          const sourceQ = currentQuestions[qIndex]
          const newQId = crypto.randomUUID()
          const dupQ: Question = {
            ...sourceQ,
            question: `${sourceQ.question || "Question"} (Copy)`,
          }
          const nextQuestions = [
            ...currentQuestions.slice(0, qIndex + 1),
            dupQ,
            ...currentQuestions.slice(qIndex + 1),
          ]
          const nextQIds = [
            ...currentQIds.slice(0, qIndex + 1),
            newQId,
            ...currentQIds.slice(qIndex + 1),
          ]
          const newItem: TimelineItem = {
            id: crypto.randomUUID(),
            kind: "question",
            questionId: newQId,
          }
          const nextTimeline = [
            ...currentTimeline.slice(0, index + 1),
            newItem,
            ...currentTimeline.slice(index + 1),
          ]

          if (nextPerQuestion && item.questionId in nextPerQuestion) {
            nextPerQuestion[newQId] = structuredClone(nextPerQuestion[item.questionId])
          }

          applyStudioMutation({
            nextQuestions,
            nextQuestionIds: nextQIds,
            nextTimeline,
            nextScenes: currentScenes,
            nextSelectedId: newItem.id,
            nextCurrentIndex: qIndex + 1,
            nextPerQuestion,
          })
        }
      } else if ("sceneId" in item) {
        const sourceScene = currentScenes[item.sceneId] as
          | SceneConfig
          | undefined
        const newSceneId = crypto.randomUUID()
        const sourceTitle =
          sourceScene && "title" in sourceScene ? sourceScene.title : undefined
        const newScene: SceneConfig = {
          ...sourceScene,
          id: newSceneId,
          ...(sourceTitle ? { title: `${sourceTitle} (Copy)` } : {}),
        } as SceneConfig

        const nextScenes = { ...currentScenes, [newSceneId]: newScene }
        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: item.kind,
          sceneId: newSceneId,
        }
        const nextTimeline = [
          ...currentTimeline.slice(0, index + 1),
          newItem,
          ...currentTimeline.slice(index + 1),
        ]

        applyStudioMutation({
          nextQuestions: currentQuestions,
          nextQuestionIds: currentQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: newItem.id,
          nextCurrentIndex: currentIndex,
        })
      }
    },
    [
      timeline,
      getValues,
      questionIds,
      scenes,
      extras,
      currentIndex,
      applyStudioMutation,
    ],
  )

  // Reorder cards
  const reorderTimelineCards = useCallback(
    (from: number, to: number) => {
      if (
        from === to ||
        from < 0 ||
        to < 0 ||
        from >= timeline.length ||
        to >= timeline.length
      ) {
        return
      }

      const currentQuestions = getValues("questions")
      const currentQIds = [...questionIds]
      const nextTimeline = [...timeline]
      const [moved] = nextTimeline.splice(from, 1)

      nextTimeline.splice(to, 0, moved)

      const timelineQuestionIds = nextTimeline
        .filter(
          (
            entry,
          ): entry is { id: string; kind: "question"; questionId: string } =>
            entry.kind === "question",
        )
        .map((entry) => entry.questionId)

      const reorderedQuestions: Question[] = []
      const reorderedQIds: string[] = []

      for (const qId of timelineQuestionIds) {
        const origIdx = currentQIds.findIndex((id) => id === qId)

        if (origIdx >= 0 && currentQuestions[origIdx]) {
          reorderedQuestions.push(currentQuestions[origIdx])
          reorderedQIds.push(currentQIds[origIdx])
        }
      }

      let nextCurrentIndex = currentIndex

      if (moved.kind === "question") {
        const newQIdx = reorderedQIds.findIndex((id) => id === moved.questionId)

        if (newQIdx >= 0) {
          nextCurrentIndex = newQIdx
        }
      }

      applyStudioMutation({
        nextQuestions:
          reorderedQuestions.length === currentQuestions.length
            ? reorderedQuestions
            : currentQuestions,
        nextQuestionIds:
          reorderedQIds.length === currentQIds.length
            ? reorderedQIds
            : currentQIds,
        nextTimeline,
        nextScenes: scenes,
        nextSelectedId: moved.id,
        nextCurrentIndex,
      })
    },
    [timeline, getValues, questionIds, currentIndex, applyStudioMutation, scenes],
  )

  const updateSceneConfig = useCallback(
    (sceneId: string, updates: Partial<SceneConfig>) => {
      setScenes((prev) => {
        const existing = prev[sceneId] as SceneConfig | undefined

        if (!existing) {
          return prev
        }

        const updated = { ...existing, ...updates } as SceneConfig
        const nextScenes = { ...prev, [sceneId]: updated }

        syncToExtras(timeline, nextScenes, { defaults })

        return nextScenes
      })
    },
    [timeline, defaults, syncToExtras],
  )

  const updateDefaults = useCallback(
    (updates: Partial<StudioDefaults>) => {
      setDefaults((prev) => {
        const next = { ...prev, ...updates }

        syncToExtras(timeline, scenes, { defaults: next })

        return next
      })
    },
    [timeline, scenes, syncToExtras],
  )

  const bulkApplyQuestionMode = useCallback(
    (mode: "quiz" | "survey") => {
      const currentQuestions = getValues("questions")
      const updated = currentQuestions.map((q) => ({
        ...q,
        playMode: mode,
      }))
      setValue("questions", updated, { shouldDirty: true })
      toast.success(t("extensions:studio.settings.bulkSuccess"))
    },
    [getValues, setValue, t],
  )

  const value = useMemo<StudioEditorContextType>(
    () => ({
      activeTab,
      setActiveTab,
      timeline,
      selectedTimelineId,
      selectedTimelineItem,
      selectedTimelineIndex,
      selectedKind,
      scenes,
      defaults,
      selectTimelineItem,
      changeSelectedCardKind,
      addTimelineCard,
      removeTimelineCard,
      duplicateTimelineCard,
      reorderTimelineCards,
      updateSceneConfig,
      updateDefaults,
      bulkApplyQuestionMode,
      pendingConversion,
      confirmPendingConversion,
      cancelPendingConversion,
    }),
    [
      activeTab,
      timeline,
      selectedTimelineId,
      selectedTimelineItem,
      selectedTimelineIndex,
      selectedKind,
      scenes,
      defaults,
      selectTimelineItem,
      changeSelectedCardKind,
      addTimelineCard,
      removeTimelineCard,
      duplicateTimelineCard,
      reorderTimelineCards,
      updateSceneConfig,
      updateDefaults,
      bulkApplyQuestionMode,
      pendingConversion,
      confirmPendingConversion,
      cancelPendingConversion,
    ],
  )

  return (
    <StudioEditorContext.Provider value={value}>
      {children}
    </StudioEditorContext.Provider>
  )
}
