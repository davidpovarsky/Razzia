import { answerImageTreatmentStyle } from "../../media/answer-image-treatment"
import type { CSSProperties, ReactNode } from "react"
import {
  familyMixupRounds,
  familyMixupExplanations,
  familyMixupSections,
} from "../../core/show-library/family-mixup"
import { PlatformButton } from "../platform-controls"
import { labelsFor } from "../tadazz-v4/components"
import { CountdownValue } from "../tadazz-v4/countdown-value"
import { presentationNote } from "../tadazz-v4/presentation-note"
import { FullShowSceneView, isFullShowScene } from "../tadazz-v4/FullShowScenes"
import {
  percentagesFor,
  topIndicesFor,
  type TadazzV4Data,
  type TadazzV4Scene,
} from "../tadazz-v4/types"
import type { SceneDescriptor } from "../tadazz-show/presentation-scene"

const base = "/tadazz-show/family-mixup"
const pad = (value: number) => String(Math.max(0, value)).padStart(2, "0")
const questions = new Set<TadazzV4Scene>([
  "question",
  "question-image",
  "picture-answers",
  "voting-open",
  "countdown",
  "vote-locked",
  "chosen",
  "survey-results",
])

export function FamilyBrand() {
  return (
    <div className="fm-brand">
      <img src="/tadazz-show/v4/tadazz-brand-logo.png" alt="TADAZZ!" />
      <span>Family Mix-Up!</span>
    </div>
  )
}

export function FamilyEmblem({ hero = false }: { hero?: boolean }) {
  return (
    <div
      className={`fm-emblem ${hero ? "fm-emblem-hero" : ""}`}
      aria-hidden="true"
    >
      <img src={`${base}/family-emblem.webp`} alt="" />
      <i className="fm-plinth" />
    </div>
  )
}

export function FamilyFrame({
  children,
  dark = false,
  className = "",
}: {
  children: ReactNode
  dark?: boolean
  className?: string
}) {
  return (
    <div
      className={`fm-world ${dark ? "fm-dark" : ""} ${className}`}
      data-original-layout="family-studio"
    >
      {dark && (
        <img
          className="fm-dark-backdrop"
          src={`${base}/stage-finale.webp`}
          alt=""
          aria-hidden="true"
        />
      )}
      <FamilyBrand />
      {children}
    </div>
  )
}

function FamilyClock({
  data,
  scene,
  motionOwned,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
  motionOwned: boolean
}) {
  if (scene !== "countdown") return null
  const seconds = Math.ceil(
    Math.max(0, data.remainingSeconds ?? data.seconds ?? 0),
  )
  return (
    <div
      className="fm-clock countdown-floater"
      data-v4="countdown-floater"
      aria-label={labelsFor(data).timeLeft}
    >
      <span className="fm-clock-time">
        <span aria-hidden="true">00:</span>
        <CountdownValue
          as="span"
          value={pad(seconds)}
          motionOwned={motionOwned}
        />
      </span>
      <span className="countdown-ring">
        <svg viewBox="0 0 170 170" aria-hidden="true">
          <circle className="timer-track" cx="85" cy="85" r="73" />
          <circle className="timer-progress" cx="85" cy="85" r="73" />
        </svg>
      </span>
    </div>
  )
}

function FamilyAnswers({
  data,
  scene,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
}) {
  const answers = (data.answers ?? []).slice(0, 5)
  const labels = labelsFor(data)
  const result =
    scene === "survey-results" ||
    (scene === "chosen" &&
      Boolean(data.counts?.length || data.percentages?.length))
  const quiz = result && data.mode === "quiz" && Boolean(data.solutions?.length)
  const percentages = percentagesFor(data, answers.length)
  const favourites = result ? topIndicesFor(data, answers.length) : []
  const selected = new Set(
    data.selectedIndices ??
      (data.selectedIndex === null || data.selectedIndex === undefined
        ? []
        : [data.selectedIndex]),
  )
  const interactive = Boolean(
    data.interactive && !result && !["chosen", "vote-locked"].includes(scene),
  )
  const tag = quiz
    ? labels.correctAnswer
    : favourites.length > 1
      ? labels.jointAudienceFavourite
      : labels.audienceFavourite
  return (
    <div
      className={`fm-answers answers ${data.questionImage ? "photo-options" : ""}`}
      data-v4="answer-cards"
      data-count={answers.length}
      data-images={answers.some((a) => a.imageUrl) ? "true" : "false"}
      data-results={result ? "true" : "false"}
      role={interactive ? "group" : undefined}
    >
      {answers.map((answer, index) => {
        const winner = favourites.includes(index)
        const label =
          answer.title || answer.alt || `${labels.choiceLabel} ${index + 1}`
        const percent = Math.round(percentages[index])
        return (
          <PlatformButton
            key={index}
            type="button"
            size="sm"
            classNameContent="contents"
            disabled={!interactive}
            className={`fm-choice choice-slot tz-card ${interactive ? "is-selectable" : ""} ${data.questionImage ? "photo-option" : ""} ${winner ? "is-favourite" : ""} ${quiz && winner ? "is-correct" : ""} ${quiz && !winner ? "is-incorrect" : ""} ${selected.has(index) ? "is-selected" : ""}`}
            data-v4-choice={index}
            data-index={index}
            data-testid={`tadazz-card-${index}`}
            data-multi={data.multiSelect ? "true" : undefined}
            aria-label={[
              label,
              selected.has(index) ? labels.choiceSelected : "",
              winner ? tag : "",
              result && data.showPercentages !== false ? `${percent}%` : "",
            ]
              .filter(Boolean)
              .join(", ")}
            aria-pressed={interactive ? selected.has(index) : undefined}
            onClick={
              interactive ? () => data.onSelectOption?.(index) : undefined
            }
          >
            <span className="fm-choice-number answer-index" aria-hidden="true">
              {index + 1}
            </span>
            <span className="fm-choice-body answer-card">
              {answer.imageUrl && (
                <img
                  className="fm-answer-image answer-image"
                  src={answer.imageUrl}
                  style={answerImageTreatmentStyle(answer.imageTreatment)}
                  alt={answer.alt ?? label}
                  decoding="async"
                />
              )}
              {!(answer.display === "image" && answer.imageUrl) && (
                <span
                  className="fm-answer-title answer-title"
                  dir="auto"
                  style={
                    {
                      "--fm-answer-size": `${label.length > 90 ? 24 : label.length > 50 ? 28 : 34}px`,
                    } as CSSProperties
                  }
                >
                  {label}
                </span>
              )}
              <span className="fm-result-line">
                <span
                  className="result-percentage tz-result-number"
                  data-target-percentage={percent}
                  style={{
                    visibility:
                      result && data.showPercentages !== false
                        ? "visible"
                        : "hidden",
                  }}
                >
                  {result && data.showPercentages !== false
                    ? `${percent}%`
                    : ""}
                </span>
                <span
                  className="winner-tag tz-winner-tag"
                  style={{
                    visibility: winner ? "visible" : "hidden",
                    opacity: winner ? 1 : 0,
                  }}
                >
                  {winner ? tag : ""}
                </span>
              </span>
              <span
                className="result-track tz-result-track"
                style={{ opacity: result ? 1 : 0 }}
              >
                <span
                  className="result-track-fill tz-result-fill"
                  style={{
                    transform: `scaleX(${result ? Math.max(0.003, percentages[index] / 100) : 0})`,
                  }}
                />
              </span>
            </span>
          </PlatformButton>
        )
      })}
    </div>
  )
}

function FamilyQuestion({
  data,
  scene,
  motionOwned,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
  motionOwned: boolean
}) {
  const question = data.questionImageText ?? data.question ?? ""
  const images = (data.answers ?? []).some((a) => a.imageUrl)
  const hasPicture = Boolean(data.questionImage)
  const results = scene === "survey-results"
  const labels = labelsFor(data)
  const authoredQuestion = results
    ? familyMixupRounds.find(
        (card) =>
          card.question === question &&
          card.answers.every(
            (answer, index) => answer.text === data.answers?.[index]?.title,
          ),
      )
    : undefined
  const note = results
    ? presentationNote(data.note) ||
      (authoredQuestion ? familyMixupExplanations[authoredQuestion.key] : "") ||
      ""
    : ""
  const size =
    question.length > 180
      ? 41
      : question.length > 110
        ? 49
        : question.length > 65
          ? 60
          : 74
  let status = labels.votingOpen
  if (scene === "question") status = labels.focus
  if (scene === "chosen") status = labels.choiceSelected
  if (scene === "vote-locked") status = labels.votesLocked
  if (results)
    status =
      data.mode === "quiz" ? labels.correctAnswer : labels.audienceResults
  return (
    <FamilyFrame
      className={`fm-question-world ${hasPicture ? "fm-with-picture" : ""} ${images ? "fm-with-answer-images" : ""}`}
    >
      {data.showQuestionNumber !== false && data.number ? (
        <div className="fm-round-pill">
          {data.mode === "survey" ? "FAMILY SURVEY" : labels.questionLabel}{" "}
          <b>{pad(data.number)}</b>
          {data.totalQuestions ? (
            <span>/ {pad(data.totalQuestions)}</span>
          ) : null}
        </div>
      ) : null}
      <FamilyClock data={data} scene={scene} motionOwned={motionOwned} />
      <section
        className={`fm-question q-frame ${hasPicture ? "photo-question-panel" : ""}`}
        data-v4="question-frame"
        data-testid="tadazz-question-panel"
        data-has-picture={hasPicture ? "true" : "false"}
        data-answer-count={data.answerCount ?? data.answers?.length}
      >
        <h2
          className="fm-question-text q-text"
          dir="auto"
          style={{ "--fm-question-size": `${size}px` } as CSSProperties}
        >
          {question}
        </h2>
        {data.questionImage && (
          <img
            className="fm-question-image photo-question-img"
            src={data.questionImage}
            alt={data.photoAlt ?? "Question illustration"}
          />
        )}
      </section>
      {scene !== "question" && <FamilyAnswers data={data} scene={scene} />}
      <FamilyEmblem />
      <div className="fm-buzzer" aria-hidden="true">
        <i />
      </div>
      <div className="fm-status" role="status" data-testid="tadazz-status">
        {status}
      </div>
      {note && (
        <p
          className="fm-result-note"
          data-testid="tadazz-question-note"
          dir="auto"
        >
          {note}
        </p>
      )}
    </FamilyFrame>
  )
}

export function FamilyMixupEvent({ scene }: { scene: SceneDescriptor }) {
  const opening = scene.kind === "opening"
  const familyOpening =
    opening && (!scene.title || scene.title === "The Great Family Mix-Up!")
  const finale =
    scene.id?.includes("round-6") || scene.title === "The Mega Finale"
  const closing = scene.kind === "closing"
  // Native installation replaces authored keys with UUIDs; titles persist.
  const canonicalRound =
    (familyMixupSections as readonly string[]).indexOf(scene.title ?? "") + 1
  const round =
    scene.roundNumber ??
    scene.round ??
    Number(scene.id?.match(/round-(\d+)/)?.[1] ?? canonicalRound)
  return (
    <FamilyFrame
      dark={finale}
      className={`fm-event ${opening ? "fm-opening" : ""} ${closing ? "fm-closing" : ""}`}
    >
      <section className="fm-event-copy interlude-panel">
        <span className="fm-event-eyebrow interlude-mini">
          {opening
            ? "THE GREAT"
            : closing
              ? "THAT'S A WRAP"
              : round
                ? `ROUND ${pad(round)}`
                : "FAMILY MIX-UP!"}
        </span>
        <h1 className="fm-event-title interlude-title" dir="auto">
          {familyOpening ? (
            <>
              Family
              <br />
              <em>Mix-Up!</em>
            </>
          ) : (
            scene.title
          )}
        </h1>
        {(scene.subtitle || scene.description) && (
          <p className="fm-event-sub interlude-sub" dir="auto">
            {scene.subtitle || scene.description}
          </p>
        )}
        {familyOpening && (
          <div className="fm-event-rule">
            <span>6 rounds</span>
            <i />
            <span>48 questions</span>
            <i />
            <span>One family champion</span>
          </div>
        )}
      </section>
      <FamilyEmblem hero />
      <div className="fm-buzzer" aria-hidden="true">
        <i />
      </div>
      {closing && (
        <div className="fm-closing-line">Same family. New bragging rights.</div>
      )}
    </FamilyFrame>
  )
}

function FamilyLeaderboard({ data }: { data: TadazzV4Data }) {
  const labels = labelsFor(data)
  const entries = data.teams ?? []
  const offset = entries.length > 4 ? Math.max(0, data.page ?? 0) * 4 : 0
  const final = /champion|final/i.test(data.title ?? "")
  return (
    <FamilyFrame
      dark={final}
      className={`fm-leaderboard ${final ? "fm-winner" : ""}`}
    >
      <header className="fm-board-heading leader-head">
        <span>{final ? "THE RESULTS ARE IN" : labels.liveStandings}</span>
        <h2>{data.title || labels.leaderboard}</h2>
      </header>
      <section
        className="fm-board leader-board"
        data-testid="tadazz-leaderboard-screen"
        data-total-entries={entries.length}
      >
        {entries.slice(offset, offset + 4).map((entry, index) => (
          <div
            className={`fm-team team-row tz-leader-row ${offset + index === 0 ? "fm-first" : ""}`}
            key={entry.id ?? index}
            data-id={entry.id ?? String(offset + index)}
          >
            <span className="fm-rank team-rank tz-rank">
              {pad(offset + index + 1)}
            </span>
            <strong className="team-name tz-team-name" dir="auto">
              {entry.name}
            </strong>
            <span className="team-score tz-team-score">
              {entry.score.toLocaleString()}
              <small>{labels.points}</small>
            </span>
          </div>
        ))}
        {!entries.length && (
          <p className="fm-empty">
            {data.emptyMessage ||
              "Scores will appear after the first scored question."}
          </p>
        )}
      </section>
      <FamilyEmblem hero />
    </FamilyFrame>
  )
}

export function FamilyMixupScene({
  scene,
  data,
  motionOwnsCountdownText = false,
}: {
  scene: TadazzV4Scene
  data: TadazzV4Data
  motionOwnsCountdownText?: boolean
}) {
  if (questions.has(scene))
    return (
      <FamilyQuestion
        data={data}
        scene={scene}
        motionOwned={motionOwnsCountdownText}
      />
    )
  if (scene === "leaderboard") return <FamilyLeaderboard data={data} />
  if (scene === "interlude")
    return (
      <FamilyMixupEvent
        scene={{
          kind: "transition",
          title: data.title,
          subtitle: data.subtitle,
          round: data.round,
        }}
      />
    )
  if (isFullShowScene(scene))
    return (
      <FamilyFrame className="fm-native-event">
        <FullShowSceneView scene={scene} data={data} />
      </FamilyFrame>
    )
  if (scene === "top-pick") {
    const indices =
      data.topIndex !== undefined && data.topIndex !== null
        ? [data.topIndex]
        : topIndicesFor(data, data.answers?.length ?? 0)
    const answer = indices.length === 1 ? data.answers?.[indices[0]] : undefined
    return (
      <FamilyMixupEvent
        scene={{
          kind: "transition",
          title: answer?.title || data.emptyMessage || labelsFor(data).noVotes,
          subtitle: labelsFor(data).audienceFavourite,
        }}
      />
    )
  }
  return (
    <FamilyMixupEvent
      scene={{ kind: "transition", title: data.title, subtitle: data.subtitle }}
    />
  )
}

export function FamilyMixupWinner({
  name,
  score,
  title,
  points,
}: {
  name?: string
  score?: number
  title: string
  points?: string
}) {
  return (
    <FamilyFrame dark className="fm-champion">
      <section className="fm-event-copy">
        <span className="fm-event-eyebrow">{title}</span>
        <h1
          className="fm-event-title"
          data-testid="tadazz-winner-name"
          dir="auto"
        >
          {name || "Thanks for playing!"}
        </h1>
        {score !== undefined && (
          <div className="fm-champion-score">
            {score.toLocaleString()}
            <small>{points || "POINTS"}</small>
          </div>
        )}
      </section>
      <FamilyEmblem hero />
    </FamilyFrame>
  )
}
