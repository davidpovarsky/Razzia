import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowRight, RotateCcw, Volume2, VolumeX } from "lucide-react"
import { TadazzV4StageAdapter } from "../../../presentation/tadazz-show/TadazzV4StageAdapter"
import type {
  StageLeaderEntry,
  StageQuestion,
  TadazzStageHandle,
} from "../../../presentation/tadazz-show/TadazzStage"
import type { TadazzV4Cue } from "../../../presentation/tadazz-v4/types"
import {
  TADAZZ_PHASE_SFX,
  TADAZZ_SFX_BY_CUE,
} from "../../../presentation/audio-cue-player"
import v4Css from "../../../presentation/tadazz-v4/tadazz-v4.css?inline"
import v4LayoutCss from "../../../presentation/tadazz-v4/source-layout.css?inline"
import v4FullShowCss from "../../../presentation/tadazz-v4/full-show.css?inline"
import motionKitCss from "../../../presentation/tadazz-show/tadazz-motion-kit.css?inline"
import stageAdaptationsCss from "../../../presentation/tadazz-show/tadazz-show-adaptations.css?inline"

type Answer = { label: string; image?: string }
type Question = {
  key: string
  heading: string
  kind: "quiz" | "survey"
  answers: Answer[]
  correct?: number
  demoCounts: number[]
}
type Phase =
  | "intro"
  | "round-launch"
  | "question-transition"
  | "voting"
  | "locked"
  | "results"
  | "top-pick"
  | "leaderboard"
  | "grand-finale"
  | "final-leaderboard"
  | "winner"
  | "closing"

const MEDIA = "/tadazz-show/great-guessoff"
const VOTING_SECONDS = 20
const GUESS_OFF_STAGE_LABELS = { teamLeaderboard: "LEADERBOARD" } as const
// These are explicitly illustrative sample counts; no live audience is connected.
const QUESTIONS: Question[] = [
  {
    key: "family-fun",
    heading:
      "What causes the biggest delay when the whole family is going out?",
    kind: "survey",
    answers: [
      { label: "Getting everyone ready" },
      { label: "Finding missing things" },
      { label: "Last-minute changes" },
      { label: "Actually getting out the door" },
    ],
    demoCounts: [38, 27, 15, 20],
  },
  {
    key: "picture-trivia",
    heading: "Which of these is actually a berry?",
    kind: "quiz",
    correct: 0,
    answers: [
      { label: "Banana", image: `${MEDIA}/banana.webp` },
      { label: "Strawberry", image: `${MEDIA}/strawberry.webp` },
      { label: "Raspberry", image: `${MEDIA}/raspberry.webp` },
      { label: "Cherry", image: `${MEDIA}/cherry.webp` },
    ],
    demoCounts: [40, 33, 15, 12],
  },
  {
    key: "at-work",
    heading:
      "What's the real reason a five-minute meeting turns into half an hour?",
    kind: "survey",
    answers: [
      { label: "“Just one more thing…”" },
      { label: "Technical problems" },
      { label: "Off-topic conversations" },
      { label: "Someone arriving late" },
    ],
    demoCounts: [46, 18, 25, 11],
  },
  {
    key: "quick-trivia",
    heading: "How many hearts does an octopus have?",
    kind: "quiz",
    correct: 2,
    answers: [
      { label: "One" },
      { label: "Two" },
      { label: "Three" },
      { label: "Four" },
    ],
    demoCounts: [15, 14, 62, 9],
  },
  {
    key: "party-personality",
    heading: "Which one are YOU at a party?",
    kind: "survey",
    answers: [
      { label: "The Organiser", image: `${MEDIA}/organiser.webp` },
      { label: "The Entertainer", image: `${MEDIA}/entertainer.webp` },
      { label: "The Photographer", image: `${MEDIA}/photographer.webp` },
      { label: "The Snack Hunter", image: `${MEDIA}/snack-hunter.webp` },
    ],
    demoCounts: [26, 31, 19, 24],
  },
]

const nativeStageCss = [
  motionKitCss,
  stageAdaptationsCss,
  v4FullShowCss,
  v4LayoutCss,
  v4Css,
].join("\n")

const stageQuestion = (q: Question, index: number): StageQuestion => ({
  key: q.key,
  question: q.heading,
  number: index + 1,
  totalQuestions: QUESTIONS.length,
  round: index < 4 ? 1 : 2,
  options: q.answers.map((answer) => ({
    label: answer.label,
    ...(answer.image
      ? { image: answer.image, alt: answer.label, display: "both" as const }
      : {}),
  })),
})

const displayedCounts = (q: Question, selected: number | undefined) =>
  q.demoCounts.map((count, i) => count + (selected === i ? 1 : 0))

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const listener = () => setReduced(query.matches)
    query.addEventListener("change", listener)
    return () => query.removeEventListener("change", listener)
  }, [])
  return reduced
}

export function GreatGuessOffDemo() {
  const stage = useRef<TadazzStageHandle>(null)
  const [phase, setPhase] = useState<Phase>("intro")
  const currentPhase = useRef<Phase>("intro")
  currentPhase.current = phase
  const [questionIndex, setQuestionIndex] = useState(0)
  const [votes, setVotes] = useState<Partial<Record<number, number>>>({})
  const [secondsLeft, setSecondsLeft] = useState(VOTING_SECONDS)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [soundOn, setSoundOn] = useState(true)
  const soundOnRef = useRef(true)
  const [message, setMessage] = useState("")
  const deadlineRef = useRef(0)
  const lockPromiseRef = useRef<Promise<void> | null>(null)
  const sfxRef = useRef<HTMLAudioElement | null>(null)
  const musicRef = useRef<HTMLAudioElement | null>(null)
  const reducedMotion = useReducedMotion()
  const question = QUESTIONS[questionIndex]
  const selected = votes[questionIndex]

  const score = [1, 3].reduce(
    (total, index) =>
      total + (votes[index] === QUESTIONS[index].correct ? 1000 : 0),
    0,
  )
  const leaderboard = useMemo<StageLeaderEntry[]>(
    () =>
      [
        { id: "you", name: "You", score },
        { id: "alex", name: "Alex (sample)", score: 1750 },
        { id: "maya", name: "Maya (sample)", score: 1500 },
        { id: "sam", name: "Sam (sample)", score: 750 },
      ].sort((a, b) => b.score - a.score || (a.id === "you" ? -1 : 1)),
    [score],
  )

  const playSfx = useCallback((url: string | undefined, volume = 0.75) => {
    if (!url || !soundOnRef.current) return
    const audio = sfxRef.current ?? new Audio()
    sfxRef.current = audio
    audio.pause()
    audio.src = url
    audio.volume = volume
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])
  const stopMusic = useCallback(() => {
    musicRef.current?.pause()
  }, [])
  const startMusic = useCallback(() => {
    if (!soundOnRef.current) return
    const audio = musicRef.current ?? new Audio("/sounds/answersMusic.mp3")
    musicRef.current = audio
    audio.loop = true
    audio.volume = 0.28
    audio.currentTime = 0
    void audio.play().catch(() => {})
  }, [])
  const onCue = useCallback(
    (cue: TadazzV4Cue) => {
      playSfx(
        TADAZZ_SFX_BY_CUE[cue.name],
        cue.name.startsWith("timer-") ? 0.45 : 0.78,
      )
    },
    [playSfx],
  )
  const choose = useCallback(
    (index: number) => {
      if (currentPhase.current !== "voting" || busyRef.current) return
      setVotes((previous) => ({ ...previous, [questionIndex]: index }))
      stage.current?.setSelectedOptions([index])
      playSfx(TADAZZ_PHASE_SFX.answerPressed, 0.5)
    },
    [questionIndex, playSfx],
  )
  const toggleSound = () => {
    soundOnRef.current = !soundOnRef.current
    setSoundOn(soundOnRef.current)
    if (!soundOnRef.current) {
      stopMusic()
      sfxRef.current?.pause()
    } else if (currentPhase.current === "voting") {
      startMusic()
    }
  }

  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage("")
    void action()
      .catch(() =>
        setMessage(
          "The stage could not complete that transition. Please restart the sample.",
        ),
      )
      .finally(() => {
        busyRef.current = false
        setBusy(false)
      })
  }

  // This is the SAME native opening composition as the original Creating Worlds game.
  useEffect(() => {
    void stage.current?.showIntro()
    return () => {
      stopMusic()
      sfxRef.current?.pause()
    }
  }, [stopMusic])

  useEffect(() => {
    if (phase !== "voting") return
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      )
      setSecondsLeft(remaining)
      if (remaining === 0 && currentPhase.current === "voting") {
        currentPhase.current = "locked"
        setPhase("locked")
        stopMusic()
        if (QUESTIONS[questionIndex].kind === "survey") {
          lockPromiseRef.current = stage.current?.lockVoting() ?? null
        } else {
          // Trivia reveals the correct answer directly — no locked-vote scene
          // and no survey percentages, including when the 20s clock expires.
          busyRef.current = true
          setBusy(true)
          const q = QUESTIONS[questionIndex]
          void stage.current
            ?.revealResults({
              mode: "quiz",
              counts: q.answers.map(() => 0),
              solutions: [q.correct ?? 0],
              showPercentages: false,
            })
            .then(() => {
              currentPhase.current = "results"
              setPhase("results")
            })
            .catch(() => setMessage("Unable to reveal the correct answer."))
            .finally(() => {
              busyRef.current = false
              setBusy(false)
            })
        }
      }
    }
    const interval = window.setInterval(tick, 160)
    tick()
    return () => window.clearInterval(interval)
  }, [phase, questionIndex, stopMusic])

  const startQuestion = async (index: number) => {
    const handle = stage.current
    if (!handle) return
    setQuestionIndex(index)
    setSecondsLeft(VOTING_SECONDS)
    setPhase("question-transition")
    currentPhase.current = "question-transition"
    const q = stageQuestion(QUESTIONS[index], index)
    await handle.nextQuestion(q) // Native Z-wipe/next-question choreography.
    deadlineRef.current = Date.now() + VOTING_SECONDS * 1000
    currentPhase.current = "voting"
    setPhase("voting")
    // The native countdown Promise resolves only after its actual 20-second sweep.
    // Keep voting interactive while that canonical WAAPI clock runs.
    void handle.openVoting(VOTING_SECONDS, deadlineRef.current).catch(() => {
      setMessage("Unable to start the native voting timer.")
    })
    startMusic()
  }

  const reveal = async () => {
    const handle = stage.current
    if (!handle) return
    const q = QUESTIONS[questionIndex]
    if (currentPhase.current === "voting") {
      currentPhase.current = "locked"
      setPhase("locked")
      stopMusic()
      // Only actual audience surveys have the intermediate Votes Locked scene.
      if (q.kind === "survey") await handle.lockVoting()
    } else if (q.kind === "survey" && lockPromiseRef.current) {
      await lockPromiseRef.current
    }
    await handle.revealResults({
      mode: q.kind,
      counts:
        q.kind === "survey"
          ? displayedCounts(q, votes[questionIndex])
          : q.answers.map(() => 0),
      ...(q.kind === "quiz" ? { solutions: [q.correct ?? 0] } : {}),
      showPercentages: q.kind === "survey",
    })
    currentPhase.current = "results"
    setPhase("results")
  }

  const next = async () => {
    const handle = stage.current
    if (!handle) return
    if (questionIndex === 3) {
      stopMusic()
      playSfx("/sounds/snearRoll.mp3")
      await handle.showLeaderboard(leaderboard)
      setPhase("leaderboard")
    } else if (questionIndex === 4) {
      playSfx("/sounds/snearRoll.mp3")
      await handle.showLeaderboard(leaderboard)
      setPhase("final-leaderboard")
    } else {
      await startQuestion(questionIndex + 1)
    }
  }

  const showTopPick = async () => {
    const q = QUESTIONS[questionIndex]
    const counts = displayedCounts(q, votes[questionIndex])
    const max = Math.max(...counts)
    await stage.current?.showTopPick?.({
      question: stageQuestion(q, questionIndex),
      counts,
      topIndex: counts.indexOf(max),
    })
    setPhase("top-pick")
  }

  const restart = async () => {
    stopMusic()
    setVotes({})
    setQuestionIndex(0)
    setSecondsLeft(VOTING_SECONDS)
    lockPromiseRef.current = null
    await stage.current?.showIntro()
    setPhase("intro")
  }

  const mainButton = (() => {
    if (phase === "intro")
      return {
        title: "Start",
        run: async () => {
          playSfx(TADAZZ_PHASE_SFX.start)
          await stage.current?.showFullShowScene?.("round-one", {
            round: 1,
            eyebrow: "THE GREAT GUESS-OFF",
            title: "ROUND 01",
          })
          setPhase("round-launch")
        },
      }
    if (phase === "round-launch")
      return {
        title: "Start",
        run: () => startQuestion(0),
      }
    if (phase === "voting" || phase === "locked")
      return { title: "Next", run: reveal }
    if (phase === "results" && question.kind === "survey")
      return { title: "Next", run: showTopPick }
    if (phase === "results" || phase === "top-pick")
      return {
        title: "Next",
        run: next,
      }
    if (phase === "leaderboard")
      return {
        title: "Next",
        run: async () => {
          await stage.current?.showFullShowScene?.("grand-finale", { round: 2 })
          setPhase("grand-finale")
        },
      }
    if (phase === "grand-finale")
      return { title: "Next", run: () => startQuestion(4) }
    if (phase === "final-leaderboard")
      return {
        title: "Next",
        run: async () => {
          const winner = leaderboard[0]
          playSfx("/sounds/first.mp3")
          await stage.current?.showFinale({
            name: winner.name,
            score: winner.score,
          })
          setPhase("winner")
        },
      }
    if (phase === "winner")
      return {
        title: "Next",
        run: async () => {
          await stage.current?.playZZWipe()
          await stage.current?.showInterlude?.({
            title: "THANKS FOR PLAYING!",
            subtitle: "THE GREAT GUESS-OFF",
          })
          currentPhase.current = "closing"
          setPhase("closing")
        },
      }
    return { title: "Play again", run: restart }
  })()

  const captions = {
    intro: "The Great Guess-off · Five rounds of surprises",
    "round-launch":
      "Round one: Family Fun, Picture Trivia, At Work and Quick Trivia",
    "question-transition": `Question ${questionIndex + 1} · Get ready to vote`,
    voting: `Question ${questionIndex + 1} of 5 · ${secondsLeft}s remaining`,
    locked: `Question ${questionIndex + 1} of 5 · Time's up`,
    results: `Question ${questionIndex + 1} · Original Tadazz results reveal`,
    "top-pick": "The audience favourite · illustrative sample",
    leaderboard: "Native Tadazz leaderboard · illustrative players",
    "grand-finale": "The grand finale",
    "final-leaderboard": "Final standings · illustrative players",
    winner: "Native Tadazz finale and winner celebration",
    closing: "Thanks for playing The Great Guess-off",
  } satisfies Record<Phase, string>

  return (
    <section
      className="ggo-native"
      data-testid="great-guessoff-demo"
      data-ggo-media={
        question.answers.some((answer) => Boolean(answer.image))
          ? "image"
          : "text"
      }
      data-ggo-mode={question.kind}
      aria-label="The Great Guess-off · Tadazz native stage"
    >
      <style>{nativeStageCss}</style>
      <div
        className="ggo-native-frame"
        data-testid="great-guessoff-native-stage"
      >
        <TadazzV4StageAdapter
          ref={stage}
          v4Labels={{
            ...GUESS_OFF_STAGE_LABELS,
            audienceResults:
              question.kind === "quiz" ? "CORRECT ANSWER" : "AUDIENCE RESULTS",
          }}
          interactive
          onSelectOption={choose}
          onCue={onCue}
          reducedMotion={reducedMotion}
          backdropUrl="/tadazz-show/v4/question-bg.webp"
        />
      </div>
      <div className="ggo-native-console">
        <div className="ggo-native-info">
          <strong>The Great Guess-off</strong>
          <span aria-live="polite">{captions[phase]}</span>
        </div>
        <div className="ggo-native-actions">
          <button
            className="ggo-native-sound"
            type="button"
            aria-label={soundOn ? "Mute game sounds" : "Enable game sounds"}
            aria-pressed={soundOn}
            onClick={toggleSound}
          >
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
            <span>{soundOn ? "Sound on" : "Sound off"}</span>
          </button>
          <button
            type="button"
            className="ggo-native-next"
            disabled={busy}
            onClick={() => run(mainButton.run)}
            data-testid="ggo-main-action"
          >
            {mainButton.title}
            <ArrowRight size={18} />
          </button>
          {phase !== "intro" && (
            <button
              className="ggo-native-sound"
              aria-label="Restart the demo"
              type="button"
              disabled={busy}
              onClick={() => run(restart)}
            >
              <RotateCcw size={17} />
              <span>Restart</span>
            </button>
          )}
        </div>
        {message && (
          <p role="alert" className="ggo-native-error">
            {message}
          </p>
        )}
        <p className="ggo-native-disclaimer">
          Demo only: survey totals and other players are illustrative, not live
          audience data. The stage, 20-second countdown, transitions, reveal and
          winner are Tadazz's original components.
        </p>
      </div>
    </section>
  )
}
