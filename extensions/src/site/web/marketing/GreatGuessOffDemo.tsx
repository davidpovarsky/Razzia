import { useEffect, useRef, useState } from "react"
import { ArrowRight, RotateCcw, Trophy, Play, CheckCircle2 } from "lucide-react"
import guessoffStyles from "./GreatGuessOffDemo.css?inline"

type Choice = { text: string; image?: string }
type Question = {
  kicker: string
  title: string
  type: "survey" | "quiz"
  correct?: number
  sampleVotes?: number[]
  answers: Choice[]
}
type Screen = "intro" | "question" | "midboard" | "finalboard" | "winner"

const image = (name: string) =>
  "/tadazz-design-reference/great-guessoff-" + name + ".webp"
const questions: Question[] = [
  {
    kicker: "01 · Family Fun",
    title: "What causes the biggest delay when the whole family is going out?",
    type: "survey",
    sampleVotes: [17, 11, 8, 14],
    answers: [
      { text: "Getting everyone ready" },
      { text: "Finding missing things" },
      { text: "Last-minute changes" },
      { text: "Actually getting out the door" },
    ],
  },
  {
    kicker: "02 · Picture Trivia",
    title: "Which of these is actually a berry?",
    type: "quiz",
    correct: 0,
    answers: [
      { text: "Banana", image: image("banana") },
      { text: "Strawberry", image: image("strawberry") },
      { text: "Raspberry", image: image("raspberry") },
      { text: "Cherry", image: image("cherry") },
    ],
  },
  {
    kicker: "03 · At Work",
    title:
      "What's the real reason a five-minute meeting turns into half an hour?",
    type: "survey",
    sampleVotes: [22, 8, 15, 7],
    answers: [
      { text: '"Just one more thing..."' },
      { text: "Technical problems" },
      { text: "Off-topic conversations" },
      { text: "Someone arriving late" },
    ],
  },
  {
    kicker: "04 · Quick Trivia",
    title: "How many hearts does an octopus have?",
    type: "quiz",
    correct: 2,
    answers: [
      { text: "One" },
      { text: "Two" },
      { text: "Three" },
      { text: "Four" },
    ],
  },
  {
    kicker: "05 · The Grand Finale",
    title: "Which one are YOU at a party?",
    type: "survey",
    sampleVotes: [14, 19, 11, 16],
    answers: [
      { text: "The Organiser", image: image("organiser") },
      { text: "The Entertainer", image: image("entertainer") },
      { text: "The Photographer", image: image("photographer") },
      { text: "The Snack Hunter", image: image("snack-hunter") },
    ],
  },
]

const samplePlayers = [
  { name: "Alex", score: 1500 },
  { name: "Sam", score: 1000 },
  { name: "Jordan", score: 500 },
]
const letters = ["A", "B", "C", "D"]

function demoLeaders(score: number, midgame: boolean) {
  const players = midgame
    ? samplePlayers
    : samplePlayers.map((player, i) => ({
        ...player,
        score: [1700, 1200, 800][i],
      }))
  return [...players, { name: "You", score }].sort(
    (a, b) => b.score - a.score || a.name.localeCompare(b.name),
  )
}

export function GreatGuessOffDemo() {
  const stageRef = useRef<HTMLElement>(null)
  const [screen, setScreen] = useState<Screen>("intro")
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selection, setSelection] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [score, setScore] = useState(0)
  const question = questions[questionIndex]

  useEffect(() => {
    if (screen !== "intro") {
      stageRef.current?.scrollIntoView({ block: "start", behavior: "instant" })
    }
  }, [screen, questionIndex])

  const restart = () => {
    setScreen("intro")
    setQuestionIndex(0)
    setSelection(null)
    setRevealed(false)
    setScore(0)
  }

  const start = () => setScreen("question")
  const reveal = () => {
    if (selection === null || revealed) return
    if (question.type === "quiz" && selection === question.correct) {
      setScore((current) => current + 1000)
    }
    setRevealed(true)
  }
  const advance = () => {
    setSelection(null)
    setRevealed(false)
    if (questionIndex === 3) {
      setScreen("midboard")
    } else if (questionIndex === 4) {
      setScreen("finalboard")
    } else {
      setQuestionIndex((current) => current + 1)
    }
  }
  const totals = (question.sampleVotes || []).map(
    (votes, i) => votes + (selection === i ? 1 : 0),
  )
  const totalVotes = totals.reduce((sum, n) => sum + n, 0)
  const percentages = totals.map((n) => Math.round((n / totalVotes) * 100))
  const showBoard = screen === "midboard" || screen === "finalboard"
  const leaders = demoLeaders(score, screen === "midboard")
  const finalLeaders = demoLeaders(score, false)
  const champion = finalLeaders[0]
  return (
    <section
      className="tz-guessoff"
      ref={stageRef}
      dir="ltr"
      aria-label="The Great Guess-off interactive demo"
    >
      <style>{guessoffStyles}</style>
      <div className="tz-guessoff-shine" aria-hidden="true" />
      <div className="tz-guessoff-header">
        <div className="tz-guessoff-brand">
          <span className="tz-guessoff-brand-icon">Z!</span> TADAZZ{" "}
          <span className="tz-guessoff-demo-tag">DEMO</span>
        </div>
        <span className="tz-guessoff-progress">
          {screen === "intro"
            ? "5 fun questions"
            : "Your score · " + score.toLocaleString() + " pts"}
        </span>
      </div>

      {screen === "intro" && (
        <div className="tz-guessoff-center tz-guessoff-intro">
          <div className="tz-guessoff-orb" aria-hidden="true">
            ?
          </div>
          <p className="tz-guessoff-eyebrow">WELCOME TO THE SHOW</p>
          <h2>
            The Great <em>Guess-off!</em>
          </h2>
          <p>
            Two trivia challenges. Three audience surveys. One spectacular
            finale.
          </p>
          <button type="button" className="tz-guessoff-primary" onClick={start}>
            <Play size={20} fill="currentColor" /> Start playing{" "}
            <ArrowRight size={20} />
          </button>
          <span className="tz-guessoff-disclaimer">
            Instant solo demo · No account needed · Results are simulated
          </span>
        </div>
      )}

      {screen === "question" && (
        <div className="tz-guessoff-question-screen">
          <div className="tz-guessoff-question-top">
            <span className="tz-guessoff-eyebrow">{question.kicker}</span>
            <span className="tz-guessoff-count">
              QUESTION {questionIndex + 1} / {questions.length}
            </span>
          </div>
          <h2>{question.title}</h2>
          <div
            className={
              "tz-guessoff-options" +
              (question.answers.some((a) => a.image) ? " with-images" : "")
            }
          >
            {question.answers.map((option, i) => {
              const correct =
                question.type === "quiz" && revealed && question.correct === i
              return (
                <button
                  type="button"
                  key={option.text}
                  className={
                    "tz-guessoff-option" +
                    (selection === i ? " selected" : "") +
                    (correct ? " correct" : "")
                  }
                  onClick={() => {
                    if (!revealed) setSelection(i)
                  }}
                  aria-pressed={selection === i}
                  disabled={revealed}
                >
                  {option.image && (
                    <img
                      src={option.image}
                      alt={option.text}
                      loading={questionIndex === 1 ? "eager" : "lazy"}
                    />
                  )}
                  <span className="tz-guessoff-answer-label">
                    <b>{letters[i]}</b> {option.text}
                  </span>
                  {correct && (
                    <CheckCircle2
                      className="tz-guessoff-check"
                      size={19}
                      aria-label="Correct answer"
                    />
                  )}
                </button>
              )
            })}
          </div>

          {revealed && (
            <div
              className="tz-guessoff-reveal"
              role="status"
              aria-live="polite"
            >
              {question.type === "survey" ? (
                <>
                  <div className="tz-guessoff-reveal-title">
                    Here's how the audience voted!
                  </div>
                  <div className="tz-guessoff-percentages">
                    {question.answers.map((a, i) => (
                      <div className="tz-guessoff-result-row" key={a.text}>
                        <span>
                          {letters[i]}. {a.text}
                        </span>
                        <span>{percentages[i]}%</span>
                        <div className="tz-guessoff-result-track">
                          <i style={{ width: percentages[i] + "%" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <small>
                    Sample votes are simulated, including your choice. No live
                    participants.
                  </small>
                </>
              ) : (
                <div className="tz-guessoff-feedback">
                  <span>
                    {selection === question.correct
                      ? "🎉 You got it! +1,000 points"
                      : "Nice guess! The correct answer is " +
                        question.answers[question.correct || 0].text +
                        "."}
                  </span>
                  {questionIndex === 1 && (
                    <small>
                      Botanically speaking, bananas are true berries.
                      Strawberries and raspberries are not.
                    </small>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="tz-guessoff-bottom">
            <span>
              {question.type === "survey"
                ? "No wrong answers — everyone's opinion counts."
                : "Choose the correct answer to earn points."}
            </span>
            {!revealed ? (
              <button
                type="button"
                className="tz-guessoff-primary"
                disabled={selection === null}
                onClick={reveal}
              >
                Reveal answer <ArrowRight size={19} />
              </button>
            ) : (
              <button
                type="button"
                className="tz-guessoff-primary"
                onClick={advance}
              >
                {questionIndex === 4
                  ? "Final results"
                  : questionIndex === 3
                    ? "See the leaderboard"
                    : "Next question"}{" "}
                <ArrowRight size={19} />
              </button>
            )}
          </div>
        </div>
      )}

      {showBoard && (
        <div className="tz-guessoff-center tz-guessoff-board">
          <Trophy size={38} className="tz-guessoff-trophy" aria-hidden="true" />
          <p className="tz-guessoff-eyebrow">
            {screen === "midboard"
              ? "HALFTIME HIGHLIGHTS"
              : "THE RESULTS ARE IN"}
          </p>
          <h2>
            {screen === "midboard" ? "The leaderboard!" : "Final rankings!"}
          </h2>
          <div className="tz-guessoff-ranking">
            {leaders.map((person, i) => (
              <div
                className={
                  "tz-guessoff-leader" + (person.name === "You" ? " you" : "")
                }
                key={person.name}
              >
                <span className="tz-guessoff-medal">
                  {["🥇", "🥈", "🥉", "4"][i]}
                </span>
                <strong>{person.name}</strong>
                <span>{person.score.toLocaleString()} pts</span>
              </div>
            ))}
          </div>
          <p className="tz-guessoff-disclaimer">
            Sample competitors and scores are simulated.
          </p>
          <button
            type="button"
            className="tz-guessoff-primary"
            onClick={() => {
              if (screen === "midboard") {
                setQuestionIndex(4)
                setScreen("question")
              } else {
                setScreen("winner")
              }
            }}
          >
            {screen === "midboard"
              ? "Go to the grand finale"
              : "Reveal the winner"}{" "}
            <ArrowRight size={20} />
          </button>
        </div>
      )}

      {screen === "winner" && (
        <div className="tz-guessoff-center tz-guessoff-winner">
          <div className="tz-guessoff-confetti" aria-hidden="true">
            {Array.from({ length: 26 }, (_, i) => (
              <i
                key={i}
                style={{
                  left: ((i * 37) % 94) + "%",
                  animationDelay: (i % 8) * -0.35 + "s",
                }}
              />
            ))}
          </div>
          <div className="tz-guessoff-crown" aria-hidden="true">
            👑
          </div>
          <p className="tz-guessoff-eyebrow">AND THE WINNER IS...</p>
          <h2>{champion.name === "You" ? "YOU!" : champion.name + "!"}</h2>
          <p className="tz-guessoff-winning-score">
            {champion.score.toLocaleString()} POINTS
          </p>
          <p>What a show! Thanks for playing The Great Guess-off.</p>
          <small className="tz-guessoff-disclaimer">
            Demo winner and competing scores are simulated.
          </small>
          <button
            type="button"
            className="tz-guessoff-primary"
            onClick={restart}
          >
            <RotateCcw size={19} /> Play again
          </button>
        </div>
      )}
    </section>
  )
}
