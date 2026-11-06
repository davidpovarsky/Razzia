import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { FINALE, INTRO, confettiBit } from "./motion-spec"
import { MotionEngine } from "./motion-engine"
import { DEFAULT_TADAZZ_STAGE_LABELS, type TadazzStageLabels } from "./labels"
import {
  TADAZZ_LOGO_URL,
  type StageLeaderEntry,
  type StageMode,
  type StageOption,
  type StageQuestion,
  type StageRevealInput,
  type StageRevealResult,
  type StageWinner,
  type TadazzStageHandle,
  type TadazzStageProps,
} from "./TadazzStage"
import {
  TADAZZ_V4_LABELS,
  TadazzV4Stage,
  percentagesFor,
  topIndicesFor,
  type TadazzV4Answer,
  type TadazzV4Cue,
  type TadazzV4Data,
  type TadazzV4Labels,
  type TadazzV4StageHandle,
} from "../tadazz-v4"
import "./tadazz-motion-kit.css"
import "./tadazz-show-adaptations.css"

export interface TadazzV4StageAdapterProps extends TadazzStageProps {
  v4Labels?: Partial<TadazzV4Labels>
  onCue?: (cue: TadazzV4Cue) => void
}

function toV4Answers(options: StageOption[]): TadazzV4Answer[] {
  return options.map((opt) => ({
    title: opt.label,
    imageUrl: opt.image,
    alt: opt.alt || opt.label,
  }))
}

function isPhotoQuestion(q: StageQuestion): boolean {
  return Boolean(
    q.questionImage &&
    q.options.length === 4 &&
    q.options.every((opt) => !opt.image),
  )
}

/**
 * Authoritative adapter bridging `show-director` / `TadazzShowView` (`TadazzStageHandle`)
 * to `TadazzV4Stage` (all 13 native v4 React + WAAPI scenes), while preserving custom
 * screens (`lobby`, `wait`, `start`, `prepared`, `player-result`, `estimation`, `summary`,
 * `intro`, `finale`), `CinematicLayerStack`, `TadazzOpening`, and interactive player voting.
 */
export const TadazzV4StageAdapter = forwardRef<
  TadazzStageHandle,
  TadazzV4StageAdapterProps
>(function TadazzV4StageAdapter(
  {
    labels: stageLabelOverrides,
    v4Labels: v4LabelOverrides,
    backdropUrl,
    backdropFit = "cover",
    interactive = false,
    multiSelect = false,
    onSelectOption,
    customScreen,
    underlay,
    overlay,
    reducedMotion = false,
    className,
    onModeChange,
    onCue,
  },
  ref,
) {
  const stageLabels = useMemo<TadazzStageLabels>(
    () => ({ ...DEFAULT_TADAZZ_STAGE_LABELS, ...stageLabelOverrides }),
    [stageLabelOverrides],
  )
  const v4Labels = useMemo<TadazzV4Labels>(
    () => ({
      ...TADAZZ_V4_LABELS,
      votingOpen: stageLabels.votingOpen,
      audienceResults: stageLabels.audienceResults,
      audienceFavourite: stageLabels.audienceFavourite,
      jointAudienceFavourite: stageLabels.jointAudienceFavourite,
      correctAnswer: stageLabels.correctAnswer,
      ...v4LabelOverrides,
    }),
    [stageLabels, v4LabelOverrides],
  )
  const v4LabelsRef = useRef(v4Labels)
  v4LabelsRef.current = v4Labels

  const v4Ref = useRef<TadazzV4StageHandle>(null)
  const modeRef = useRef<StageMode>(customScreen ? "custom" : "idle")
  const questionRef = useRef<StageQuestion | null>(null)
  const cardsOnStageKeyRef = useRef<string | null>(null)
  const selectedRef = useRef<number[]>([])
  const reducedMotionRef = useRef(reducedMotion)
  reducedMotionRef.current = reducedMotion
  const showPercentagesRef = useRef(true)
  const lastRevealInputRef = useRef<StageRevealInput | null>(null)

  const [screenMode, setScreenMode] = useState<
    "none" | "custom" | "intro" | "win"
  >(() => (customScreen ? "custom" : "none"))
  const [winner, setWinner] = useState<StageWinner | null>(null)
  const [confettiKey, setConfettiKey] = useState(0)

  const introLogoRef = useRef<HTMLImageElement>(null)
  const shockRef = useRef<HTMLDivElement>(null)
  const winLogoRef = useRef<HTMLImageElement>(null)
  const winHeadlineRef = useRef<HTMLDivElement>(null)
  const winNameRef = useRef<HTMLDivElement>(null)
  const winScoreRef = useRef<HTMLDivElement>(null)
  const confettiRefs = useRef<Array<HTMLSpanElement | null>>([])

  const auxEngineRef = useRef<MotionEngine | null>(null)
  if (!auxEngineRef.current) auxEngineRef.current = new MotionEngine()
  const auxEngine = auxEngineRef.current

  useEffect(() => {
    auxEngine.reducedMotion = reducedMotion
  }, [auxEngine, reducedMotion])

  useEffect(
    () => () => {
      auxEngine.dispose()
    },
    [auxEngine],
  )

  const onModeChangeRef = useRef(onModeChange)
  onModeChangeRef.current = onModeChange
  const setMode = useCallback((m: StageMode) => {
    modeRef.current = m
    onModeChangeRef.current?.(m)
  }, [])

  const interactivePropsRef = useRef({
    interactive,
    multiSelect,
    onSelectOption,
    backdropUrl,
    backdropFit,
  })
  interactivePropsRef.current = {
    interactive,
    multiSelect,
    onSelectOption,
    backdropUrl,
    backdropFit,
  }

  useEffect(() => {
    v4Ref.current?.patchData({
      interactive,
      multiSelect,
      onSelectOption,
      backgroundUrl: backdropUrl,
      backgroundFit: backdropFit,
      labels: v4Labels,
    })
  }, [
    interactive,
    multiSelect,
    onSelectOption,
    backdropUrl,
    backdropFit,
    v4Labels,
  ])

  const buildQuestionData = useCallback(
    (q: StageQuestion, over: Partial<TadazzV4Data> = {}): TadazzV4Data => {
      const p = interactivePropsRef.current
      return {
        questionKey: q.key,
        question: q.question,
        note: q.note,
        number: q.number,
        round: q.round ?? (q.totalQuestions === 10 && q.number ? Math.floor((q.number - 1) / 5) + 1 : 1),
        totalQuestions: q.totalQuestions,
        answers: toV4Answers(q.options),
        questionImage: q.questionImage,
        questionImageText: q.question,
        questionOptions: q.options.map((o) => o.label),
        photoAlt: q.photoAlt ?? q.question,
        interactive: p.interactive,
        multiSelect: p.multiSelect,
        onSelectOption: p.onSelectOption,
        selectedIndices: selectedRef.current,
        selectedIndex: selectedRef.current[0] ?? null,
        backgroundUrl: p.backdropUrl,
        backgroundFit: p.backdropFit,
        labels: v4LabelsRef.current,
        showPercentages: showPercentagesRef.current,
        ...over,
      }
    },
    [],
  )

  const api = useMemo<TadazzStageHandle>(() => {
    return {
      get mode() {
        return modeRef.current
      },
      get questionKey() {
        return questionRef.current?.key ?? null
      },

      async showIntro() {
        auxEngine.reset()
        v4Ref.current?.clear()
        cardsOnStageKeyRef.current = null
        setMode("intro")
        setScreenMode("intro")
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        const logo = introLogoRef.current
        if (logo) {
          logo.style.opacity = INTRO.logoInitial.opacity
          logo.style.transform = INTRO.logoInitial.transform
        }
        await Promise.all([
          auxEngine.animate(logo, INTRO.logo, {
            duration: INTRO.logoDuration,
            easing: "cubic-bezier(.17,1.13,.3,1)",
          }),
          auxEngine.animate(shockRef.current, INTRO.shock, {
            duration: INTRO.shockDuration,
            delay: INTRO.shockDelay,
            easing: INTRO.shockEasing,
          }),
        ])
      },

      async showQuestion(data) {
        auxEngine.reset()
        questionRef.current = data
        selectedRef.current = []
        lastRevealInputRef.current = null
        setScreenMode("none")
        setMode("question")
        const hasOptions = data.options.length > 0
        if (hasOptions) {
          cardsOnStageKeyRef.current = data.key
          const scene = isPhotoQuestion(data)
            ? "question-image"
            : "picture-answers"
          await v4Ref.current?.play(scene, buildQuestionData(data))
        } else {
          cardsOnStageKeyRef.current = null
          await v4Ref.current?.play("question", buildQuestionData(data))
        }
      },

      async presentOptions(data) {
        const current = questionRef.current
        questionRef.current = data
        setScreenMode("none")
        if (modeRef.current !== "voting") setMode("question")
        if (
          current &&
          current.key === data.key &&
          cardsOnStageKeyRef.current === data.key &&
          current.options.length === data.options.length &&
          current.options.every(
            (o, i) =>
              o.label === data.options[i]?.label &&
              o.image === data.options[i]?.image,
          )
        ) {
          v4Ref.current?.patchData(buildQuestionData(data))
          return
        }
        cardsOnStageKeyRef.current = data.key
        const scene = isPhotoQuestion(data)
          ? "question-image"
          : "picture-answers"
        await v4Ref.current?.play(scene, buildQuestionData(data))
      },

      async openVoting(seconds, deadlineMs) {
        const q = questionRef.current
        if (!q || modeRef.current === "results") return
        setScreenMode("none")
        setMode("voting")
        const alreadyOnStage = cardsOnStageKeyRef.current === q.key
        cardsOnStageKeyRef.current = q.key
        const remaining =
          deadlineMs !== undefined
            ? Math.max(0, (deadlineMs - Date.now()) / 1000)
            : seconds
        const timed =
          seconds !== null && seconds > 0 && remaining !== null && remaining > 0
        if (isPhotoQuestion(q)) {
          if (alreadyOnStage) {
            v4Ref.current?.patchData(
              buildQuestionData(q, {
                seconds,
                remainingSeconds: remaining,
                deadlineMs,
              }),
            )
          } else {
            await v4Ref.current?.play(
              "question-image",
              buildQuestionData(q, {
                seconds,
                remainingSeconds: remaining,
                deadlineMs,
              }),
            )
          }
          return
        }
        const scene = timed ? "countdown" : "voting-open"
        await v4Ref.current?.play(
          scene,
          buildQuestionData(q, {
            seconds,
            remainingSeconds: remaining,
            deadlineMs,
            cardsAlreadyOnStage: alreadyOnStage,
          }),
        )
      },

      async lockVoting() {
        const q = questionRef.current
        if (!q || modeRef.current === "locked") return
        if (modeRef.current !== "voting" && modeRef.current !== "question")
          return
        setScreenMode("none")
        setMode("locked")
        const alreadyOnStage = cardsOnStageKeyRef.current === q.key
        cardsOnStageKeyRef.current = q.key
        await v4Ref.current?.play(
          "vote-locked",
          buildQuestionData(q, {
            interactive: false,
            cardsAlreadyOnStage: alreadyOnStage,
          }),
        )
      },

      async showChosen(selectedIndices) {
        const q = questionRef.current
        if (!q) return
        selectedRef.current = selectedIndices
        const alreadyOnStage = cardsOnStageKeyRef.current === q.key
        cardsOnStageKeyRef.current = q.key
        const lastReveal = lastRevealInputRef.current
        await v4Ref.current?.play(
          "chosen",
          buildQuestionData(q, {
            interactive: false,
            selectedIndices,
            selectedIndex: selectedIndices[0] ?? null,
            cardsAlreadyOnStage: alreadyOnStage,
            counts: lastReveal?.counts,
            percentages: lastReveal?.percentages,
            solutions: lastReveal?.solutions,
            mode: lastReveal?.mode,
          }),
        )
      },

      async revealResults(
        input: StageRevealInput,
      ): Promise<StageRevealResult | null> {
        const q = questionRef.current
        if (!q) return null
        lastRevealInputRef.current = input
        setScreenMode("none")
        setMode("results")
        const alreadyOnStage = cardsOnStageKeyRef.current === q.key
        cardsOnStageKeyRef.current = q.key
        const n = q.options.length
        const counts = Array.from({ length: n }, (_, i) =>
          Math.max(0, input.counts[i] ?? 0),
        )
        const total = counts.reduce((a, b) => a + b, 0)
        const data = buildQuestionData(q, {
          interactive: false,
          counts,
          percentages: input.percentages,
          mode: input.mode,
          solutions: input.solutions,
          note: input.note ?? q.note,
          showPercentages: input.showPercentages ?? showPercentagesRef.current,
          cardsAlreadyOnStage: alreadyOnStage,
        })
        const percentages = percentagesFor(data, n)
        const topIndices = topIndicesFor(data, n)
        await v4Ref.current?.play("survey-results", data)
        return { percentages, topIndices, total }
      },

      async showLeaderboard(entries: StageLeaderEntry[]) {
        setScreenMode("none")
        setMode("leaderboard")
        cardsOnStageKeyRef.current = null
        const sorted = [...entries].sort((a, b) => b.score - a.score)
        const p = interactivePropsRef.current
        await v4Ref.current?.play("leaderboard", {
          teams: sorted.map((e) => ({
            id: e.id,
            name: e.name,
            score: e.score,
            icon: e.name[0]?.toUpperCase() || "T",
            streak: e.streak,
          })),
          round: questionRef.current?.round ?? 1,
          number: questionRef.current?.number ?? 1,
          totalQuestions: questionRef.current?.totalQuestions ?? null,
          backgroundUrl: p.backdropUrl,
          backgroundFit: p.backdropFit,
          labels: v4LabelsRef.current,
        })
        return sorted
      },

      async updateLeaderboard(entries: StageLeaderEntry[]) {
        return this.showLeaderboard(entries)
      },

      async nextQuestion(data: StageQuestion) {
        questionRef.current = data
        selectedRef.current = []
        lastRevealInputRef.current = null
        cardsOnStageKeyRef.current = null
        const box: { entered?: Promise<void> } = {}
        // Swap to the next question exactly under the Z-wipe cover (wipe-covered cue).
        const handle = v4Ref.current
        if (handle) {
          await handle.wipe(() => {
            box.entered = this.showQuestion(data)
          })
        }
        if (box.entered) await box.entered
        else await this.showQuestion(data)
      },

      async playZZWipe(onCovered) {
        const handle = v4Ref.current
        if (!handle) {
          if (onCovered) await onCovered()
          return
        }
        await handle.wipe(async () => {
          cardsOnStageKeyRef.current = null
          if (onCovered) await onCovered()
        })
      },

      async showFinale(win) {
        auxEngine.reset()
        v4Ref.current?.clear()
        cardsOnStageKeyRef.current = null
        setMode("finale")
        setWinner(win)
        setConfettiKey((k) => k + 1)
        setScreenMode("win")
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
        const tasks: Array<Promise<void>> = [
          auxEngine.animate(winLogoRef.current, FINALE.logo, {
            duration: FINALE.logoDuration,
            easing: "cubic-bezier(.17,1.13,.3,1)",
          }),
          auxEngine.animate(winHeadlineRef.current, FINALE.headline, {
            duration: FINALE.headlineDuration,
            delay: FINALE.headlineDelay,
          }),
          auxEngine.animate(winNameRef.current, FINALE.name, {
            duration: FINALE.nameDuration,
            delay: FINALE.nameDelay,
            easing: "cubic-bezier(.17,1.13,.3,1)",
          }),
          auxEngine.animate(winScoreRef.current, FINALE.score, {
            duration: FINALE.scoreDuration,
            delay: FINALE.scoreDelay,
          }),
        ]
        if (!auxEngine.reducedMotion) {
          confettiRefs.current.forEach((bit, i) => {
            const spec = confettiBit(i)
            tasks.push(
              auxEngine.animate(bit, spec.frames, {
                duration: spec.duration,
                delay: spec.delay,
                easing: spec.easing,
              }),
            )
          })
        }
        await Promise.all(tasks)
      },

      async showFullShowScene(scene, data) {
        setScreenMode("none")
        cardsOnStageKeyRef.current = null
        setMode("custom")
        const p = interactivePropsRef.current
        await v4Ref.current?.play(scene, {
          ...data,
          backgroundUrl: data.backgroundUrl ?? p.backdropUrl,
          backgroundFit: data.backgroundFit ?? p.backdropFit,
          labels: v4LabelsRef.current,
        })
      },

      updateFullShowData(patch) {
        v4Ref.current?.patchData(patch)
      },

      async showTopPick({ question, counts, topIndex, emptyMessage }) {
        setScreenMode("none")
        cardsOnStageKeyRef.current = null
        const q = question ?? questionRef.current
        const p = interactivePropsRef.current
        await v4Ref.current?.play("top-pick", {
          answers: q ? toV4Answers(q.options) : [],
          counts,
          topIndex,
          emptyMessage,
          round: q?.round ?? 1,
          number: q?.number ?? 1,
          totalQuestions: q?.totalQuestions ?? null,
          backgroundUrl: p.backdropUrl,
          backgroundFit: p.backdropFit,
          labels: v4LabelsRef.current,
        })
      },

      async showRoundRecap({ winners, round, subtitle }) {
        setScreenMode("none")
        cardsOnStageKeyRef.current = null
        const p = interactivePropsRef.current
        await v4Ref.current?.play("round-recap", {
          winners: toV4Answers(winners),
          round: round ?? questionRef.current?.round ?? 1,
          subtitle,
          showQuestionNumber: false,
          backgroundUrl: p.backdropUrl,
          backgroundFit: p.backdropFit,
          labels: v4LabelsRef.current,
        })
      },

      async showInterlude({ title, subtitle }) {
        setScreenMode("none")
        cardsOnStageKeyRef.current = null
        const p = interactivePropsRef.current
        await v4Ref.current?.play("interlude", {
          title,
          subtitle,
          backgroundUrl: p.backdropUrl,
          backgroundFit: p.backdropFit,
          labels: v4LabelsRef.current,
        })
      },

      showCustomScreen() {
        auxEngine.reset()
        v4Ref.current?.clear()
        cardsOnStageKeyRef.current = null
        setMode("custom")
        setScreenMode("custom")
        return Promise.resolve()
      },

      pauseAnimations() {
        v4Ref.current?.pause()
      },
      resumeAnimations() {
        v4Ref.current?.resume()
      },
      setPercentagesVisible(visible: boolean) {
        showPercentagesRef.current = visible
        v4Ref.current?.setPercentagesVisible(visible)
      },
      finishAnimations() {
        v4Ref.current?.skipToEnd()
        auxEngine.finishAll()
      },
      setAmbientEnabled() {
        /* v4 ambient is always managed by CSS / reduced-motion */
      },
      setReducedMotion(on) {
        reducedMotionRef.current = on
        auxEngine.reducedMotion = on
      },
      setSelectedOptions(indexes) {
        selectedRef.current = indexes
        v4Ref.current?.patchData({
          selectedIndices: indexes,
          selectedIndex: indexes[0] ?? null,
        })
      },
    }
  }, [auxEngine, buildQuestionData, setMode])

  useImperativeHandle(ref, () => api, [api])

  const customSlot: ReactNode = (
    <>
      <div
        className={`tz-screen${screenMode === "intro" ? " is-visible" : ""}`}
        data-testid="tadazz-intro-screen"
      >
        <div className="tz-screen-inner">
          <div ref={shockRef} className="tz-shock" />
          <img
            ref={introLogoRef}
            className="tz-intro-logo"
            src={TADAZZ_LOGO_URL}
            alt="TADAZZ!"
          />
          <div className="tz-intro-caption">{stageLabels.introCaption}</div>
        </div>
      </div>

      <div
        className={`tz-screen${screenMode === "win" ? " is-visible" : ""}`}
        data-testid="tadazz-finale-screen"
      >
        <div className="tz-screen-inner">
          <div className="tz-confetti">
            {confettiKey > 0 &&
              Array.from({ length: FINALE.confettiCount }, (_, i) => {
                const spec = confettiBit(i)
                return (
                  <span
                    key={`${confettiKey}:${i}`}
                    className="tz-confetti-bit"
                    style={{
                      background: spec.background,
                      left: spec.left,
                      width: spec.width,
                      height: spec.height,
                    }}
                    ref={(node) => {
                      confettiRefs.current[i] = node
                    }}
                  />
                )
              })}
          </div>
          <img
            ref={winLogoRef}
            className="tz-win-logo"
            src={TADAZZ_LOGO_URL}
            alt="TADAZZ!"
          />
          <div ref={winHeadlineRef} className="tz-win-headline">
            {winner ? stageLabels.champion : stageLabels.finaleNoWinner}
          </div>
          <div
            ref={winNameRef}
            className="tz-win-name"
            data-testid="tadazz-winner-name"
          >
            {winner?.name ?? ""}
          </div>
          <div ref={winScoreRef} className="tz-win-score">
            {winner ? stageLabels.points(winner.score) : ""}
          </div>
        </div>
      </div>

      <div
        className={`tz-screen tz-custom-screen${screenMode === "custom" ? " is-visible" : ""}`}
        data-testid="tadazz-custom-screen"
      >
        <div className="tz-screen-inner">
          {screenMode === "custom" ? customScreen : null}
        </div>
      </div>
    </>
  )

  return (
    <TadazzV4Stage
      ref={v4Ref}
      initialData={{
        backgroundUrl: backdropUrl,
        backgroundFit: backdropFit,
        labels: v4Labels,
      }}
      reducedMotion={reducedMotion}
      className={className}
      underlay={underlay}
      overlay={overlay}
      customScreen={customSlot}
      onCue={onCue}
    />
  )
})
