import { useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react"

type Option = { label: string; image?: string }
type Question = {
  category: string
  title: string
  kind: "quiz" | "survey"
  options: readonly Option[]
  correct?: number
  sampleCounts?: readonly number[]
}
type Scene =
  "intro" | "question" | "reveal" | "leaderboard" | "finalResults" | "winner"

const media = "/tadazz-show/great-guessoff"
const questions: readonly Question[] = [
  {
    category: "01 · FAMILY FUN",
    title: "What causes the biggest delay when the whole family is going out?",
    kind: "survey",
    options: [
      { label: "Getting everyone ready" },
      { label: "Finding missing things" },
      { label: "Last-minute changes" },
      { label: "Actually getting out the door" },
    ],
    sampleCounts: [38, 27, 15, 20],
  },
  {
    category: "02 · PICTURE TRIVIA",
    title: "Which of these is actually a berry?",
    kind: "quiz",
    correct: 0,
    options: [
      { label: "Banana", image: `${media}/banana.webp` },
      { label: "Strawberry", image: `${media}/strawberry.webp` },
      { label: "Raspberry", image: `${media}/raspberry.webp` },
      { label: "Cherry", image: `${media}/cherry.webp` },
    ],
  },
  {
    category: "03 · AT WORK",
    title:
      "What's the real reason a five-minute meeting turns into half an hour?",
    kind: "survey",
    options: [
      { label: "“Just one more thing…”" },
      { label: "Technical problems" },
      { label: "Off-topic conversations" },
      { label: "Someone arriving late" },
    ],
    sampleCounts: [46, 18, 25, 11],
  },
  {
    category: "04 · QUICK TRIVIA",
    title: "How many hearts does an octopus have?",
    kind: "quiz",
    correct: 2,
    options: [
      { label: "One" },
      { label: "Two" },
      { label: "Three" },
      { label: "Four" },
    ],
  },
  {
    category: "05 · THE GRAND FINALE",
    title: "Which one are YOU at a party?",
    kind: "survey",
    options: [
      { label: "The Organiser", image: `${media}/organiser.webp` },
      { label: "The Entertainer", image: `${media}/entertainer.webp` },
      { label: "The Photographer", image: `${media}/photographer.webp` },
      { label: "The Snack Hunter", image: `${media}/snack-hunter.webp` },
    ],
    sampleCounts: [26, 31, 19, 24],
  },
]

function percentages(counts: readonly number[], picked: number): number[] {
  const totals = counts.map(
    (value, index) => value + (picked === index ? 1 : 0),
  )
  const sum = totals.reduce((total, value) => total + value, 0)
  const result = totals.map((value) => Math.floor((value / sum) * 100))
  let remainder = 100 - result.reduce((total, value) => total + value, 0)
  for (const index of totals
    .map((_, i) => i)
    .sort((a, b) => totals[b] - totals[a])) {
    if (remainder <= 0) break
    result[index] += 1
    remainder -= 1
  }
  return result
}

export function GreatGuessOffDemo() {
  const [scene, setScene] = useState<Scene>("intro")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Partial<Record<number, number>>>({})
  const [animationKey, setAnimationKey] = useState(0)
  const question = questions[questionIndex]
  const selected = answers[questionIndex]
  const score = [1, 3].reduce(
    (total, index) =>
      total + (answers[index] === questions[index].correct ? 1000 : 0),
    0,
  )
  const ranks = [
    { name: "You", score, me: true },
    { name: "Alex · demo", score: 1750 },
    { name: "Maya · demo", score: 1500 },
    { name: "Sam · demo", score: 750 },
  ].sort((a, b) => b.score - a.score || (a.me ? -1 : 1))
  const champion = ranks[0]

  const restart = () => {
    setAnswers({})
    setQuestionIndex(0)
    setScene("intro")
    setAnimationKey((n) => n + 1)
  }
  const next = () => {
    if (questionIndex === 3) {
      setScene("leaderboard")
    } else if (questionIndex === 4) {
      setScene("finalResults")
    } else {
      setQuestionIndex((n) => n + 1)
      setScene("question")
    }
    setAnimationKey((n) => n + 1)
  }

  const results = (title: string, final: boolean) => (
    <div className="ggo-content ggo-score-scene" key={animationKey}>
      <div className="ggo-eyebrow">
        <Trophy size={17} /> {final ? "THE FINAL RESULTS" : "THE LEADERBOARD"}
      </div>
      <h2 className="ggo-scene-title">{title}</h2>
      <p className="ggo-description">
        Illustrative players and scores · Your trivia answers affect your
        position.
      </p>
      <ol className="ggo-ranks">
        {ranks.map((entry, index) => (
          <li
            key={entry.name}
            className={`ggo-rank ${entry.me ? "ggo-rank-you" : ""}`}
            style={{ animationDelay: `${index * 110}ms` }}
          >
            <span className="ggo-rank-number">{index + 1}</span>
            <span className="ggo-rank-name">{entry.name}</span>
            <strong>{entry.score.toLocaleString()} pts</strong>
          </li>
        ))}
      </ol>
      <button
        className="ggo-primary"
        onClick={() => {
          if (final) setScene("winner")
          else {
            setQuestionIndex(4)
            setScene("question")
          }
          setAnimationKey((n) => n + 1)
        }}
      >
        {final ? "Celebrate the winner" : "Play the grand finale"}{" "}
        <ArrowRight size={18} />
      </button>
    </div>
  )

  return (
    <section
      className="ggo-stage"
      aria-label="The Great Guess-off interactive sample"
      data-testid="great-guessoff-demo"
    >
      <div className="ggo-orb ggo-orb-one" aria-hidden="true" />
      <div className="ggo-orb ggo-orb-two" aria-hidden="true" />
      <div className="ggo-topline">
        <span className="ggo-logo">
          TADAZZ<span>!</span>
        </span>
        <span className="ggo-demo-flag">
          INTERACTIVE SAMPLE · NO LIVE VOTES
        </span>
      </div>

      {scene === "intro" && (
        <div className="ggo-content ggo-intro" key="intro">
          <span className="ggo-eyebrow">
            <Sparkles size={17} /> 5 ROUNDS. ENDLESS SURPRISES.
          </span>
          <h2 className="ggo-hero-title">
            THE GREAT <span>GUESS-OFF</span>
          </h2>
          <p className="ggo-description">
            Family fun, picture trivia, surprising surveys, a live-style
            leaderboard and one grand finale.
          </p>
          <p className="ggo-disclosure">
            Try the whole show. Audience percentages and other players are
            illustrative demo data, not real votes.
          </p>
          <button className="ggo-primary" onClick={() => setScene("question")}>
            <Play size={20} fill="currentColor" /> Start the show
          </button>
        </div>
      )}

      {(scene === "question" || scene === "reveal") && (
        <div
          className="ggo-content ggo-question"
          key={`${questionIndex}-${scene}-${animationKey}`}
        >
          <div className="ggo-question-meta">
            <span>{question.category}</span>
            <span>ROUND {questionIndex + 1} / 5</span>
          </div>
          <h2 className="ggo-question-title">{question.title}</h2>
          <div
            className={`ggo-choices ${question.options.some((option) => option.image) ? "ggo-image-choices" : ""}`}
          >
            {question.options.map((option, index) => {
              const picked = selected === index
              const correct =
                question.kind === "quiz" && question.correct === index
              const votes =
                scene === "reveal" && question.sampleCounts
                  ? percentages(question.sampleCounts, selected ?? -1)[index]
                  : undefined
              return (
                <button
                  type="button"
                  key={option.label}
                  disabled={scene === "reveal"}
                  aria-pressed={picked}
                  className={`ggo-choice ${picked ? "ggo-picked" : ""} ${scene === "reveal" && correct ? "ggo-correct" : ""}`}
                  onClick={() =>
                    setAnswers((current) => ({
                      ...current,
                      [questionIndex]: index,
                    }))
                  }
                >
                  {option.image && (
                    <img src={option.image} alt={option.label} />
                  )}
                  <span className="ggo-choice-text">
                    <b>{String.fromCharCode(65 + index)}</b> {option.label}
                  </span>
                  {votes !== undefined && (
                    <span
                      className="ggo-vote-meter"
                      aria-label={`${votes} percent of sample votes`}
                    >
                      <span
                        className="ggo-vote-fill"
                        style={{ width: `${votes}%` }}
                      />
                      <strong>{votes}%</strong>
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {scene === "question" ? (
            <button
              className="ggo-primary"
              disabled={selected === undefined}
              onClick={() => setScene("reveal")}
            >
              {selected === undefined ? "Choose an answer" : "Reveal results"}{" "}
              <ArrowRight size={18} />
            </button>
          ) : (
            <div className="ggo-reveal-footer">
              <p role="status">
                {question.kind === "survey"
                  ? "Illustrative audience percentages, including your choice."
                  : selected === question.correct
                    ? "Correct! +1,000 points."
                    : `The correct answer is ${question.options[question.correct ?? 0].label}.`}
              </p>
              <button className="ggo-primary" onClick={next}>
                {questionIndex === 3
                  ? "See the leaderboard"
                  : questionIndex === 4
                    ? "Final results"
                    : "Next round"}
                <ArrowRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {scene === "leaderboard" && results("The scores are in!", false)}
      {scene === "finalResults" && results("Who topped the board?", true)}
      {scene === "winner" && (
        <div className="ggo-content ggo-winner" key={animationKey}>
          <div className="ggo-confetti" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: `${(i * 37) % 100}%`,
                  animationDelay: `${(i % 9) * -0.35}s`,
                }}
              />
            ))}
          </div>
          <Crown className="ggo-crown" size={65} strokeWidth={1.6} />
          <span className="ggo-eyebrow">AND THE WINNER IS…</span>
          <h2 className="ggo-winner-name">{champion.name}</h2>
          <p className="ggo-champion-score">
            {champion.score.toLocaleString()} POINTS
          </p>
          <p className="ggo-description">
            Thanks for playing The Great Guess-off!
          </p>
          <button className="ggo-primary" onClick={restart}>
            <RotateCcw size={18} /> Play again
          </button>
        </div>
      )}

      <div className="ggo-bottomline">
        <span>
          {scene === "intro"
            ? "ARE YOU READY?"
            : scene === "winner"
              ? "THAT'S A WRAP!"
              : "THE GREAT GUESS-OFF"}
        </span>
        {scene !== "intro" && scene !== "winner" && (
          <button className="ggo-restart" type="button" onClick={restart}>
            <ArrowLeft size={14} /> Restart
          </button>
        )}
      </div>
    </section>
  )
}
