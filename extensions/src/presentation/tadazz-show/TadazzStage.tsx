import { PlatformButton } from "../platform-controls"
import { TADAZZ_PRODUCT_LOGO_URL } from "../../core/product-branding"
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import { MotionEngine } from "./motion-engine"
import {
  CARD_ENTER,
  CARD_LOCK,
  FINALE,
  INTRO,
  LEADER_ROW_ENTER,
  LEADER_ROW_MOVE,
  LEADER_SCORE_ENTER,
  LEADER_SCORE_MOVE,
  QUESTION_PANEL_ENTER,
  RESULT_COUNT,
  RESULT_FILL,
  RESULT_NUMBER_ENTER,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  VOTE_TIMER_TICK_MS,
  WINNER_SPRING,
  WIPE,
  cardLengthClass,
  cardsRowInsets,
  confettiBit,
  formatTimer,
  questionFontSize,
} from "./motion-spec"
import { DEFAULT_TADAZZ_STAGE_LABELS, type TadazzStageLabels } from "./labels"
import "./tadazz-motion-kit.css"
import "./tadazz-show-adaptations.css"

export const TADAZZ_LOGO_URL = TADAZZ_PRODUCT_LOGO_URL

export const TADAZZ_BACKDROP_URL = "/tadazz-show/motion/backdrop.webp"

export interface StageOption {
  label: string
  /** Real answer image URL (answerVisuals[answerIndex]); omitted for text answers. */
  image?: string
  alt?: string
}

export interface StageQuestion {
  /** Stable identity: questionId/epoch. Used to key cards. */
  key: string
  question: string
  number: number
  totalQuestions: number | null
  round?: number | null
  options: StageOption[]
  note?: string
  /** Optional question image URL for question-image (photo-question) layout when options are text-only. */
  questionImage?: string
  photoAlt?: string
}

export interface StageLeaderEntry {
  id: string
  name: string
  score: number
  streak?: number
}

export interface StageWinner {
  name: string
  score: number
}

export interface StageRevealInput {
  /** Raw vote counts per option index (server authoritative). */
  counts: number[]
  /** Server percentages per option index; derived from counts if absent. */
  percentages?: number[]
  mode: "survey" | "quiz"
  /** Quiz solutions (correct option indexes). Ignored for surveys. */
  solutions?: number[]
  /** Optional explanation note shown on the question panel when results are revealed. */
  note?: string
  /** Whether to show percentage labels (defaults to true). */
  showPercentages?: boolean
}

export interface StageRevealResult {
  percentages: number[]
  topIndices: number[]
  total: number
}

export type StageMode =
  | "idle"
  | "question"
  | "voting"
  | "locked"
  | "results"
  | "leaderboard"
  | "intro"
  | "finale"
  | "custom"

/** Imperative API: the ten reference animation methods plus host-safe utilities. */
export interface TadazzStageHandle {
  showFullShowScene?(
    scene: import("../tadazz-v4/FullShowScenes").FullShowScene,
    data: import("../tadazz-v4/FullShowScenes").FullShowInput,
  ): Promise<void>
  updateFullShowData?(
    patch: Partial<import("../tadazz-v4/FullShowScenes").FullShowInput>,
  ): void
  showIntro(): Promise<void>
  showQuestion(data: StageQuestion): Promise<void>
  /** Adds/updates option cards for the question already on stage (SHOW_QUESTION → SELECT_ANSWER). */
  presentOptions(data: StageQuestion): Promise<void>
  openVoting(seconds: number | null, deadlineMs?: number): Promise<void>
  lockVoting(): Promise<void>
  revealResults(input: StageRevealInput): Promise<StageRevealResult | null>
  showLeaderboard(entries: StageLeaderEntry[]): Promise<StageLeaderEntry[]>
  updateLeaderboard(entries: StageLeaderEntry[]): Promise<StageLeaderEntry[]>
  nextQuestion(data: StageQuestion): Promise<void>
  playZZWipe(onCovered?: () => void | Promise<void>): Promise<void>
  showFinale(winner: StageWinner | null): Promise<void>
  showCustomScreen(): Promise<void>
  /** V4 extensions: spotlight single top-pick winner, round story recap, and round interlude. */
  showTopPick?(data: {
    question?: StageQuestion
    counts?: number[]
    topIndex?: number | null
    emptyMessage?: string
  }): Promise<void>
  showRoundRecap?(data: {
    winners: StageOption[]
    round?: number | null
    subtitle?: string
  }): Promise<void>
  showInterlude?(data: { title: string; subtitle?: string }): Promise<void>
  showChosen?(selectedIndices: number[]): Promise<void>
  pauseAnimations?(): void
  resumeAnimations?(): void
  setPercentagesVisible?(visible: boolean): void
  finishAnimations(): void
  setAmbientEnabled(on: boolean): void
  setReducedMotion(on: boolean): void
  setSelectedOptions(indexes: number[]): void
  readonly mode: StageMode
  readonly questionKey: string | null
}

interface CardFlags {
  open?: boolean
  locked?: boolean
  favourite?: boolean
  correct?: boolean
  incorrect?: boolean
}
interface StageModel {
  version: number
  question: StageQuestion | null
  stageState: "" | "tz-voting" | "tz-locked"
  statusText: string
  statusMode: "" | "voting" | "locked" | "results"
  timerDisplay: "none" | "block" | undefined
  flags: CardFlags[]
  winnerTag: string
  screen: "none" | "leader" | "win" | "intro" | "custom"
  rows: StageLeaderEntry[]
  winner: StageWinner | null
  confettiKey: number
  wipeVisible: boolean
  ambient: boolean
}

export interface TadazzStageProps {
  labels?: Partial<TadazzStageLabels>
  /** Per-card / per-scene background override (authored); defaults to the canonical backdrop. */
  backdropUrl?: string | null
  backdropFit?: "cover" | "contain"
  /** Player role: option cards become buttons while voting is open. */
  interactive?: boolean
  multiSelect?: boolean
  onSelectOption?: (index: number) => void
  /** Content for the shared `.tz-screen` slot (lobby, waiting, countdown…). */
  customScreen?: ReactNode
  /** Extra layer painted inside the stage between backdrop and UI (e.g. cinematic media). */
  underlay?: ReactNode
  /** Full-stage layer above every screen but below the ZZ wipe (opening compositor). */
  overlay?: ReactNode
  reducedMotion?: boolean
  className?: string
  onModeChange?: (mode: StageMode) => void
}

const emptyModel = (
  labels: TadazzStageLabels,
  hasCustom = false,
): StageModel => ({
  version: 0,
  question: null,
  stageState: "",
  statusText: labels.questionReady,
  statusMode: "",
  timerDisplay: undefined,
  flags: [],
  winnerTag: labels.audienceFavourite,
  screen: hasCustom ? "custom" : "none",
  rows: [],
  winner: null,
  confettiKey: 0,
  wipeVisible: false,
  ambient: true,
})
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * React/TypeScript port of the canonical TADAZZ Motion Kit stage.
 * DOM structure, class names and motion are 1:1 with the reference; all
 * content is supplied by the caller from authoritative game state.
 */
export const TadazzStage = forwardRef<TadazzStageHandle, TadazzStageProps>(
  function TadazzStage(
    {
      labels: labelOverrides,
      backdropUrl,
      backdropFit = "cover",
      interactive = false,
      multiSelect = false,
      onSelectOption,
      customScreen,
      underlay,
      overlay,
      reducedMotion,
      className,
      onModeChange,
    },
    ref,
  ) {
    const labels = useMemo(
      () => ({
        ...DEFAULT_TADAZZ_STAGE_LABELS,
        ...labelOverrides,
      }),
      [labelOverrides],
    )
    const labelsRef = useRef(labels)
    labelsRef.current = labels
    const engineRef = useRef<MotionEngine | null>(null)
    engineRef.current ??= new MotionEngine()
    const engine = engineRef.current
    const [model, setModel] = useState<StageModel>(() =>
      emptyModel(labels, Boolean(customScreen)),
    )
    const modelRef = useRef(model)
    modelRef.current = model
    const versionRef = useRef(0)
    const waitersRef = useRef<
      Array<{
        v: number
        resolve: () => void
      }>
    >([])
    const [selected, setSelected] = useState<number[]>([])
    const viewportRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLElement>(null)
    const panelRef = useRef<HTMLDivElement>(null)
    const cardsRowRef = useRef<HTMLDivElement>(null)
    const statusbarRef = useRef<HTMLDivElement>(null)
    const footerRef = useRef<HTMLDivElement>(null)
    const progressRef = useRef<HTMLSpanElement>(null)
    const timerRef = useRef<HTMLSpanElement>(null)
    const cardRefs = useRef<Array<HTMLElement | null>>([])
    const resultRefs = useRef<Array<HTMLDivElement | null>>([])
    const fillRefs = useRef<Array<HTMLDivElement | null>>([])
    const trackRefs = useRef<Array<HTMLDivElement | null>>([])
    const rowRefs = useRef(new Map<string, HTMLDivElement>())
    const scoreRefs = useRef(new Map<string, HTMLDivElement>())
    const introLogoRef = useRef<HTMLImageElement>(null)
    const shockRef = useRef<HTMLDivElement>(null)
    const winLogoRef = useRef<HTMLImageElement>(null)
    const winHeadlineRef = useRef<HTMLDivElement>(null)
    const winNameRef = useRef<HTMLDivElement>(null)
    const winScoreRef = useRef<HTMLDivElement>(null)
    const confettiRefs = useRef<Array<HTMLSpanElement | null>>([])
    const wipeRef = useRef<HTMLDivElement>(null)
    const blueRef = useRef<HTMLDivElement>(null)
    const citronRef = useRef<HTMLDivElement>(null)
    const flashRef = useRef<HTMLDivElement>(null)
    const wordRef = useRef<HTMLDivElement>(null)
    const modeRef = useRef<StageMode>(customScreen ? "custom" : "idle")
    const teamScores = useRef(new Map<string, number>())
    const timerInterval = useRef<ReturnType<typeof setInterval> | null>(null)
    const onModeChangeRef = useRef(onModeChange)
    onModeChangeRef.current = onModeChange
    const setMode = useCallback((mode: StageMode) => {
      modeRef.current = mode
      onModeChangeRef.current?.(mode)
    }, [])

    /** SetState and resolve once the DOM for that version is committed. */
    const commit = useCallback(
      (
        patch: Partial<StageModel> | ((m: StageModel) => Partial<StageModel>),
      ) => {
        versionRef.current += 1
        const v = versionRef.current

        return new Promise<void>((resolve) => {
          waitersRef.current.push({
            v,
            resolve,
          })
          setModel((prev) => ({
            ...prev,
            ...(typeof patch === "function" ? patch(prev) : patch),
            version: v,
          }))
        })
      },
      [],
    )
    useLayoutEffect(() => {
      const ready = waitersRef.current.filter((w) => w.v <= model.version)
      waitersRef.current = waitersRef.current.filter((w) => w.v > model.version)
      for (const w of ready) {
        w.resolve()
      }
    }, [model.version])

    // `_fit()`: uniform contain-scaling of the 1920×1080 stage.
    useLayoutEffect(() => {
      const viewport = viewportRef.current
      const stage = stageRef.current

      if (!viewport || !stage) {
        return
      }

      const fit = () => {
        const rect = viewport.getBoundingClientRect()
        const vw = Math.min(
          rect.width || viewport.clientWidth,
          typeof window !== "undefined" && window.innerWidth > 0
            ? window.innerWidth
            : Infinity,
        )
        const vh = Math.min(
          rect.height || viewport.clientHeight,
          typeof window !== "undefined" && window.innerHeight > 0
            ? window.innerHeight
            : Infinity,
        )
        const scale = Math.min(vw / STAGE_WIDTH, vh / STAGE_HEIGHT)
        stage.style.setProperty(
          "--screen-scale",
          String(scale > 0 ? scale : 0.0001),
        )
      }
      fit()
      const observer =
        typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null
      observer?.observe(viewport)
      window.addEventListener("resize", fit)

      return () => {
        observer?.disconnect()
        window.removeEventListener("resize", fit)
      }
    }, [])
    useEffect(() => {
      engine.reducedMotion = reducedMotion ?? prefersReducedMotion()
    }, [engine, reducedMotion])
    const stopTimer = useCallback(() => {
      if (timerInterval.current) {
        clearInterval(timerInterval.current)
        timerInterval.current = null
      }
    }, [])
    useEffect(
      () => () => {
        stopTimer()
        engine.dispose()
      },
      [engine, stopTimer],
    )
    const scale = () =>
      parseFloat(
        stageRef.current
          ? getComputedStyle(stageRef.current).getPropertyValue(
              "--screen-scale",
            )
          : "1",
      ) || 1

    // ── _renderQuestion + _enterQuestion ───────────────────────────────────
    const renderQuestion = useCallback(
      async (data: StageQuestion) => {
        stopTimer()
        cardRefs.current = []
        resultRefs.current = []
        fillRefs.current = []
        trackRefs.current = []
        setSelected([])
        await commit({
          question: data,
          stageState: "",
          screen: "none",
          timerDisplay: "none",
          statusText: labelsRef.current.questionReady,
          statusMode: "",
          flags: data.options.map(() => ({})),
          winnerTag: labelsRef.current.audienceFavourite,
        })

        if (panelRef.current) {
          panelRef.current.style.cssText = ""
        }

        for (const n of [
          cardsRowRef.current,
          panelRef.current,
          statusbarRef.current,
          footerRef.current,
        ]) {
          if (n) {
            n.style.opacity = "1"
          }
        }
        setMode("question")
      },
      [commit, setMode, stopTimer],
    )
    const enterCards = useCallback(
      (from = 0) =>
        cardRefs.current.slice(from).map((card, i) =>
          engine.animate(card, CARD_ENTER.frames, {
            duration: CARD_ENTER.duration,
            delay: CARD_ENTER.delay(i),
            easing: CARD_ENTER.easing,
          }),
        ),
      [engine],
    )
    const enterQuestion = useCallback(async () => {
      const tasks = [
        engine.animate(
          panelRef.current,
          QUESTION_PANEL_ENTER.frames,
          QUESTION_PANEL_ENTER.timing,
        ),
        ...enterCards(),
      ]
      await Promise.all(tasks)
    }, [engine, enterCards])

    // ── _playWipe ──────────────────────────────────────────────────────────
    const playWipe = useCallback(
      async (onCovered?: () => void | Promise<void>) => {
        await commit({
          wipeVisible: true,
        })

        if (wipeRef.current) {
          wipeRef.current.style.opacity = "1"
        }

        if (blueRef.current) {
          blueRef.current.style.transform = "translateX(-130%)"
        }

        if (citronRef.current) {
          citronRef.current.style.transform = "translateX(130%)"
        }

        if (wordRef.current) {
          wordRef.current.style.opacity = "0"
        }

        await Promise.all([
          engine.animate(blueRef.current, WIPE.blueIn, {
            duration: WIPE.approachDuration,
            easing: WIPE.approachEasing,
          }),
          engine.animate(citronRef.current, WIPE.citronIn, {
            duration: WIPE.approachDuration,
            easing: WIPE.approachEasing,
          }),
        ])
        await engine.animate(wordRef.current, WIPE.word, {
          duration: WIPE.wordDuration,
        })
        await engine.animate(flashRef.current, WIPE.flash, {
          duration: WIPE.flashDuration,
        })

        if (onCovered) {
          await onCovered()
        }

        await engine.wait(engine.reducedMotion ? 0 : WIPE.coveredHoldMs)
        await Promise.all([
          engine.animate(blueRef.current, WIPE.blueOut, {
            duration: WIPE.exitDuration,
            easing: WIPE.exitEasing,
          }),
          engine.animate(citronRef.current, WIPE.citronOut, {
            duration: WIPE.exitDuration,
            easing: WIPE.exitEasing,
          }),
          engine.animate(wordRef.current, WIPE.wordOut, {
            duration: WIPE.wordOutDuration,
          }),
        ])
        await commit({
          wipeVisible: false,
        })
      },
      [commit, engine],
    )

    // ── leaderboard rows (_renderRows) ─────────────────────────────────────
    const renderRows = useCallback(
      async (entries: StageLeaderEntry[]) => {
        const next = entries
          .map((x) => ({
            ...x,
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
        await commit({
          rows: next,
          screen: "leader",
        })
        for (const entry of next) {
          const node = scoreRefs.current.get(entry.id)

          if (node) {
            node.textContent = (
              teamScores.current.get(entry.id) ?? 0
            ).toLocaleString("en-US")
          }
        }

        return next
      },
      [commit],
    )
    const updateTimer = useCallback((time: number, whole: number) => {
      if (timerRef.current) {
        timerRef.current.textContent = formatTimer(time)
      }

      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${Math.min(1, Math.max(0, time / (whole || 30)))})`
      }
    }, [])
    const api = useMemo<TadazzStageHandle>(() => {
      const lockVoting = async () => {
        if (!modelRef.current.question || modeRef.current === "locked") {
          return
        }

        if (modeRef.current !== "voting" && modeRef.current !== "question") {
          return
        }

        stopTimer()
        setMode("locked")
        /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
        await commit((m) => ({
          screen: "none",
          stageState: "tz-locked",
          timerDisplay: "none",
          statusText: labelsRef.current.votesLocked,
          statusMode: "locked",
          flags: m.flags.map((f) => ({
            ...f,
            open: false,
            locked: true,
          })),
        }))
        /* oxlint-enable max-nested-callbacks */
        await Promise.all(
          cardRefs.current.map((c, i) =>
            engine.animate(c, CARD_LOCK.frames, {
              duration: CARD_LOCK.duration,
              delay: CARD_LOCK.delay(i),
            }),
          ),
        )
      }

      return {
        get mode() {
          return modeRef.current
        },
        get questionKey() {
          return modelRef.current.question?.key ?? null
        },
        async showIntro() {
          stopTimer()
          engine.reset()
          setMode("intro")
          await commit({
            screen: "intro",
          })
          const logo = introLogoRef.current

          if (logo) {
            logo.style.opacity = INTRO.logoInitial.opacity
            logo.style.transform = INTRO.logoInitial.transform
          }

          await Promise.all([
            engine.animate(logo, INTRO.logo, {
              duration: INTRO.logoDuration,
              easing: "cubic-bezier(.17,1.13,.3,1)",
            }),
            engine.animate(shockRef.current, INTRO.shock, {
              duration: INTRO.shockDuration,
              delay: INTRO.shockDelay,
              easing: INTRO.shockEasing,
            }),
          ])
        },
        async showQuestion(data) {
          engine.reset()
          await commit({
            wipeVisible: false,
          })
          await renderQuestion(data)
          await enterQuestion()
        },
        async presentOptions(data) {
          const current = modelRef.current.question

          if (!current || current.key !== data.key) {
            await this.showQuestion(data)

            return
          }

          if (modeRef.current !== "voting") {
            setMode("question")
          }

          const before = current.options.length
          const sameOptions =
            before === data.options.length &&
            current.question === data.question &&
            current.options.every(
              (o, i) =>
                o.label === data.options[i]?.label &&
                o.image === data.options[i]?.image,
            )

          if (sameOptions) {
            if (modelRef.current.screen !== "none") {
              await commit({
                screen: "none",
              })
            }

            return
          }

          /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
          await commit((m) => ({
            screen: "none",
            question: data,
            flags: data.options.map(
              (_, i) =>
                m.flags[i] ??
                (modeRef.current === "voting"
                  ? {
                      open: true,
                    }
                  : {}),
            ),
          }))

          /* oxlint-enable max-nested-callbacks */
          if (cardsRowRef.current) {
            cardsRowRef.current.style.opacity = "1"
          }

          await Promise.all(
            enterCards(
              before > 0 && before === data.options.length
                ? data.options.length
                : 0,
            ),
          )
        },
        async openVoting(seconds, deadlineMs) {
          if (!modelRef.current.question || modeRef.current === "results") {
            return
          }

          stopTimer()
          setMode("voting")
          const timed = seconds !== null && seconds > 0
          /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
          await commit((m) => ({
            screen: "none",
            stageState: "tz-voting",
            statusText: labelsRef.current.votingOpen,
            statusMode: "voting",
            timerDisplay: timed ? "block" : "none",
            flags: (m.question?.options ?? m.flags).map((_, i) => ({
              ...m.flags[i],
              locked: false,
              open: true,
            })),
          }))

          /* oxlint-enable max-nested-callbacks */
          if (!timed) {
            if (progressRef.current) {
              progressRef.current.style.transform = "scaleX(1)"
            }

            return
          }

          const duration = Math.max(1, seconds || 30)
          const end = deadlineMs ?? Date.now() + duration * 1000
          updateTimer(Math.max(0, (end - Date.now()) / 1000), duration)
          timerInterval.current = setInterval(() => {
            const left = Math.max(0, (end - Date.now()) / 1000)
            updateTimer(left, duration)

            if (left <= 0) {
              void lockVoting()
            }
          }, VOTE_TIMER_TICK_MS)
        },
        lockVoting,
        async revealResults(input) {
          const q = modelRef.current.question

          if (!q) {
            return null
          }

          stopTimer()
          engine.reset()
          setMode("results")
          const n = q.options.length
          const values = Array.from(
            {
              length: n,
            },
            (_, i) => Math.max(0, input.counts[i] || 0),
          )
          const total = values.reduce((a, b) => a + b, 0)
          const percentages = Array.from(
            {
              length: n,
            },
            (_, i) => {
              const p = input.percentages?.[i]

              /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
              return (() => {
                if (typeof p === "number" && Number.isFinite(p)) {
                  return Math.max(0, Math.min(100, p))
                }

                if (total) {
                  return (100 * values[i]) / total
                }

                return 0
              })()
              /* oxlint-enable max-nested-callbacks */
            },
          )
          const isQuiz =
            input.mode === "quiz" && (input.solutions?.length ?? 0) > 0
          const max = Math.max(0, ...values)
          const top = isQuiz
            ? (input.solutions ?? []).filter((i) => i >= 0 && i < n)
            : values.flatMap((v, i) => (v === max && total > 0 ? [i] : []))
          const ties = !isQuiz && top.length > 1
          /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
          await commit((m) => ({
            screen: "none",
            question:
              m.question && input.note
                ? {
                    ...m.question,
                    note: input.note,
                  }
                : m.question,
            stageState: "",
            timerDisplay: "none",
            statusText: labelsRef.current.audienceResults,
            statusMode: "results",
            winnerTag: (() => {
              if (isQuiz) {
                return labelsRef.current.correctAnswer
              }

              if (ties) {
                return labelsRef.current.jointAudienceFavourite
              }

              return labelsRef.current.audienceFavourite
            })(),
            flags: m.flags.map(() => ({})),
          }))
          /* oxlint-enable max-nested-callbacks */
          const tasks: Array<Promise<void>> = []
          cardRefs.current.forEach((card, i) => {
            if (card) {
              card.style.filter = "brightness(1)"
            }

            const track = trackRefs.current[i]
            const fill = fillRefs.current[i]
            const result = resultRefs.current[i]

            if (track) {
              track.style.opacity = "1"
            }

            if (fill) {
              fill.style.width = "0%"
            }

            if (result) {
              result.style.opacity = "0"
              result.textContent = "0%"
            }

            tasks.push(
              engine.animate(result, RESULT_NUMBER_ENTER.frames, {
                duration: RESULT_NUMBER_ENTER.duration,
                delay: RESULT_NUMBER_ENTER.delay(i),
              }),
            )
            tasks.push(
              engine.animate(
                fill,
                [
                  {
                    width: "0%",
                  },
                  {
                    width: `${percentages[i].toFixed(1)}%`,
                  },
                ],
                {
                  duration: RESULT_FILL.duration,
                  delay: RESULT_FILL.delay(i),
                  easing: RESULT_FILL.easing,
                },
              ),
            )
            tasks.push(
              engine.countPercent(
                result,
                0,
                Math.round(percentages[i]),
                RESULT_COUNT.duration,
                RESULT_COUNT.delay(i),
              ),
            )
          })
          await Promise.all(tasks)
          /* oxlint-disable max-nested-callbacks -- The stage callback structure follows the existing animation lifecycle and render tree. */
          await commit((m) => ({
            flags: m.flags.map((_, i) => ({
              favourite: top.includes(i),
              correct: isQuiz && top.includes(i),
              incorrect: isQuiz && !top.includes(i),
            })),
          }))
          /* oxlint-enable max-nested-callbacks */
          await Promise.all(
            top.map((i, j) =>
              engine.animate(cardRefs.current[i], WINNER_SPRING.frames, {
                duration: WINNER_SPRING.duration,
                delay: WINNER_SPRING.delay(j),
                easing: WINNER_SPRING.easing,
              }),
            ),
          )

          return {
            percentages,
            topIndices: top,
            total,
          }
        },
        async showLeaderboard(entries) {
          stopTimer()
          engine.reset()
          setMode("leaderboard")
          await commit({
            stageState: "",
            rows: [],
          })
          const data = await renderRows(entries)
          const tasks: Array<Promise<void>> = []
          data.forEach((entry, i) => {
            const row = rowRefs.current.get(entry.id)
            tasks.push(
              engine.animate(row, LEADER_ROW_ENTER.frames, {
                duration: LEADER_ROW_ENTER.duration,
                delay: LEADER_ROW_ENTER.delay(i),
                easing: LEADER_ROW_ENTER.easing,
              }),
            )
            tasks.push(
              engine.countNumber(
                scoreRefs.current.get(entry.id),
                0,
                entry.score || 0,
                LEADER_SCORE_ENTER.duration,
                LEADER_SCORE_ENTER.delay(i),
              ),
            )
          })
          await Promise.all(tasks)
          for (const x of data) {
            teamScores.current.set(x.id, x.score || 0)
          }

          return data
        },
        async updateLeaderboard(entries) {
          if (!entries.length) {
            return []
          }

          if (modeRef.current !== "leaderboard") {
            return this.showLeaderboard(entries)
          }

          engine.reset()
          const before = new Map<string, DOMRect>()
          rowRefs.current.forEach((node, id) => {
            before.set(id, node.getBoundingClientRect())
          })
          const prevScores = new Map(teamScores.current)
          const next = await renderRows(entries)
          const s = scale()
          const tasks: Array<Promise<void>> = []
          next.forEach((entry, i) => {
            const row = rowRefs.current.get(entry.id)

            if (!row) {
              return
            }

            const old = before.get(entry.id)
            const now = row.getBoundingClientRect()
            const diff = old
              ? (old.top - now.top) / s
              : LEADER_ROW_MOVE.newRowOffset
            tasks.push(
              engine.animate(row, LEADER_ROW_MOVE.frames(diff, Boolean(old)), {
                duration: LEADER_ROW_MOVE.duration,
                delay: LEADER_ROW_MOVE.delay(i),
                easing: LEADER_ROW_MOVE.easing,
              }),
            )
            tasks.push(
              engine.countNumber(
                scoreRefs.current.get(entry.id),
                prevScores.get(entry.id) ?? 0,
                entry.score,
                LEADER_SCORE_MOVE.duration,
                LEADER_SCORE_MOVE.delay(i),
              ),
            )
          })
          await Promise.all(tasks)
          for (const x of next) {
            teamScores.current.set(x.id, x.score || 0)
          }

          return next
        },
        async nextQuestion(data) {
          stopTimer()
          engine.reset()
          await playWipe(() => renderQuestion(data))
          await enterQuestion()
        },
        async playZZWipe(onCovered) {
          engine.reset()
          await playWipe(onCovered)
        },
        async showFinale(winner) {
          stopTimer()
          engine.reset()
          setMode("finale")
          await commit((m) => ({
            screen: "win",
            winner,
            confettiKey: m.confettiKey + 1,
          }))
          const tasks: Array<Promise<void>> = [
            engine.animate(winLogoRef.current, FINALE.logo, {
              duration: FINALE.logoDuration,
              easing: "cubic-bezier(.17,1.13,.3,1)",
            }),
            engine.animate(winHeadlineRef.current, FINALE.headline, {
              duration: FINALE.headlineDuration,
              delay: FINALE.headlineDelay,
            }),
            engine.animate(winNameRef.current, FINALE.name, {
              duration: FINALE.nameDuration,
              delay: FINALE.nameDelay,
              easing: "cubic-bezier(.17,1.13,.3,1)",
            }),
            engine.animate(winScoreRef.current, FINALE.score, {
              duration: FINALE.scoreDuration,
              delay: FINALE.scoreDelay,
            }),
          ]

          if (!engine.reducedMotion) {
            confettiRefs.current.forEach((bit, i) => {
              const spec = confettiBit(i)
              tasks.push(
                engine.animate(bit, spec.frames, {
                  duration: spec.duration,
                  delay: spec.delay,
                  easing: spec.easing,
                }),
              )
            })
          }

          await Promise.all(tasks)
        },
        async showCustomScreen() {
          stopTimer()
          engine.reset()
          setMode("custom")
          await commit({
            screen: "custom",
            stageState: "",
          })
        },
        finishAnimations() {
          engine.finishAll()
        },
        setAmbientEnabled(on) {
          void commit({
            ambient: on,
          })
        },
        setReducedMotion(on) {
          engine.reducedMotion = on
        },
        setSelectedOptions(indexes) {
          setSelected(indexes)
        },
      }
    }, [
      commit,
      engine,
      enterCards,
      enterQuestion,
      playWipe,
      renderQuestion,
      renderRows,
      setMode,
      stopTimer,
      updateTimer,
    ])
    useImperativeHandle(ref, () => api, [api])
    const q = model.question
    const insets = cardsRowInsets(q?.options.length ?? 5)
    const cardsStyle: CSSProperties | undefined =
      q && q.options.length > 0 && q.options.length < 5
        ? {
            left: `${insets.left}px`,
            right: `${insets.right}px`,
            gridTemplateColumns: `repeat(${q.options.length},minmax(0,1fr))`,
          }
        : undefined
    const canSelect =
      interactive &&
      Boolean(q && q.options.length > 0) &&
      model.statusMode !== "locked" &&
      model.statusMode !== "results"
    const backdropStyle: CSSProperties | undefined = backdropUrl
      ? {
          backgroundImage: `url("${backdropUrl.replace(/"/g, "%22")}")`,
          backgroundSize: backdropFit,
        }
      : undefined

    return (
      <div
        ref={viewportRef}
        className={`tz-viewport ${className ?? ""}`}
        data-testid="tadazz-stage-viewport"
      >
        <section
          ref={stageRef}
          className={`tz-stage ${model.stageState}`.trim()}
          aria-label="TADAZZ 16:9 stage"
          data-testid="tadazz-stage"
          data-stage-mode={modeRef.current}
          data-question-key={q?.key ?? ""}
        >
          <div
            className="tz-backdrop"
            style={backdropStyle}
            data-testid="tadazz-backdrop"
          />
          {underlay}
          <div
            className="tz-ambient"
            style={{
              display: model.ambient ? "block" : "none",
            }}
          >
            <div className="beam a" />
            <div className="beam b" />
            <div className="beam c" />
            <div className="edge-blue" />
            <div className="edge-citron" />
            <div className="floorline" />
          </div>
          <div className="tz-topline">
            <div className="tz-micro-brand">
              TADA<span>ZZ!</span>
            </div>
            {q && <div className="tz-round">{labels.roundLabel(q)}</div>}
          </div>
          {q && (
            <>
              <div
                ref={panelRef}
                className="tz-question-panel"
                data-testid="tadazz-question-panel"
              >
                <div
                  className="tz-question-text"
                  style={{
                    fontSize: questionFontSize(q.question),
                  }}
                >
                  {q.question}
                </div>
                {q.note && model.statusMode === "results" && (
                  <div
                    className="tz-question-note"
                    data-testid="tadazz-question-note"
                  >
                    {q.note}
                  </div>
                )}
              </div>
              <div
                ref={cardsRowRef}
                className="tz-cards"
                style={cardsStyle}
                role={canSelect ? "group" : undefined}
                aria-label={canSelect ? labels.answerChoices : undefined}
              >
                {q.options.map((opt, i) => {
                  const f = model.flags[i] ?? {}
                  const isSelected = selected.includes(i)
                  const cls = [
                    "tz-card",
                    cardLengthClass(opt.label),
                    f.open && "is-vote-open",
                    f.locked && "is-vote-locked",
                    f.favourite && "is-favourite",
                    f.correct && "is-correct",
                    f.incorrect && "is-incorrect",
                    canSelect && "is-selectable",
                    isSelected && "is-selected",
                  ]
                    .filter(Boolean)
                    .join(" ")

                  return (
                    <PlatformButton
                      type="button"
                      size="sm"
                      classNameContent="contents"
                      disabled={!canSelect}
                      key={`${q.key}:${i}`}
                      ref={(node) => {
                        cardRefs.current[i] = node
                      }}
                      className={`border-0 bg-transparent p-0 disabled:opacity-100 ${cls}`}
                      data-index={i}
                      data-testid={`tadazz-card-${i}`}
                      aria-pressed={canSelect ? isSelected : undefined}
                      aria-label={
                        canSelect
                          ? `${String.fromCharCode(65 + i)} ${opt.label}`
                          : undefined
                      }
                      onClick={
                        canSelect ? () => onSelectOption?.(i) : undefined
                      }
                      data-multi={multiSelect ? "true" : undefined}
                    >
                      <div
                        className={`tz-photo-frame${opt.image ? "" : "tz-photo-empty"}`}
                      >
                        {opt.image ? (
                          <img
                            src={opt.image}
                            alt={opt.alt || opt.label || labels.answerOption}
                            loading="eager"
                            decoding="async"
                          />
                        ) : (
                          <span
                            className="tz-photo-monogram"
                            aria-hidden="true"
                          >
                            {i + 1}
                          </span>
                        )}
                        <div className="tz-photo-sheen" />
                      </div>
                      <div
                        className="tz-result-number"
                        ref={(node) => {
                          resultRefs.current[i] = node
                        }}
                      />
                      <div className="tz-card-caption">
                        <div className="tz-card-label">{opt.label}</div>
                        <div
                          className="tz-result-track"
                          ref={(node) => {
                            trackRefs.current[i] = node
                          }}
                        >
                          <div
                            className="tz-result-fill"
                            ref={(node) => {
                              fillRefs.current[i] = node
                            }}
                          />
                        </div>
                      </div>
                      <div className="tz-winner-tag">{model.winnerTag}</div>
                    </PlatformButton>
                  )
                })}
              </div>
              <div ref={statusbarRef} className="tz-statusbar">
                <div
                  className={`tz-indicator${model.statusMode ? ` ${model.statusMode}` : ""}`}
                  data-testid="tadazz-status"
                >
                  <i className="tz-statusdot" />
                  <span>{model.statusText}</span>
                </div>
                <div className="tz-vote-bar">
                  <span ref={progressRef} />
                </div>
                <span
                  ref={timerRef}
                  className="tz-timer"
                  style={
                    model.timerDisplay
                      ? {
                          display: model.timerDisplay,
                        }
                      : undefined
                  }
                  data-testid="tadazz-timer"
                />
              </div>
            </>
          )}
          <div ref={footerRef} className="tz-footer-note">
            {labels.footer}
          </div>

          <div
            className={`tz-screen${model.screen === "leader" ? "is-visible" : ""}`}
            data-testid="tadazz-leaderboard-screen"
          >
            <div className="tz-screen-inner">
              <div className="tz-screen-eyebrow">
                {labels.leaderboardEyebrow}
              </div>
              <div className="tz-leader-title">
                {labels.leaderboardTitlePrefix}
                <span>{labels.leaderboardTitleAccent}</span>
              </div>
              <div className="tz-leader-underline" />
              <div className="tz-leader-rows">
                {model.rows.map((row, index) => (
                  <div
                    key={row.id}
                    className={`tz-leader-row${index === 0 ? "champion" : ""}`}
                    data-id={row.id}
                    ref={(node) => {
                      if (node) {
                        rowRefs.current.set(row.id, node)
                      } else {
                        rowRefs.current.delete(row.id)
                      }
                    }}
                  >
                    <div className="tz-rank">{index + 1}</div>
                    <div className="tz-team-name">
                      {row.name}
                      {row.streak && row.streak >= 2 ? (
                        <span
                          role="img"
                          aria-label={labels.streak}
                          className="tz-streak-badge"
                        >
                          🔥
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="tz-team-score"
                      ref={(node) => {
                        if (node) {
                          scoreRefs.current.set(row.id, node)
                        } else {
                          scoreRefs.current.delete(row.id)
                        }
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div
            className={`tz-screen${model.screen === "win" ? "is-visible" : ""}`}
            data-testid="tadazz-finale-screen"
          >
            <div className="tz-screen-inner">
              <div className="tz-confetti">
                {model.confettiKey > 0 &&
                  Array.from(
                    {
                      length: FINALE.confettiCount,
                    },
                    (_, i) => {
                      const spec = confettiBit(i)

                      return (
                        <span
                          key={`${model.confettiKey}:${i}`}
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
                    },
                  )}
              </div>
              <img
                ref={winLogoRef}
                className="tz-win-logo"
                src={TADAZZ_LOGO_URL}
                alt="TADAZZ!"
              />
              <div ref={winHeadlineRef} className="tz-win-headline">
                {model.winner ? labels.champion : labels.finaleNoWinner}
              </div>
              <div
                ref={winNameRef}
                className="tz-win-name"
                data-testid="tadazz-winner-name"
              >
                {model.winner?.name ?? ""}
              </div>
              <div ref={winScoreRef} className="tz-win-score">
                {model.winner ? labels.points(model.winner.score) : ""}
              </div>
            </div>
          </div>

          <div
            className={`tz-screen${model.screen === "intro" ? "is-visible" : ""}`}
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
              <div className="tz-intro-caption">{labels.introCaption}</div>
            </div>
          </div>

          <div
            className={`tz-screen tz-custom-screen${model.screen === "custom" ? "is-visible" : ""}`}
            data-testid="tadazz-custom-screen"
          >
            <div className="tz-screen-inner">
              {model.screen === "custom" ? customScreen : null}
            </div>
          </div>

          {overlay}

          <div
            ref={wipeRef}
            className={`tz-wipe${model.wipeVisible ? "is-visible" : ""}`}
            aria-hidden="true"
          >
            <div ref={blueRef} className="tz-wipe-piece blue" />
            <div ref={citronRef} className="tz-wipe-piece citron" />
            <div ref={flashRef} className="tz-wipe-flash" />
            <div ref={wordRef} className="tz-wipe-word">
              ZZ!
            </div>
          </div>
        </section>
      </div>
    )
  },
)
