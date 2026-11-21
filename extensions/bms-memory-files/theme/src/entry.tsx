import React, { useState } from "react"
import type { ThemeSDK } from "@tadazz/theme-sdk"
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
        className="bms-check-path"
        d="m5 12.5 4.6 4.6L19.2 7.5"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function StarIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 1.8 14.7 8.4l7.1.6-5.4 4.6 1.7 6.9L12 16.8l-6.1 3.7 1.7-6.9L2.2 9l7.1-.6L12 1.8Z" />
    </svg>
  )
}

function CrownIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M3 18h18v2H3v-2Zm0-2L1.5 6.5 7 10.5 12 4l5 6.5 5.5-4L21 16H3Z" />
    </svg>
  )
}

function Brand() {
  return (
    <div className="bms-brand" aria-label="BMS The Memory Files">
      <b>BMS</b>
      <span>THE MEMORY FILES</span>
    </div>
  )
}

function ArchiveFolder({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`bms-folder-stack ${compact ? "bms-folder-compact" : ""}`}
      aria-hidden="true"
    >
      <div className="bms-folder-tab" />
      <div className="bms-folder-back" />
      <div className="bms-folder-page bms-folder-page-2" />
      <div className="bms-folder-page" />
      <div className="bms-folder-front">
        <span className="bms-folder-tag">ARCHIVE</span>
        <span className="bms-folder-stamp">
          BMS
          <br />
          CLASS
          <br />
          FILES
        </span>
        <span className="bms-folder-sheen" />
      </div>
      <div className="bms-sticker">
        CLASS
        <br />
        REUNION
        <br />✦
      </div>
    </div>
  )
}

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

      </header>
      <div className="bms-title-body">
        <div className="bms-title-copy">
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
        </div>
        <div className="bms-title-art">


          <ArchiveFolder />
        </div>
      </div>
    </section>
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
      <span className="bms-tape bms-tape-register" aria-hidden="true" />
      <header className="bms-register-heading">
        <h2>{copy.register}</h2>
        <span className="bms-present-pill">
          <strong>{connected}</strong>
          <span>/ {roster.length}</span>
        </span>
      </header>
      <ol className="bms-register-list" data-testid="bms-register-list">
        {roster.map((player, index) => (
          <li
            key={player.id}
            data-connected={player.connected}
            data-player-id={player.id}
            style={{ "--row-i": index } as React.CSSProperties}
          >
            <span className="bms-register-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="bms-register-name">{player.label}</span>
            <span
              className="bms-register-check"
              aria-label={player.connected ? copy.connected : copy.notConnected}
            >
              {player.connected && <Check />}
            </span>
          </li>
        ))}
      </ol>
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
        <span className="bms-pill-tag">{copy.joinTheGame}</span>
      </header>
      <div className="bms-lobby-layout">
        <article className="bms-join-paper">
          <span className="bms-tape bms-tape-top" aria-hidden="true" />
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
            <ol className="bms-steps" aria-label={copy.howToPlay}>
              {instructions.map((instruction, index) => (
                <li
                  key={`${index}-${instruction}`}
                  style={{ "--step-i": index } as React.CSSProperties}
                >
                  <span className="bms-step-num">{index + 1}</span>
                  <span>{instruction}</span>
                </li>
              ))}
            </ol>
          )}
        </article>
        {hasRoster ? (
          <AttendanceRegister s={s} />
        ) : (
          <div className="bms-lobby-art">
            <ArchiveFolder />
          </div>
        )}
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
      data-photo-sheet={s.answers.some((answer) => Boolean(answer.image))}
      data-answers-visible={s.phase !== "question"}
      data-audience-revealed={audienceRevealed}
      data-correct-revealed={correctnessRevealed}
      data-has-image={Boolean(s.questionImage)}
    >
      <header className="bms-scene-header">
        <Brand />
        <div className="bms-round-pill">
          <span>{copy.question}</span>
          <strong>
            {hasNumber ? String(s.questionNumber).padStart(2, "0") : "—"}
          </strong>
          {s.questionCount ? <small>/ {s.questionCount}</small> : null}
        </div>
        <div
          className="bms-timer"
          data-urgent={s.phase === "voting" && seconds <= 5 && !s.paused}
          data-locked={locked}
          aria-label={copy.timeRemaining}
        >
          <strong>
            {locked ? "00:00" : s.phase === "voting" ? clock : "—:—"}
          </strong>
        </div>
      </header>

      <article className="bms-question-paper">
        <span className="bms-tape bms-tape-q" aria-hidden="true" />
        <h1 className="bms-question" data-testid="package-question" dir="ltr">
          {s.question}
        </h1>
        {s.questionImage && (
          <img className="bms-question-image" src={s.questionImage} alt="" />
        )}
      </article>

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
          const incorrect = correctnessRevealed && answer.correct === false
          const picked = selected === answer.id
          const share =
            audienceRevealed && answer.percent !== undefined
              ? Math.max(0, Math.min(100, Math.round(answer.percent)))
              : 0

          return (
            <button
              className="bms-answer"
              type="button"
              key={answer.id}
              data-testid={`package-answer-${answer.id}`}
              data-correct={correct}
              data-audience={audience}
              data-picked={picked}
              data-incorrect={incorrect}
              style={
                {
                  "--ans-i": index,
                  "--share": `${share}%`,
                } as React.CSSProperties
              }
              disabled={
                !s.canAnswer || selected !== null || s.phase === "question"
              }
              aria-pressed={picked}
              onClick={() => submit(answer.id)}
            >
              <span className="bms-answer-bar" aria-hidden="true" />
              <span className="bms-answer-number">
                {correct ? <Check className="bms-win-check" /> : index + 1}
              </span>
              <span className="bms-answer-content">
                {(correct || audience || picked) && (
                  <span className="bms-answer-badges">
                    {correct && (
                      <span className="bms-badge bms-badge-correct">
                        <Check />
                        {copy.correctAnswer}
                      </span>
                    )}
                    {audience && (
                      <span className="bms-badge bms-badge-audience">
                        {copy.audienceChoice}
                      </span>
                    )}
                    {!audience && picked && (
                      <span className="bms-badge bms-badge-picked">
                        {copy.yourAnswer}
                      </span>
                    )}
                  </span>
                )}
                <span className="bms-answer-text">{answer.label}</span>
              </span>
              {answer.image && (
                <img className="bms-answer-image" src={answer.image} alt="" />
              )}
              {audienceRevealed && answer.percent !== undefined && (
                <span className="bms-answer-share">{share}%</span>
              )}
              {correct && (
                <span className="bms-burst" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
            </button>
          )
        })}
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
  return (
    <section className="bms-scene bms-scores" data-testid="bms-leaderboard">
      <header className="bms-scene-header">
        <Brand />
        <span className="bms-pill-tag">
          {s.finalLeaderboard ? copy.finalStandings : copy.leaderboard}
        </span>
      </header>
      <div className="bms-scores-layout">
        <div className="bms-scores-left">
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
          <ArchiveFolder compact />
        </div>
        <article className="bms-score-paper">
          <span className="bms-tape bms-tape-score" aria-hidden="true" />
          {leaders.length ? (
            <ol className="bms-leaders">
              {leaders.map((leader, idx) => (
                <li
                  key={`${leader.rank}-${leader.label}`}
                  className="bms-score-entry"
                  data-rank={leader.rank}
                  style={
                    {
                      "--rank-delay": `${(leaders.length - 1 - idx) * 140 + 120}ms`,
                    } as React.CSSProperties
                  }
                >
                  <span className="bms-rank">
                    {leader.rank === 1 ? (
                      <CrownIcon className="bms-crown" />
                    ) : (
                      leader.rank
                    )}
                  </span>
                  <span className="bms-leader-name">{leader.label}</span>
                  <strong className="bms-leader-score">
                    {Math.round(leader.score).toLocaleString("en-GB")}
                  </strong>
                </li>
              ))}
            </ol>
          ) : (
            <p className="bms-score-empty">{copy.waitingForResults}</p>
          )}
        </article>
      </div>
    </section>
  )
}

function ClosingScene({ s }: { s: DisplaySnapshot }) {
  return (
    <section className="bms-scene bms-finale" data-testid="bms-closing">
      <div className="bms-confetti" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="bms-finale-inner">
        <div className="bms-rosette" aria-hidden="true">
          <StarIcon className="bms-rosette-star" />
        </div>
        <h1 className="bms-finale-title">{s.cardTitle || "THANK YOU"}</h1>
        <span className="bms-pill-tag bms-finale-tag">{copy.edition}</span>
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
      <article className="bms-personal-paper">
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
              <p className="bms-personal-rank">
                {copy.rank} #{result.rank}
              </p>
            )}
          </>
        )}
      </article>
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

      {questionFamily ? (
        <QuestionScene key={s.questionId} sdk={sdk} />
      ) : s.phase === "lobby" ? (
        <LobbyScene s={s} />
      ) : s.phase === "leaderboard" ? (
        <LeaderboardScene s={s} />
      ) : s.phase === "personalResult" ? (
        <PersonalScene s={s} />
      ) : s.phase === "closing" ? (
        <ClosingScene s={s} />
      ) : s.phase === "opening" ? null : (
        <TitleScene s={s} />
      )}
    </main>
  )
}
