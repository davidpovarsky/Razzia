import React, { memo, useEffect, useRef, useState } from "react"
import type { ThemeSDK } from "@tadazz/theme-sdk"
import LightRays from "./vendor/LightRays"
import { annotate } from "./vendor/rough-notation.js"
import "./vendor/rough-notation.css"
import { copy } from "./messages"
import "./style.css"

type Snapshot = ThemeSDK["snapshot"]
type DisplaySnapshot = Snapshot & {
  joinPhoneNumber?: string
  lobbyInstructions?: string[]
  roster?: Array<{ id: string; label: string; connected: boolean }>
  questionNumber?: number
  questionCount?: number | null
  cardTitle?: string
  cardKind?: string
  phaseElapsedMs?: number
  finalLeaderboard?: boolean
  revealStage?: "pending" | "audience" | "correct"
}

function Check({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="m5 12 4.5 4.5L19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Brand() {
  return (
    <div className="bms-brand" aria-label="BMS">
      <span>BMS</span>
      <i aria-hidden="true" />
    </div>
  )
}

// The licensed lighting component is mounted once, outside the question family.
// Its settings are fixed across answer/reveal updates, so the stage never re-enters.
const StageLighting = memo(function StageLighting({
  still,
}: {
  still: boolean
}) {
  return (
    <div className="bms-lighting" aria-hidden="true">
      <LightRays
        raysOrigin="top-center"
        raysColor="#8cafef"
        raysSpeed={still ? 0 : 0.18}
        lightSpread={0.58}
        rayLength={2.6}
        rayDensity={1.7}
        raySharpness={0.58}
        glow={0.18}
        haze={0.13}
        atmosphere={0.3}
        intensity={1.1}
        opacity={0.64}
        followMouse={false}
        cursorShadow={false}
        clickPulse={false}
        intro={false}
        pulsating={false}
        maxDevicePixelRatio={1}
      />
    </div>
  )
})

function TitleScene({ s }: { s: DisplaySnapshot }) {
  const mainTitle =
    !s.cardTitle || s.cardTitle === s.title || /quizzical/iu.test(s.cardTitle)
  return (
    <section
      className="bms-scene bms-title-scene"
      data-testid="bms-title-scene"
    >
      <header className="bms-scene-header">
        <Brand />
        <span className="bms-micro">{copy.edition}</span>
      </header>
      {mainTitle ? (
        <h1 className="bms-show-title">
          <span className="bms-title-the">THE MOST</span>
          <span className="bms-title-main">QUIZZICAL</span>
          <span className="bms-title-last">
            <span>QUIZ</span>
            <em>EVER!</em>
          </span>
        </h1>
      ) : (
        <h1 className="bms-transition-title">{s.cardTitle}</h1>
      )}
      <div className="bms-title-baseline" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </section>
  )
}

function RegisterName({
  label,
  connected,
  reducedMotion,
}: {
  label: string
  connected: boolean
  reducedMotion: boolean
}) {
  const name = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!connected || !name.current) return
    const mark = annotate(name.current, {
      type: "highlight",
      color: "#d9e8a4",
      iterations: 1,
      animationDuration: 420,
      animate: !reducedMotion,
      multiline: true,
      padding: [2, 4],
    })
    mark.show()
    return () => mark.remove()
  }, [connected, label, reducedMotion])
  return (
    <span className="bms-register-name" ref={name}>
      {label}
    </span>
  )
}

function AttendanceRegister({ s }: { s: DisplaySnapshot }) {
  const roster = s.roster ?? []
  const connected = roster.filter((player) => player.connected).length
  return (
    <aside
      className="bms-register"
      aria-label={copy.register}
      data-testid="bms-register"
    >
      <header className="bms-register-heading">
        <div>
          <span className="bms-micro">BMS</span>
          <h2>{copy.register}</h2>
        </div>
        <span className="bms-present-count">
          <strong>{connected}</strong> / {roster.length}
          <small>{copy.present}</small>
        </span>
      </header>
      <div className="bms-register-columns" aria-hidden="true">
        <span>{copy.name}</span>
        <span>{copy.present}</span>
      </div>
      <ol className="bms-register-list" data-testid="bms-register-list">
        {roster.map((player, index) => (
          <li
            key={player.id}
            data-connected={player.connected}
            data-player-id={player.id}
          >
            <span className="bms-register-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="bms-register-name-wrap">
              <RegisterName
                label={player.label}
                connected={player.connected}
                reducedMotion={s.reducedMotion}
              />
            </span>
            <span
              className="bms-register-check"
              aria-label={player.connected ? copy.connected : copy.notConnected}
            >
              {player.connected && <Check />}
            </span>
          </li>
        ))}
      </ol>
      <div className="bms-register-footer">
        <span className="bms-register-key">
          <Check />
          {copy.connected}
        </span>
        <span>{copy.register}</span>
      </div>
    </aside>
  )
}

function LobbyScene({ s }: { s: DisplaySnapshot }) {
  const hasRoster = Boolean(s.roster?.length)
  const instructions = (s.lobbyInstructions ?? []).filter(Boolean)
  return (
    <section
      className="bms-scene bms-lobby"
      data-has-roster={hasRoster}
      data-testid="bms-lobby"
    >
      <header className="bms-scene-header">
        <Brand />
        <span className="bms-micro">{copy.joinTheGame}</span>
      </header>
      <div className="bms-lobby-layout">
        <div className="bms-lobby-main">
          <h1>{copy.readyToPlay}</h1>
          <div className="bms-call-panel">
            <span className="bms-call-label">{copy.callToJoin}</span>
            {s.joinPhoneNumber ? (
              <strong
                className="bms-phone"
                dir="ltr"
                data-testid="bms-join-phone"
              >
                {s.joinPhoneNumber}
              </strong>
            ) : (
              <strong className="bms-phone bms-phone-waiting">
                {copy.waitingForNumber}
              </strong>
            )}
          </div>
          {instructions.length > 0 && (
            <section
              className="bms-instructions"
              aria-labelledby="bms-how-to-play"
            >
              <h2 id="bms-how-to-play">{copy.howToPlay}</h2>
              <ol>
                {instructions.map((instruction, index) => (
                  <li key={`${index}-${instruction}`}>
                    <span className="bms-step-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
        {hasRoster && <AttendanceRegister s={s} />}
      </div>
    </section>
  )
}

function QuestionScene({ sdk }: { sdk: ThemeSDK }) {
  const s = sdk.snapshot as DisplaySnapshot
  const [selected, setSelected] = useState<string | null>(null)
  const results = s.phase === "results"
  const audienceRevealed = results && s.revealStage !== "pending"
  const correctnessRevealed =
    results && (s.revealStage === undefined || s.revealStage === "correct")
  const locked = s.phase === "voteLocked" || results
  const seconds = Math.max(0, Math.ceil(s.remainingMs / 1000))
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const count = s.answers.length
  const maximumVotes = Math.max(
    0,
    ...s.answers.map((answer) => answer.votes ?? 0),
  )
  const maximumPercent = Math.max(
    0,
    ...s.answers.map((answer) => answer.percent ?? 0),
  )
  const hasNumber = Number.isInteger(s.questionNumber)
  const density =
    s.question.length > 150
      ? "long"
      : s.question.length > 95
        ? "medium"
        : "normal"
  const answerDensity = s.answers.some((answer) => answer.label.length > 55)
    ? "long"
    : "normal"
  const phaseLabel = s.paused
    ? copy.paused
    : results
      ? copy.results
      : locked
        ? copy.answersLocked
        : selected
          ? copy.answerReceived
          : s.phase === "question"
            ? copy.getReady
            : copy.chooseAnswer
  function submit(id: string) {
    if (!s.canAnswer || selected !== null) return
    setSelected(id)
    sdk.submitAnswer([id])
  }
  return (
    <section
      className="bms-scene bms-quiz"
      data-testid="bms-question-scene"
      data-question-density={density}
      data-answer-density={answerDensity}
      data-answer-count={count}
      data-answers-visible={s.phase !== "question"}
      data-has-image={Boolean(s.questionImage)}
    >
      <header className="bms-scene-header">
        <Brand />
        <div className="bms-round-position">
          <span>{copy.question}</span>
          <strong>
            {hasNumber ? String(s.questionNumber).padStart(2, "0") : "—"}
          </strong>
          {s.questionCount ? <span>/ {s.questionCount}</span> : null}
        </div>
        <div
          className="bms-timer"
          data-urgent={s.phase === "voting" && seconds <= 5 && !s.paused}
          data-locked={locked}
          aria-label={copy.timeRemaining}
        >
          <span className="bms-timer-caption">
            {s.paused ? copy.paused : locked ? copy.locked : copy.time}
          </span>
          <strong>
            {locked ? "00:00" : s.phase === "voting" ? clock : "—:—"}
          </strong>
        </div>
      </header>
      <div className="bms-question-area">
        <h1 className="bms-question" data-testid="package-question" dir="ltr">
          {s.question}
        </h1>
        {s.questionImage && (
          <img className="bms-question-image" src={s.questionImage} alt="" />
        )}
      </div>
      <div className="bms-answer-area">
        <div className="bms-answer-status">
          <span aria-live="polite">{phaseLabel}</span>
          <i aria-hidden="true" />
        </div>
        <div
          className="bms-answers"
          role="group"
          aria-label={copy.answers}
          aria-hidden={s.phase === "question"}
        >
          {s.answers.map((answer, index) => {
            const audience =
              audienceRevealed &&
              (maximumVotes > 0
                ? answer.votes === maximumVotes
                : maximumPercent > 0 && answer.percent === maximumPercent)
            const correct = correctnessRevealed && answer.correct === true
            const picked = selected === answer.id
            return (
              <button
                className="bms-answer"
                type="button"
                key={answer.id}
                data-testid={`package-answer-${answer.id}`}
                data-correct={correct}
                data-audience={audience}
                data-picked={picked}
                data-incorrect={correctnessRevealed && answer.correct === false}
                disabled={
                  !s.canAnswer || selected !== null || s.phase === "question"
                }
                aria-pressed={picked}
                onClick={() => submit(answer.id)}
              >
                <span className="bms-answer-number">{index + 1}</span>
                <span className="bms-answer-content">
                  <span className="bms-answer-badges">
                    {correct && (
                      <span className="bms-correct-label">
                        <Check />
                        {copy.correctAnswer}
                      </span>
                    )}
                    {audience ? (
                      <span className="bms-audience-label">
                        {copy.audienceChoice}
                      </span>
                    ) : (
                      picked && (
                        <span className="bms-picked-label">
                          {copy.yourAnswer}
                        </span>
                      )
                    )}
                  </span>
                  <span className="bms-answer-text">{answer.label}</span>
                </span>
                {answer.image && (
                  <img className="bms-answer-image" src={answer.image} alt="" />
                )}
                <span className="bms-answer-share">
                  {audienceRevealed && answer.percent !== undefined
                    ? `${Math.round(answer.percent)}%`
                    : ""}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <footer className="bms-question-progress" aria-hidden="true">
        <i
          style={{
            width: `${s.questionCount && s.questionNumber ? Math.min(100, (100 * s.questionNumber) / s.questionCount) : 0}%`,
          }}
        />
      </footer>
    </section>
  )
}

function LeaderboardScene({ s }: { s: DisplaySnapshot }) {
  const leaders = s.leaders.slice(0, 5)
  // All standings stay on one screen. The platform owns any podium choreography.
  return (
    <section className="bms-scene bms-scores" data-testid="bms-leaderboard">
      <header className="bms-scene-header">
        <Brand />
        <span className="bms-micro">{copy.edition}</span>
      </header>
      <div className="bms-scores-layout">
        <div className="bms-scores-title">
          <h1>
            {s.finalLeaderboard ? (
              <>
                {copy.final}
                <br />
                <em>{copy.scores}</em>
              </>
            ) : (
              <>
                {copy.top}
                <br />
                <em>{copy.five}</em>
              </>
            )}
          </h1>
        </div>
        <div className="bms-scoreboard">
          <div className="bms-scoreboard-header">
            <span>{copy.player}</span>
            <span>{copy.points}</span>
          </div>
          {leaders.length ? (
            <ol>
              {leaders.map((leader) => (
                <li
                  key={`${leader.rank}-${leader.label}`}
                  data-rank={leader.rank}
                >
                  <span className="bms-leader-rank">
                    {String(leader.rank).padStart(2, "0")}
                  </span>
                  <span className="bms-leader-name">{leader.label}</span>
                  <strong>
                    {Math.round(leader.score).toLocaleString("en-GB")}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="bms-score-empty">{copy.waitingForResults}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function PersonalScene({ s }: { s: DisplaySnapshot }) {
  const result = s.personalResult
  return (
    <section className="bms-scene bms-personal">
      <header className="bms-scene-header">
        <Brand />
      </header>
      <div className="bms-personal-body">
        <h1>
          {result
            ? result.correct
              ? copy.correctAnswer
              : copy.answerRecorded
            : copy.waitingForResults}
        </h1>
        {result && (
          <>
            <strong className="bms-personal-points">
              +{result.points.toLocaleString("en-GB")}
              <span>{copy.points}</span>
            </strong>
            {result.rank > 0 && (
              <p>
                {copy.rank} {result.rank}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

export default function BmsStage(sdk: ThemeSDK) {
  const s = sdk.snapshot as DisplaySnapshot
  const questionFamily = [
    "question",
    "answerCards",
    "voting",
    "voteLocked",
    "results",
  ].includes(s.phase)
  // BMS is an English show. Browser/host UI locale cannot translate this content.
  return (
    <main
      className="bms-stage"
      lang="en-GB"
      dir="ltr"
      data-theme="bms-memory-files"
      data-phase={s.phase}
      data-reduced-motion={s.reducedMotion}
      data-paused={s.paused}
      data-role={s.role}
    >
      <StageLighting still={s.reducedMotion || s.paused} />
      <div className="bms-stage-frame" aria-hidden="true" />
      {questionFamily ? (
        <QuestionScene key={s.questionId} sdk={sdk} />
      ) : s.phase === "lobby" ? (
        <LobbyScene s={s} />
      ) : s.phase === "leaderboard" ? (
        <LeaderboardScene s={s} />
      ) : s.phase === "personalResult" ? (
        <PersonalScene s={s} />
      ) : s.phase === "opening" || s.phase === "closing" ? null : (
        <TitleScene s={s} />
      )}
    </main>
  )
}
