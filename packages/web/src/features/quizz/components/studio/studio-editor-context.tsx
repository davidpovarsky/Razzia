import { QUIZZ_MODES } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import {
  createDefaultRosterExtras,
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

      if (extras.timeline.length > 0 && !selectedTimelineId) {
        setSelectedTimelineId(extras.timeline[0].id)
      }
    } else {
      // Migrate V1 or initial state to V2
      const baseQuiz = { questions: getValues("questions") }
      const upgraded = upgradeLegacyExtrasToV2(
        baseQuiz,
        extras && !isQuizExtrasV2(extras) ? extras : null,
        {
          quizId: quizzId ?? "temp-quiz",
          baseDigest: extras?.baseDigest ?? "0".repeat(64),
        },
      )
      setTimeline(upgraded.timeline)
      setScenes(upgraded.scenes)
      setDefaults(upgraded.defaults)

      if (upgraded.timeline.length > 0 && !selectedTimelineId) {
        setSelectedTimelineId(upgraded.timeline[0].id)
      }

      setExtras(upgraded)
    }
  }, [extras, quizzId, getValues, selectedTimelineId, setExtras])

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
      const qIndex = questionIds.findIndex(
        (id) => id === selectedTimelineItem.questionId,
      )

      if (qIndex >= 0 && qIndex !== currentIndex) {
        setCurrentIndex(qIndex)
      }
    }
  }, [selectedTimelineItem, questionIds, currentIndex, setCurrentIndex])

  // Determine effective kind of currently selected card
  const selectedKind: TimelineItemKind = useMemo(() => {
    if (!selectedTimelineItem) {return "quiz"}

    if (selectedTimelineItem.kind === "question") {
      const qIndex = questionIds.findIndex(
        (id) => id === selectedTimelineItem.questionId,
      )
      const q = questions[qIndex]

      if (q.playMode === "survey" || (!q.playMode && gameMode === QUIZZ_MODES.SURVEY)) {
        return "survey"
      }

      return "quiz"
    }

    return selectedTimelineItem.kind
  }, [selectedTimelineItem, questionIds, questions, gameMode])

  // Persist timeline & scenes back to extras atomically
  const syncToExtras = useCallback(
    (newTimeline: TimelineItem[], newScenes: Record<string, SceneConfig>, newDefaults: StudioDefaults) => {
      setExtras((prev: AnyQuizExtras | null) => {
        if (!prev) {return null}

        const v2: QuizExtrasV2 = {
          schemaVersion: 2,
          revision: prev.revision,
          quizId: prev.quizId,
          baseDigest: prev.baseDigest,
          questionIds,
          timeline: newTimeline,
          scenes: newScenes,
          defaults: newDefaults,
          audio: prev.audio,
          teams: prev.teams,
          roster: prev.roster ?? createDefaultRosterExtras(),
          perQuestion: prev.perQuestion,
          leaderboard: prev.leaderboard,
        }

        return v2
      })
    },
    [questionIds, setExtras],
  )

  const selectTimelineItem = useCallback((id: string) => {
    setSelectedTimelineId(id)
  }, [])

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

  // Direct conversion executor
  const executeConversion = useCallback(
    (item: TimelineItem, toKind: TimelineItemKind) => {
      const itemIdx = timeline.findIndex((entry) => entry.id === item.id)

      if (itemIdx < 0) {return}

      // Case 1: Question -> Question (Quiz <-> Survey)
      if (item.kind === "question" && (toKind === "quiz" || toKind === "survey")) {
        const qIndex = questionIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0) {
          setValue(`questions.${qIndex}.playMode`, toKind, { shouldDirty: true })
        }

        return
      }

      // Case 2: Question -> Non-Question Scene
      if (item.kind === "question" && toKind !== "quiz" && toKind !== "survey") {
        // Enforce invariant: show must have at least one question
        const questionCount = timeline.filter((entry) => entry.kind === "question").length

        if (questionCount <= 1) {
          toast.error(t("extensions:timeline.cannotDeleteLastQuestion"))

          return
        }

        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(toKind, sceneId)
        const updatedScenes = { ...scenes, [sceneId]: newScene }

        const updatedTimeline = timeline.map((entry) =>
          entry.id === item.id ? { id: item.id, kind: toKind as never, sceneId } : entry,
        )

        // Remove the question from form and questionIds
        const qIndex = questionIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0) {
          const currentQuestions = getValues("questions")
          const nextQuestions = currentQuestions.filter((_, idx) => idx !== qIndex)
          const nextQIds = questionIds.filter((_, idx) => idx !== qIndex)
          setValue("questions", nextQuestions, { shouldDirty: true })

          if (setQuestionIds) {setQuestionIds(nextQIds)}
        }

        setScenes(updatedScenes)
        setTimeline(updatedTimeline)
        syncToExtras(updatedTimeline, updatedScenes, defaults)

        return
      }

      // Case 3: Scene -> Question (Quiz or Survey)
      if (item.kind !== "question" && (toKind === "quiz" || toKind === "survey")) {
        const newQId = crypto.randomUUID()
        const newQuestion: Question = {
          type: "single",
          playMode: toKind,
          question: "",
          answers: ["", ""],
          solutions: toKind === "quiz" ? [0] : [],
          cooldown: 5,
          time: 20,
        }

        const currentQuestions = getValues("questions")
        const nextQuestions = [...currentQuestions, newQuestion]
        const nextQIds = [...questionIds, newQId]
        setValue("questions", nextQuestions, { shouldDirty: true })

        if (setQuestionIds) {setQuestionIds(nextQIds)}

        const updatedTimeline = timeline.map((entry) =>
          entry.id === item.id
            ? { id: item.id, kind: "question" as const, questionId: newQId }
            : entry,
        )

        // Clean up old scene config
        const updatedScenes = "sceneId" in item
          ? Object.fromEntries(Object.entries(scenes).filter(([id]) => id !== item.sceneId))
          : { ...scenes }

        setScenes(updatedScenes)
        setTimeline(updatedTimeline)
        syncToExtras(updatedTimeline, updatedScenes, defaults)

        return
      }

      // Case 4: Scene -> Another Scene
      if (item.kind !== "question" && toKind !== "quiz" && toKind !== "survey") {
        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(toKind, sceneId)
        const filteredScenes = "sceneId" in item
          ? Object.fromEntries(Object.entries(scenes).filter(([id]) => id !== item.sceneId))
          : { ...scenes }
        const updatedScenes = { ...filteredScenes, [sceneId]: newScene }

        const updatedTimeline = timeline.map((entry) =>
          entry.id === item.id ? { id: item.id, kind: toKind as never, sceneId } : entry,
        )

        setScenes(updatedScenes)
        setTimeline(updatedTimeline)
        syncToExtras(updatedTimeline, updatedScenes, defaults)
      }
    },
    [
      timeline,
      questionIds,
      scenes,
      defaults,
      createDefaultScene,
      getValues,
      setValue,
      setQuestionIds,
      syncToExtras,
      t,
    ],
  )

  const changeSelectedCardKind = useCallback(
    (newKind: TimelineItemKind) => {
      if (!selectedTimelineItem || selectedKind === newKind) {
        return
      }

      // If converting a question to a scene, prompt confirmation dialog
      if (
        selectedTimelineItem.kind === "question" &&
        newKind !== "quiz" &&
        newKind !== "survey"
      ) {
        setPendingConversion({ from: selectedTimelineItem, toKind: newKind })

        return
      }

      executeConversion(selectedTimelineItem, newKind)
    },
    [selectedTimelineItem, selectedKind, executeConversion],
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

        const currentQuestions = getValues("questions")
        const nextQuestions = [...currentQuestions, newQuestion]
        const nextQIds = [...questionIds, newQId]
        setValue("questions", nextQuestions, { shouldDirty: true })

        if (setQuestionIds) {setQuestionIds(nextQIds)}

        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: "question",
          questionId: newQId,
        }
        const updatedTimeline = [...timeline, newItem]
        setTimeline(updatedTimeline)
        setSelectedTimelineId(newItem.id)
        syncToExtras(updatedTimeline, scenes, defaults)
      } else {
        const sceneId = crypto.randomUUID()
        const newScene = createDefaultScene(targetKind, sceneId)
        const updatedScenes = { ...scenes, [sceneId]: newScene }
        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: targetKind as never,
          sceneId,
        }
        const updatedTimeline = [...timeline, newItem]
        setScenes(updatedScenes)
        setTimeline(updatedTimeline)
        setSelectedTimelineId(newItem.id)
        syncToExtras(updatedTimeline, updatedScenes, defaults)
      }
    },
    [defaults, questionIds, getValues, setValue, setQuestionIds, timeline, scenes, createDefaultScene, syncToExtras],
  )

  // Remove card
  const removeTimelineCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= timeline.length) {
        return
      }

      const item = timeline[index]

      if (item.kind === "question") {
        const questionCount = timeline.filter((entry) => entry.kind === "question").length

        if (questionCount <= 1) {
          toast.error(t("extensions:timeline.cannotDeleteLastQuestion"))

          return
        }

        const qIndex = questionIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0) {
          const currentQuestions = getValues("questions")
          const nextQuestions = currentQuestions.filter((_, idx) => idx !== qIndex)
          const nextQIds = questionIds.filter((_, idx) => idx !== qIndex)
          setValue("questions", nextQuestions, { shouldDirty: true })

          if (setQuestionIds) {setQuestionIds(nextQIds)}
        }
      } else if ("sceneId" in item) {
        const updatedScenes = Object.fromEntries(
          Object.entries(scenes).filter(([id]) => id !== item.sceneId),
        )
        setScenes(updatedScenes)
      }

      const updatedTimeline = timeline.filter((_, idx) => idx !== index)
      setTimeline(updatedTimeline)

      const nextSelected = updatedTimeline[Math.min(index, updatedTimeline.length - 1)]?.id ?? null
      setSelectedTimelineId(nextSelected)
      syncToExtras(updatedTimeline, scenes, defaults)
    },
    [timeline, questionIds, getValues, setValue, setQuestionIds, scenes, defaults, syncToExtras, t],
  )

  // Duplicate card
  const duplicateTimelineCard = useCallback(
    (index: number) => {
      if (index < 0 || index >= timeline.length) {
        return
      }

      const item = timeline[index]

      if (item.kind === "question") {
        const qIndex = questionIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0) {
          const sourceQ = getValues(`questions.${qIndex}`)
          const newQId = crypto.randomUUID()
          const dupQ: Question = {
            ...sourceQ,
            question: `${sourceQ.question || "Question"} (Copy)`,
          }
          const currentQuestions = getValues("questions")
          const nextQuestions = [
            ...currentQuestions.slice(0, qIndex + 1),
            dupQ,
            ...currentQuestions.slice(qIndex + 1),
          ]
          const nextQIds = [
            ...questionIds.slice(0, qIndex + 1),
            newQId,
            ...questionIds.slice(qIndex + 1),
          ]
          setValue("questions", nextQuestions, { shouldDirty: true })

          if (setQuestionIds) {setQuestionIds(nextQIds)}

          const newItem: TimelineItem = {
            id: crypto.randomUUID(),
            kind: "question",
            questionId: newQId,
          }
          const updatedTimeline = [
            ...timeline.slice(0, index + 1),
            newItem,
            ...timeline.slice(index + 1),
          ]
          setTimeline(updatedTimeline)
          setSelectedTimelineId(newItem.id)
          syncToExtras(updatedTimeline, scenes, defaults)
        }
      } else if ("sceneId" in item) {
        const sourceScene = scenes[item.sceneId] as SceneConfig | undefined
        const newSceneId = crypto.randomUUID()
        const sourceTitle = sourceScene && "title" in sourceScene ? sourceScene.title : undefined
        const newScene: SceneConfig = {
          ...sourceScene,
          id: newSceneId,
          ...(sourceTitle ? { title: `${sourceTitle} (Copy)` } : {}),
        } as SceneConfig

        const updatedScenes = { ...scenes, [newSceneId]: newScene }
        const newItem: TimelineItem = {
          id: crypto.randomUUID(),
          kind: item.kind,
          sceneId: newSceneId,
        }
        const updatedTimeline = [
          ...timeline.slice(0, index + 1),
          newItem,
          ...timeline.slice(index + 1),
        ]
        setScenes(updatedScenes)
        setTimeline(updatedTimeline)
        setSelectedTimelineId(newItem.id)
        syncToExtras(updatedTimeline, updatedScenes, defaults)
      }
    },
    [timeline, questionIds, getValues, setValue, setQuestionIds, scenes, defaults, syncToExtras],
  )

  // Reorder cards
  const reorderTimelineCards = useCallback(
    (from: number, to: number) => {
      if (from === to || from < 0 || to < 0 || from >= timeline.length || to >= timeline.length) {
        return
      }

      const itemToMove = timeline[from]
      const updatedTimeline = [...timeline]
      updatedTimeline.splice(from, 1)
      updatedTimeline.splice(to, 0, itemToMove)

      // Reorder base questions and questionIds to match the new relative order of question cards
      const newQuestionItemIds = updatedTimeline
        .filter((entry): entry is { id: string; kind: "question"; questionId: string } => entry.kind === "question")
        .map((entry) => entry.questionId)

      const currentQuestions = getValues("questions")
      const reorderedQuestions: Question[] = []
      for (const qId of newQuestionItemIds) {
        const oldIdx = questionIds.findIndex((id) => id === qId)

        if (oldIdx >= 0 && currentQuestions[oldIdx]) {
          reorderedQuestions.push(currentQuestions[oldIdx])
        }
      }

      if (reorderedQuestions.length === currentQuestions.length) {
        setValue("questions", reorderedQuestions, { shouldDirty: true })

        if (setQuestionIds) {setQuestionIds(newQuestionItemIds)}
      }

      setTimeline(updatedTimeline)
      syncToExtras(updatedTimeline, scenes, defaults)
    },
    [timeline, getValues, questionIds, setValue, setQuestionIds, syncToExtras, scenes, defaults],
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
        syncToExtras(timeline, nextScenes, defaults)

        return nextScenes
      })
    },
    [timeline, defaults, syncToExtras],
  )

  const updateDefaults = useCallback(
    (updates: Partial<StudioDefaults>) => {
      setDefaults((prev) => {
        const next = { ...prev, ...updates }
        syncToExtras(timeline, scenes, next)

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
