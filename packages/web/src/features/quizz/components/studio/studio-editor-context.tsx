// oxlint-disable typescript/no-unnecessary-condition -- Keep runtime guards for sparse legacy maps, optional browser APIs, and asynchronous snapshots; indexed types are optimistic without noUncheckedIndexedAccess.
import { QUESTION_LEAD_IN_SECONDS, QUIZZ_MODES } from "@razzia/common/constants"
import type { Question } from "@razzia/common/types/game"
import {
  computeCanonicalBaseDigest,
  createDefaultRosterExtras,
  createDefaultQuizExtrasV2,
  cloneApplicationCardScope,
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
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
import {
  createStudioHistory,
  isStudioSnapshot,
  moveStudioHistory,
  recordStudioEdit,
  studioContent,
  type StudioHistory,
  type StudioSnapshot,
} from "./studio-snapshot"
import { useStudioDraft, type StudioDraftState } from "./use-studio-draft"
import { useFormContext, useWatch } from "react-hook-form"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import {
  insertQuestionForScene,
  withQuestionPlayMode,
} from "./studio-question-mutations"

export type StudioTab = "questions" | "participants" | "settings" | "launch"

interface StudioEditorContextType extends StudioDraftState {
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  clearStudioHistory: () => void
  captureStudioSnapshot: () => StudioSnapshot | null
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
  pendingConversion: {
    from: TimelineItem
    toKind: TimelineItemKind
  } | null
  confirmPendingConversion: () => void
  cancelPendingConversion: () => void
}
const StudioEditorContext = createContext<StudioEditorContextType | null>(null)

export const useStudioEditor = () => {
  const ctx = useContext(StudioEditorContext)

  if (!ctx) {
    throw new Error(
      "useStudioEditor must be used within a StudioEditorProvider",
    )
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
    acceptExtrasBaseline,
    isExtrasDirty,
    extrasStatus,
    currentIndex,
    setCurrentIndex,
  } = useQuizzEditor()
  const {
    control,
    getValues,
    setValue,
    formState: { isDirty },
  } = useFormContext<QuizzFormValues>()
  const formValues = useWatch({ control })
  const [initialBaseDigest] = useState(() =>
    computeCanonicalBaseDigest(getValues()),
  )
  const [history, setHistory] = useState(createStudioHistory)
  const historyRef = useRef(history)
  const lastHistoryContent = useRef("")
  const updateHistory = useCallback((next: StudioHistory) => {
    historyRef.current = next
    setHistory(next)
  }, [])
  const clearStudioHistory = useCallback(() => {
    updateHistory(createStudioHistory())
    lastHistoryContent.current = ""
  }, [updateHistory])
  const questions = useWatch({
    control,
    name: "questions",
  })
  const gameMode = useWatch({
    control,
    name: "gameMode",
  })
  const [activeTab, setActiveTab] = useState<StudioTab>("questions")
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [scenes, setScenes] = useState<Record<string, SceneConfig>>({})
  const [defaults, setDefaults] = useState<StudioDefaults>({
    newQuestionMode: "quiz",
    leaderboardPolicy: "cardOnly",
    advanceMode: "auto",
  })
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(
    null,
  )
  const [pendingConversion, setPendingConversion] = useState<{
    from: TimelineItem
    toKind: TimelineItemKind
  } | null>(null)

  // Initialize or synchronize V2 timeline and scenes from extras
  /* oxlint-disable react/set-state-in-effect -- Synchronize external server/media/editor state without remounting this surface. */
  useEffect(() => {
    if (extras && isQuizExtrasV2(extras)) {
      setTimeline(extras.timeline)
      setScenes(extras.scenes)
      setDefaults(extras.defaults)

      if (extras.timeline.length > 0) {
        setSelectedTimelineId((prev) =>
          extras.timeline.some((item) => item.id === prev)
            ? prev
            : extras.timeline[0].id,
        )
      }
    } else if (extras && !isQuizExtrasV2(extras)) {
      // Migrate V1 to V2
      const baseQuiz = {
        questions: getValues("questions"),
      }
      const upgraded = upgradeLegacyExtrasToV2(baseQuiz, extras, {
        quizId: quizzId ?? "temp-quiz",
        baseDigest: extras.baseDigest,
      })
      setTimeline(upgraded.timeline)
      setScenes(upgraded.scenes)
      setDefaults(upgraded.defaults)

      if (upgraded.timeline.length > 0) {
        setSelectedTimelineId((prev) =>
          upgraded.timeline.some((item) => item.id === prev)
            ? prev
            : upgraded.timeline[0].id,
        )
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
        acceptExtrasBaseline(defaultV2)
      }
    }
  }, [
    extras,
    acceptExtrasBaseline,
    quizzId,
    getValues,
    setExtras,
    questionIds,
    setQuestionIds,
    timeline.length,
  ])

  // Derive selected timeline index & item
  /* oxlint-enable react/set-state-in-effect */
  const selectedTimelineIndex = useMemo(() => {
    if (!selectedTimelineId || timeline.length === 0) {
      return 0
    }

    const idx = timeline.findIndex((item) => item.id === selectedTimelineId)

    return idx >= 0 ? idx : 0
  }, [timeline, selectedTimelineId])
  const selectedTimelineItem: TimelineItem | undefined =
    timeline.length > 0 ? timeline[selectedTimelineIndex] : undefined

  // Map selected question item to questionIndex and sync with QuizzEditorContext
  useEffect(() => {
    if (!selectedTimelineItem) {
      return
    }

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
    if (!selectedTimelineItem) {
      return "quiz"
    }

    if (selectedTimelineItem.kind === "question") {
      const qIndex = questionIds.findIndex(
        (id) => id === selectedTimelineItem.questionId,
      )
      const q = qIndex >= 0 ? questions[qIndex] : undefined

      if (
        q?.playMode === "survey" ||
        (!q?.playMode && gameMode === QUIZZ_MODES.SURVEY)
      ) {
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
          ...(prev.mediaCatalog
            ? {
                mediaCatalog: prev.mediaCatalog,
              }
            : {}),
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
            mediaUrl: "",
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

        case "answerRecap":
          return {
            id: sceneId,
            kind: "answerRecap",
            title: "",
            ...(questionIds[0]
              ? {
                  startQuestionId: questionIds[0],
                }
              : {}),
            mode: "mostSelected",
            maxItemsPerPage: 4,
            showCounts: true,
            showPercentages: true,
            durationMs: 8000,
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
            title:
              getValues("subject") || t("extensions:studio.scene.welcomeTitle"),
            subtitle: "",
            durationMs: 5000,
            advance: "auto",
          }

        case "closing":
          return {
            id: sceneId,
            kind: "closing",
            title: t("extensions:tadazzShow.finaleNoWinner"),
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
    [getValues, questionIds, t],
  )
  interface StudioMutationResult {
    nextQuestions: Question[]
    nextQuestionIds: string[]
    nextTimeline: TimelineItem[]
    nextScenes: Record<string, SceneConfig>
    nextSelectedId: string
    nextCurrentIndex: number
    nextPerQuestion?: QuizExtrasV2["perQuestion"]
    nextDefaults?: StudioDefaults
  }
  const normalizeRecapSceneStartRefs = useCallback(
    (
      nextTimeline: TimelineItem[],
      nextScenes: Record<string, SceneConfig>,
      nextQuestionIds: string[],
    ): Record<string, SceneConfig> => {
      const validQIds = new Set(nextQuestionIds)
      const seenBefore: string[] = []
      let mutated = false
      const normalized = {
        ...nextScenes,
      }
      for (const item of nextTimeline) {
        if (item.kind === "question") {
          if (validQIds.has(item.questionId)) {
            seenBefore.push(item.questionId)
          }
        } else if (item.kind === "answerRecap") {
          const existing = normalized[item.sceneId]

          if (existing?.kind === "answerRecap") {
            const currentStart = existing.startQuestionId
            const isValidPreceding =
              currentStart !== undefined && seenBefore.includes(currentStart)

            if (!isValidPreceding) {
              const { 0: fallbackStart } = seenBefore
              normalized[item.sceneId] = {
                ...existing,
                startQuestionId: fallbackStart,
              }
              mutated = true
            }
          }
        }
      }

      return mutated ? normalized : nextScenes
    },
    [],
  )
  const captureStudioSnapshot = useCallback((): StudioSnapshot | null => {
    if (!extras || !isQuizExtrasV2(extras)) {
      return null
    }

    const snapshot: StudioSnapshot = {
      values: structuredClone(getValues()),
      questionIds: [...questionIds],
      extras: structuredClone({
        ...extras,
        questionIds,
        timeline,
        scenes,
        defaults,
      }),
      selectedTimelineId,
      currentIndex,
    }

    return isStudioSnapshot(snapshot) ? snapshot : null
  }, [
    extras,
    getValues,
    questionIds,
    timeline,
    scenes,
    defaults,
    selectedTimelineId,
    currentIndex,
  ])

  const restoreStudioSnapshot = useCallback(
    (snapshot: StudioSnapshot) => {
      const restored = structuredClone(snapshot)

      if (!isQuizExtrasV2(restored.extras)) {
        return
      }

      if (replaceQuestions) {
        replaceQuestions(restored.values.questions, restored.questionIds)
      } else {
        setValue("questions", restored.values.questions, { shouldDirty: true })
        setQuestionIds?.(restored.questionIds)
      }

      setValue("subject", restored.values.subject, { shouldDirty: true })
      setValue("gameMode", restored.values.gameMode, { shouldDirty: true })
      setExtras(restored.extras)
      setTimeline(restored.extras.timeline)
      setScenes(restored.extras.scenes)
      setDefaults(restored.extras.defaults)
      setSelectedTimelineId(restored.selectedTimelineId)
      setCurrentIndex(
        Math.max(
          0,
          Math.min(restored.currentIndex, restored.questionIds.length - 1),
        ),
      )
      setPendingConversion(null)
      lastHistoryContent.current = studioContent(restored)
    },
    [replaceQuestions, setQuestionIds, setValue, setExtras, setCurrentIndex],
  )

  const restoreDraftSnapshot = useCallback(
    (snapshot: StudioSnapshot) => {
      clearStudioHistory()
      restoreStudioSnapshot(snapshot)
    },
    [clearStudioHistory, restoreStudioSnapshot],
  )
  const draft = useStudioDraft({
    quizzId,
    snapshot: captureStudioSnapshot(),
    ready: extrasStatus === "ready",
    dirty: isDirty || isExtrasDirty,
    initialBaseDigest,
    restore: restoreDraftSnapshot,
  })

  const travelHistory = useCallback(
    (direction: "undo" | "redo") => {
      const current = captureStudioSnapshot()

      if (!current || extrasStatus !== "ready" || draft.pendingDraft) {
        return
      }

      const result = moveStudioHistory(historyRef.current, current, direction)

      if (!result) {
        return
      }

      updateHistory(result.history)
      restoreStudioSnapshot(result.snapshot)
    },
    [
      captureStudioSnapshot,
      extrasStatus,
      draft.pendingDraft,
      updateHistory,
      restoreStudioSnapshot,
    ],
  )
  const undo = useCallback(() => travelHistory("undo"), [travelHistory])
  const redo = useCallback(() => travelHistory("redo"), [travelHistory])

  /* oxlint-disable react/set-state-in-effect -- Clear local history at accepted server/document boundaries. */
  useEffect(() => {
    clearStudioHistory()
  }, [quizzId, extras?.revision, clearStudioHistory])
  useEffect(() => {
    const snapshot = captureStudioSnapshot()

    if (!snapshot) {
      return
    }

    const content = studioContent(snapshot)

    if (
      content !== lastHistoryContent.current &&
      historyRef.current.future.length
    ) {
      updateHistory({ ...historyRef.current, future: [] })
    }

    lastHistoryContent.current = content
  }, [formValues, captureStudioSnapshot, updateHistory])
  /* oxlint-enable react/set-state-in-effect */

  const applyStudioMutation = useCallback(
    (result: StudioMutationResult) => {
      const before = captureStudioSnapshot()
      const normalizedScenes = normalizeRecapSceneStartRefs(
        result.nextTimeline,
        result.nextScenes,
        result.nextQuestionIds,
      )

      if (replaceQuestions) {
        replaceQuestions(result.nextQuestions, result.nextQuestionIds)
      } else {
        setValue("questions", result.nextQuestions, {
          shouldDirty: true,
        })

        if (setQuestionIds) {
          setQuestionIds(result.nextQuestionIds)
        }
      }

      setTimeline(result.nextTimeline)
      setScenes(normalizedScenes)
      setSelectedTimelineId(result.nextSelectedId)

      if (result.nextDefaults) {
        setDefaults(result.nextDefaults)
      }

      if (result.nextCurrentIndex >= 0) {
        setCurrentIndex(result.nextCurrentIndex)
      }

      syncToExtras(result.nextTimeline, normalizedScenes, {
        defaults: result.nextDefaults ?? defaults,
        targetQuestionIds: result.nextQuestionIds,
        targetPerQuestion: result.nextPerQuestion,
      })

      if (before) {
        const after: StudioSnapshot = {
          ...before,
          values: { ...before.values, questions: result.nextQuestions },
          questionIds: result.nextQuestionIds,
          extras: {
            ...before.extras,
            questionIds: result.nextQuestionIds,
            timeline: result.nextTimeline,
            scenes: normalizedScenes,
            defaults: result.nextDefaults ?? defaults,
            perQuestion: result.nextPerQuestion ?? before.extras.perQuestion,
          } as QuizExtrasV2,
          selectedTimelineId: result.nextSelectedId,
          currentIndex: result.nextCurrentIndex,
        }
        lastHistoryContent.current = studioContent(after)
        updateHistory(recordStudioEdit(historyRef.current, before, after))
      }
    },
    [
      captureStudioSnapshot,
      updateHistory,
      normalizeRecapSceneStartRefs,
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
      const currentScenes = {
        ...scenes,
      }

      // Case 1: Question -> Question (Quiz <-> Survey)
      if (
        item.kind === "question" &&
        (toKind === "quiz" || toKind === "survey")
      ) {
        const qIndex = currentQIds.findIndex((id) => id === item.questionId)

        if (qIndex >= 0 && qIndex < currentQuestions.length) {
          const currentQ = currentQuestions[qIndex]
          const updatedQ = withQuestionPlayMode(currentQ, toKind)
          const nextQuestions = currentQuestions.map((q, idx) =>
            idx === qIndex ? updatedQ : q,
          )

          applyStudioMutation({
            nextQuestions,
            nextQuestionIds: currentQIds,
            nextTimeline: currentTimeline,
            nextScenes: currentScenes,
            nextSelectedId: item.id,
            nextCurrentIndex: qIndex,
          })
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
        const nextScenes = {
          ...currentScenes,
          [sceneId]: newScene,
        }
        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? {
                id: item.id,
                kind: toKind as never,
                sceneId,
              }
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
          ? {
              ...extras.perQuestion,
            }
          : undefined

        if (nextPerQuestion && item.questionId in nextPerQuestion) {
          /* oxlint-disable typescript/no-dynamic-delete -- Remove a keyed optional override from its mutable dictionary without replacing object identity. */
          delete nextPerQuestion[item.questionId]
          /* oxlint-enable typescript/no-dynamic-delete */
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
          cooldown: QUESTION_LEAD_IN_SECONDS,
          time: 20,
        }
        const {
          nextQuestions,
          nextQuestionIds: nextQIds,
          nextCurrentIndex,
        } = insertQuestionForScene({
          questions: currentQuestions,
          questionIds: currentQIds,
          timeline: currentTimeline,
          sceneIndex: itemIdx,
          question: newQuestion,
          questionId: newQId,
        })
        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? {
                id: item.id,
                kind: "question" as const,
                questionId: newQId,
              }
            : entry,
        )
        const nextScenes =
          "sceneId" in item
            ? Object.fromEntries(
                Object.entries(currentScenes).filter(
                  ([id]) => id !== item.sceneId,
                ),
              )
            : {
                ...currentScenes,
              }
        applyStudioMutation({
          nextQuestions,
          nextQuestionIds: nextQIds,
          nextTimeline,
          nextScenes,
          nextSelectedId: item.id,
          nextCurrentIndex,
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
            : {
                ...currentScenes,
              }
        const nextScenes = {
          ...filteredScenes,
          [sceneId]: newScene,
        }
        const nextTimeline = currentTimeline.map((entry) =>
          entry.id === item.id
            ? {
                id: item.id,
                kind: toKind as never,
                sceneId,
              }
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
      applyStudioMutation,
      currentIndex,
      extras,
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

        setPendingConversion({
          from: selectedTimelineItem,
          toKind: newKind,
        })

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
    if (!pendingConversion) {
      return
    }

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
      const currentScenes = {
        ...scenes,
      }

      if (targetKind === "quiz" || targetKind === "survey") {
        const newQId = crypto.randomUUID()
        const newQuestion: Question = {
          type: "single",
          playMode: targetKind,
          ...(currentQuestions.at(-1)?.category
            ? {
                category: currentQuestions.at(-1)?.category,
              }
            : {}),
          question: "",
          answers: ["", ""],
          solutions: targetKind === "quiz" ? [0] : [],
          cooldown: QUESTION_LEAD_IN_SECONDS,
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
        const nextScenes = {
          ...currentScenes,
          [sceneId]: newScene,
        }
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
      const currentScenes = {
        ...scenes,
      }
      const nextPerQuestion = extras?.perQuestion
        ? {
            ...extras.perQuestion,
          }
        : undefined
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
            /* oxlint-disable typescript/no-dynamic-delete -- Remove a keyed optional override from its mutable dictionary without replacing object identity. */
            delete nextPerQuestion[item.questionId]
            /* oxlint-enable typescript/no-dynamic-delete */
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
      const currentScenes = {
        ...scenes,
      }
      const nextPerQuestion = extras?.perQuestion
        ? {
            ...extras.perQuestion,
          }
        : undefined

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
            nextPerQuestion[newQId] = structuredClone(
              nextPerQuestion[item.questionId],
            )
          }

          applyStudioMutation({
            nextQuestions,
            nextQuestionIds: nextQIds,
            nextTimeline,
            nextScenes: currentScenes,
            nextSelectedId: newItem.id,
            nextCurrentIndex: qIndex + 1,
            nextPerQuestion,
            nextDefaults: cloneApplicationCardScope(
              defaults,
              item.questionId,
              newQId,
            ),
          })
        }
      } else if ("sceneId" in item) {
        const sourceScene = currentScenes[item.sceneId] as
          SceneConfig | undefined
        const newSceneId = crypto.randomUUID()
        const sourceTitle =
          sourceScene && "title" in sourceScene ? sourceScene.title : undefined
        const clonedSource = sourceScene
          ? structuredClone(sourceScene)
          : undefined
        const clonedOverlays =
          clonedSource &&
          "overlayAnimations" in clonedSource &&
          Array.isArray(clonedSource.overlayAnimations)
            ? clonedSource.overlayAnimations.map((ov, idx) => ({
                ...ov,
                id: crypto.randomUUID(),
                order: idx,
              }))
            : undefined
        const newScene: SceneConfig = {
          ...clonedSource,
          id: newSceneId,
          ...(sourceTitle
            ? {
                title: `${sourceTitle} (Copy)`,
              }
            : {}),
          ...(clonedOverlays
            ? {
                overlayAnimations: clonedOverlays,
              }
            : {}),
        } as SceneConfig
        const nextScenes = {
          ...currentScenes,
          [newSceneId]: newScene,
        }
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
          nextDefaults: cloneApplicationCardScope(
            defaults,
            item.sceneId,
            newSceneId,
          ),
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
      defaults,
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
          ): entry is {
            id: string
            kind: "question"
            questionId: string
          } => entry.kind === "question",
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
    [
      timeline,
      getValues,
      questionIds,
      currentIndex,
      applyStudioMutation,
      scenes,
    ],
  )
  const updateSceneConfig = useCallback(
    (sceneId: string, updates: Partial<SceneConfig>) => {
      setScenes((prev) => {
        const existing = prev[sceneId] as SceneConfig | undefined

        if (!existing) {
          return prev
        }

        const updated = {
          ...existing,
          ...updates,
        } as SceneConfig
        const nextScenes = {
          ...prev,
          [sceneId]: updated,
        }
        syncToExtras(timeline, nextScenes, {
          defaults,
        })

        return nextScenes
      })
    },
    [timeline, defaults, syncToExtras],
  )
  const updateDefaults = useCallback(
    (updates: Partial<StudioDefaults>) => {
      setDefaults((prev) => {
        const next = {
          ...prev,
          ...updates,
        }
        syncToExtras(timeline, scenes, {
          defaults: next,
        })

        return next
      })
    },
    [timeline, scenes, syncToExtras],
  )
  const bulkApplyQuestionMode = useCallback(
    (mode: "quiz" | "survey") => {
      const currentQuestions = getValues("questions")
      const updated = currentQuestions.map((q) => withQuestionPlayMode(q, mode))
      applyStudioMutation({
        nextQuestions: updated,
        nextQuestionIds: questionIds,
        nextTimeline: timeline,
        nextScenes: scenes,
        nextSelectedId: selectedTimelineId ?? timeline[0]?.id ?? "",
        nextCurrentIndex: currentIndex,
      })
      toast.success(t("extensions:studio.settings.bulkSuccess"))
    },
    [
      getValues,
      applyStudioMutation,
      questionIds,
      timeline,
      scenes,
      selectedTimelineId,
      currentIndex,
      t,
    ],
  )
  const value = useMemo<StudioEditorContextType>(
    () => ({
      ...draft,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      undo,
      redo,
      clearStudioHistory,
      captureStudioSnapshot,
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
      draft,
      history,
      undo,
      redo,
      clearStudioHistory,
      captureStudioSnapshot,
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
