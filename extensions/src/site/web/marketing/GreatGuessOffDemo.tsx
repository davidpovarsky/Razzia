import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { PresentationControls } from "../../../platform-ui"
import { GameViewer } from "../../components/game-viewer/GameViewer"
import {
  CatalogueMobileQuestion,
  useCatalogueMobileControls,
} from "./CatalogueMobileQuestion"
import {
  GuessOffWinnerDecoration,
  TadazzV4StageAdapter,
} from "../../../presentation/tadazz-show/TadazzV4StageAdapter"
import type {
  StageLeaderEntry,
  StageQuestion,
  TadazzStageHandle,
} from "../../../presentation/tadazz-show/TadazzStage"
import type { TadazzV4Cue } from "../../../presentation/tadazz-v4/types"
import { useCatalogueAudio } from "./use-catalogue-audio"
import type { SoundtrackSlotId } from "../../../core/constants"
import { createQuestionLeadIn } from "../../../presentation/question-lead-in"
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
  | "question-transition"
  | "preparing"
  | "question"
  | "voting"
  | "locked"
  | "results"
  | "leaderboard"
  | "winner"
  | "closing"

const soundtrackByPhase: Record<Phase, SoundtrackSlotId> = {
  intro: "lobby",
  "question-transition": "question",
  preparing: "question",
  question: "question",
  voting: "voting",
  locked: "voting",
  results: "results",
  leaderboard: "leaderboard",
  winner: "finale",
  closing: "finale",
}

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
  const [leadIn] = useState(() => createQuestionLeadIn())
  const mounted = useRef(true)
  const [phase, setPhase] = useState<Phase>("intro")
  const currentPhase = useRef<Phase>("intro")
  currentPhase.current = phase
  const [questionIndex, setQuestionIndex] = useState(0)
  const [votes, setVotes] = useState<Partial<Record<number, number>>>({})
  const [secondsLeft, setSecondsLeft] = useState(VOTING_SECONDS)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [soundOn, setSoundOn] = useState(false)
  const [message, setMessage] = useState("")
  const deadlineRef = useRef(0)
  const revealRef = useRef<(chosenIndex?: number) => Promise<void>>(
    async () => {},
  )
  const reducedMotion = useReducedMotion()
  const question = QUESTIONS[questionIndex]
  const selected = votes[questionIndex]
  const compactControls = useCatalogueMobileControls()
  const showMobileQuestion =
    compactControls &&
    (phase === "question" || phase === "voting" || phase === "results")
  const resultCounts = displayedCounts(question, selected)
  const audienceFavourite =
    question.kind === "survey"
      ? question.answers[resultCounts.indexOf(Math.max(...resultCounts))]?.label
      : undefined

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

  const { playEffect, musicUrl } = useCatalogueAudio({
    enabled: soundOn,
    slot: soundtrackByPhase[phase],
    screenKey: [questionIndex, phase].join(":"),
  })
  const onCue = useCallback(
    (cue: TadazzV4Cue) => {
      playEffect(cue.name)
    },
    [playEffect],
  )
  const onQuestionPresented = useCallback(
    (questionKey: string) => {
      if (!mounted.current) {
        return
      }

      leadIn.present(questionKey, () => {
        flushSync(() => {
          currentPhase.current = "question"
          setPhase("question")
        })
      })
    },
    [leadIn],
  )
  const toggleSound = () => setSoundOn((value) => !value)

  const run = (action: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setMessage("")
    void action()
      .catch(() => {
        if (mounted.current) {
          setMessage(
            "The stage could not complete that transition. Please restart the sample.",
          )
        }
      })
      .finally(() => {
        busyRef.current = false

        if (mounted.current) {
          setBusy(false)
        }
      })
  }

  // Restore the original Tadazz opening used before the custom interlock.
  // Every other game scene, result reveal, and finale is preserved.
  const showOpening = () => stage.current?.showIntro()

  useEffect(() => {
    mounted.current = true
    void showOpening()

    return () => {
      mounted.current = false
      leadIn.cancel()
    }
  }, [leadIn])

  useEffect(() => {
    if (phase !== "voting") return
    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadlineRef.current - Date.now()) / 1000),
      )
      setSecondsLeft(remaining)
      if (remaining === 0 && currentPhase.current === "voting") {
        // The deadline advances DIRECTLY to the same result presentation.
        // Never render the separate numbered "Votes Locked" screen.
        currentPhase.current = "locked"
        run(() => revealRef.current())
      }
    }
    const interval = window.setInterval(tick, 160)
    tick()
    return () => window.clearInterval(interval)
  }, [phase, questionIndex])

  const startQuestion = async (index: number) => {
    const handle = stage.current
    if (!handle) return
    setQuestionIndex(index)
    setSecondsLeft(VOTING_SECONDS)
    setPhase("preparing")
    currentPhase.current = "preparing"
    const q = stageQuestion(QUESTIONS[index], index)
    const ready = leadIn.wait(q.key)
    void handle.showQuestion({ ...q, options: [] }).catch(() => {
      leadIn.cancel()

      if (mounted.current) {
        setMessage("Unable to display the question.")
      }
    })
    const opensAt = await ready

    if (!mounted.current || opensAt === null || stage.current !== handle) {
      return
    }

    deadlineRef.current = opensAt + VOTING_SECONDS * 1000
    currentPhase.current = "voting"
    setPhase("voting")
    // The complete answer set and the authoritative timer enter together.
    void handle.openVoting(VOTING_SECONDS, deadlineRef.current, q).catch(() => {
      if (mounted.current) {
        setMessage("Unable to start the native voting timer.")
      }
    })
  }

  const reveal = async (chosenIndex?: number) => {
    const handle = stage.current
    if (!handle) return
    const q = QUESTIONS[questionIndex]
    // Set result presentation BEFORE rendering so "Correct Answer" doesn't
    // first appear in the tiny question font and jump to a larger size.
    currentPhase.current = "results"
    setPhase("results")
    // Render results in place, on the same four cards. No vote-locked scene.
    await handle.revealResults({
      mode: q.kind,
      counts:
        q.kind === "survey"
          ? displayedCounts(q, chosenIndex ?? votes[questionIndex])
          : q.answers.map(() => 0),
      ...(q.kind === "quiz" ? { solutions: [q.correct ?? 0] } : {}),
      showPercentages: q.kind === "survey",
    })
    currentPhase.current = "results"
    setPhase("results")
  }

  revealRef.current = reveal

  // A single tap is a complete vote. It advances straight to results rather
  // than waiting for the remaining 20-second countdown or another button.
  const choose = (index: number) => {
    if (currentPhase.current !== "voting" || busyRef.current) return
    setVotes((previous) => ({ ...previous, [questionIndex]: index }))
    stage.current?.setSelectedOptions([index])
    playEffect("answer-submitted", [questionIndex, "submitted"].join(":"))
    run(() => reveal(index))
  }

  const next = async () => {
    const handle = stage.current
    if (!handle) return
    if (questionIndex === 2) {
      playEffect("phase-leaderboard")
      await handle.showLeaderboard(leaderboard)
      setPhase("leaderboard")
    } else if (questionIndex === 4) {
      const winner = leaderboard[0]
      playEffect("phase-podium1")
      // Show the Z stage backdrop before the native confetti starts: one
      // unified winner reveal, not a separate confetti screen.
      currentPhase.current = "winner"
      setPhase("winner")
      await handle.showFinale({ name: winner.name, score: winner.score })
    } else {
      await startQuestion(questionIndex + 1)
    }
  }

  // Restore the real previous scene, retaining the original vote and score.
  // Back keeps genuine history; the platform Replay control restarts the sample.
  // Only visible scenes are navigable (not transient wipe/locked frames).
  const restoreResult = async (index: number) => {
    const handle = stage.current
    if (!handle) return
    setQuestionIndex(index)
    currentPhase.current = "question-transition"
    setPhase("question-transition")
    const q = QUESTIONS[index]
    await handle.nextQuestion(stageQuestion(q, index))
    await handle.revealResults({
      mode: q.kind,
      counts:
        q.kind === "survey"
          ? displayedCounts(q, votes[index])
          : q.answers.map(() => 0),
      ...(q.kind === "quiz" ? { solutions: [q.correct ?? 0] } : {}),
      showPercentages: q.kind === "survey",
    })
    currentPhase.current = "results"
    setPhase("results")
  }

  const back = async () => {
    const handle = stage.current
    if (!handle || phase === "intro" || phase === "question-transition") return
    if (phase === "closing") {
      const winner = leaderboard[0]
      // Show the Z stage backdrop before the native confetti starts: one
      // unified winner reveal, not a separate confetti screen.
      currentPhase.current = "winner"
      setPhase("winner")
      await handle.showFinale({ name: winner.name, score: winner.score })
      return
    }
    if (phase === "winner") return restoreResult(4)
    if (phase === "leaderboard") return restoreResult(2)
    if (phase === "results") return startQuestion(questionIndex)
    if (phase === "locked" || phase === "voting") {
      if (questionIndex === 0) return restart()
      if (questionIndex === 1) return restoreResult(0)
      if (questionIndex === 2) return restoreResult(1)
      if (questionIndex === 3) {
        await handle.showLeaderboard(leaderboard)
        setQuestionIndex(2)
        currentPhase.current = "leaderboard"
        setPhase("leaderboard")
        return
      }
      return restoreResult(3)
    }
  }

  const restart = async () => {
    leadIn.cancel()
    currentPhase.current = "intro"
    setPhase("intro")
    setVotes({})
    setQuestionIndex(0)
    setSecondsLeft(VOTING_SECONDS)
    await showOpening()
  }

  const mainAction = (() => {
    if (phase === "intro") {
      return () => startQuestion(0)
    }

    if (phase === "voting" || phase === "locked") {
      return reveal
    }

    if (phase === "results") {
      return next
    }

    if (phase === "leaderboard") {
      return () => startQuestion(3)
    }

    if (phase === "winner") {
      return async () => {
        currentPhase.current = "closing"
        setPhase("closing")
        await stage.current?.showFullShowScene?.("grand-finale", { round: 2 })
      }
    }

    return restart
  })()

  const captions = {
    intro: "The Great Guess-off · Five rounds of surprises",
    "question-transition": `Question ${questionIndex + 1} · Get ready to vote`,
    preparing: `Question ${questionIndex + 1} of 5`,
    question: `Question ${questionIndex + 1} of 5`,
    voting: `Question ${questionIndex + 1} of 5 · ${secondsLeft}s remaining`,
    locked: `Question ${questionIndex + 1} of 5 · Time's up`,
    results: `Question ${questionIndex + 1} · ${question.kind === "quiz" ? "Correct answer" : "Audience favourite"}`,
    leaderboard: "Native Tadazz leaderboard · illustrative players",
    winner: "Native Tadazz finale and winner celebration",
    closing: "The Great Guess-off · Final curtain",
  } satisfies Record<Phase, string>

  let nextState: "start" | "replay" | "next" = "next"

  if (phase === "intro") {
    nextState = "start"
  } else if (phase === "closing") {
    nextState = "replay"
  }

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
      data-ggo-phase={phase}
      data-audio-url={musicUrl}
      aria-label="The Great Guess-off · Tadazz native stage"
    >
      <style>{nativeStageCss}</style>
      <GameViewer
        title="The Great Guess-off"
        status={captions[phase]}
        controls={
          <>
            {showMobileQuestion && (
              <CatalogueMobileQuestion
                question={stageQuestion(question, questionIndex)}
                questionType={question.kind}
                voting={phase === "voting"}
                showAnswers={phase !== "question"}
                busy={busy}
                selected={selected}
                correctAnswers={
                  phase === "results" &&
                  question.kind === "quiz" &&
                  question.correct !== undefined
                    ? [question.correct]
                    : undefined
                }
                audienceFavourite={
                  phase === "results" ? audienceFavourite : undefined
                }
                onChoose={choose}
              />
            )}
            <PresentationControls
              previous={{
                disabled:
                  busy ||
                  phase === "intro" ||
                  phase === "question-transition" ||
                  phase === "question",
                onClick: () => run(back),
                testId: "ggo-back-action",
              }}
              next={{
                state: nextState,
                disabled:
                  busy ||
                  phase === "question-transition" ||
                  phase === "question",
                onClick: () => run(mainAction),
                testId: "ggo-main-action",
              }}
              replay={
                phase === "closing"
                  ? undefined
                  : {
                      disabled:
                        busy ||
                        phase === "question-transition" ||
                        phase === "question",
                      onClick: () => run(restart),
                      testId: "ggo-replay",
                    }
              }
              sound={{
                enabled: soundOn,
                onClick: toggleSound,
                testId: "ggo-sound",
              }}
            />
            {message && (
              <p role="alert" className="ggo-native-error">
                {message}
              </p>
            )}
          </>
        }
        details={
          <p className="ggo-native-disclaimer">
            Demo only: survey totals and other players are illustrative, not
            live audience data. The stage, 20-second countdown, transitions,
            reveal and winner are Tadazz's original components.
          </p>
        }
      >
        <div
          className="ggo-native-frame"
          data-testid="great-guessoff-native-stage"
          aria-hidden={showMobileQuestion || undefined}
        >
          <TadazzV4StageAdapter
            ref={stage}
            labels={{
              introCaption: "",
              footer: "TADAZZ! · THE GREAT GUESS-OFF",
            }}
            v4Labels={{
              ...GUESS_OFF_STAGE_LABELS,
              audienceResults:
                question.kind === "quiz"
                  ? "CORRECT ANSWER"
                  : "AUDIENCE FAVOURITE",
              mostChosenAnswer:
                question.kind === "quiz"
                  ? "CORRECT ANSWER"
                  : "THE MOST CHOSEN ANSWER",
            }}
            interactive={!showMobileQuestion}
            onSelectOption={choose}
            onCue={onCue}
            onQuestionPresented={onQuestionPresented}
            reducedMotion={reducedMotion}
            backdropUrl="/tadazz-show/v4/question-bg.webp"
          />
          {phase === "winner" && <GuessOffWinnerDecoration />}
        </div>
      </GameViewer>
    </section>
  )
}
