import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { OriginalThemeId } from "../../core/show-themes/original-theme-families"
import { showThemeText } from "../../core/show-themes/definition"
import { PlatformButton } from "../platform-controls"
import { themeAdapterAsset, useOptionalShowTheme } from "../show-themes/context"
import { FullShowSceneView, isFullShowScene } from "../tadazz-v4/FullShowScenes"
import { labelsFor } from "../tadazz-v4/components"
import { CountdownValue } from "../tadazz-v4/countdown-value"
import { presentationNote } from "../tadazz-v4/presentation-note"
import {
  percentagesFor,
  topIndicesFor,
  type TadazzV4Data,
  type TadazzV4Scene,
} from "../tadazz-v4/types"

interface WorldParts {
  identity: ReactNode
  question: ReactNode
  answers: ReactNode
  clock: ReactNode
  status: ReactNode
}

// Each first-party family owns its composition. The slots all consume the same
// already-authorized view; none of these components can advance or score a game.
function RoyalQuiz(parts: WorldParts) {
  return (
    <div className="og-world og-royal" data-original-layout="royal-proscenium">
      <div className="og-proscenium" aria-hidden="true">
        <i />
        <i />
        <span />
      </div>
      <header className="og-identity">{parts.identity}</header>
      <div className="og-royal-plaque">{parts.question}</div>
      <div className="og-royal-rails">{parts.answers}</div>
      <aside className="og-clock-dock">{parts.clock}</aside>
      <footer className="og-status-dock">{parts.status}</footer>
    </div>
  )
}

function NeonArcade(parts: WorldParts) {
  return (
    <div className="og-world og-neon" data-original-layout="arcade-console">
      <div className="og-neon-grid" aria-hidden="true" />
      <header className="og-identity">{parts.identity}</header>
      <div className="og-terminal">
        <div className="og-terminal-lamps" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        {parts.question}
        <footer>{parts.status}</footer>
      </div>
      <section className="og-neon-deck">{parts.answers}</section>
      <aside className="og-clock-dock">{parts.clock}</aside>
      <div className="og-neon-corner" aria-hidden="true" />
    </div>
  )
}

function RetroTV(parts: WorldParts) {
  return (
    <div className="og-world og-retro" data-original-layout="retro-television">
      <div className="og-retro-wall" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="og-identity">{parts.identity}</header>
      <div className="og-television">
        <section className="og-tv-glass">
          {parts.question}
          {parts.answers}
        </section>
        <aside className="og-tv-controls">
          <div className="og-tv-dial" aria-hidden="true" />
          {parts.clock}
          <div className="og-tv-speaker" aria-hidden="true" />
        </aside>
      </div>
      <footer className="og-status-dock">{parts.status}</footer>
    </div>
  )
}

function MagicStorybook(parts: WorldParts) {
  return (
    <div className="og-world og-book" data-original-layout="storybook-spread">
      <div className="og-book-stars" aria-hidden="true">
        <i>✦</i>
        <i>✧</i>
        <i>✦</i>
      </div>
      <header className="og-identity">{parts.identity}</header>
      <article className="og-open-book">
        <section className="og-book-page og-page-story">
          <div className="og-book-ornament" aria-hidden="true">
            ✦
          </div>
          {parts.question}
          {parts.status}
        </section>
        <span className="og-book-binding" aria-hidden="true" />
        <section className="og-book-page og-page-choices">
          {parts.answers}
        </section>
      </article>
      <aside className="og-clock-dock">{parts.clock}</aside>
    </div>
  )
}

function CrystalFuture(parts: WorldParts) {
  return (
    <div
      className="og-world og-crystal"
      data-original-layout="crystal-observatory"
    >
      <div className="og-crystal-orbits" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <header className="og-identity">{parts.identity}</header>
      <div className="og-crystal-core">{parts.question}</div>
      <section className="og-crystal-satellites">{parts.answers}</section>
      <aside className="og-clock-dock">{parts.clock}</aside>
      <footer className="og-status-dock">{parts.status}</footer>
    </div>
  )
}

function CarnivalPop(parts: WorldParts) {
  return (
    <div
      className="og-world og-carnival"
      data-original-layout="carnival-ticket-booth"
    >
      <div className="og-carnival-scallops" aria-hidden="true" />
      <header className="og-identity">{parts.identity}</header>
      <div className="og-carnival-marquee">
        <span className="og-marquee-pin" aria-hidden="true" />
        {parts.question}
        <span className="og-marquee-pin" aria-hidden="true" />
      </div>
      <section className="og-carnival-tickets">{parts.answers}</section>
      <div className="og-carnival-floor" aria-hidden="true" />
      <aside className="og-clock-dock">{parts.clock}</aside>
      <footer className="og-status-dock">{parts.status}</footer>
    </div>
  )
}

function SportsArena(parts: WorldParts) {
  return (
    <div className="og-world og-sports" data-original-layout="arena-scoreboard">
      <div className="og-arena-lines" aria-hidden="true">
        <i />
        <i />
      </div>
      <header className="og-scoreboard-header">
        {parts.identity}
        <aside>{parts.clock}</aside>
      </header>
      <section className="og-arena-play">
        <div className="og-arena-question">{parts.question}</div>
        <section className="og-arena-lanes">{parts.answers}</section>
      </section>
      <footer className="og-arena-ticker">{parts.status}</footer>
    </div>
  )
}

function MysteryNoir(parts: WorldParts) {
  return (
    <div className="og-world og-noir" data-original-layout="noir-evidence-desk">
      <div className="og-noir-blinds" aria-hidden="true" />
      <header className="og-identity">{parts.identity}</header>
      <section className="og-case-file">
        <div className="og-file-tab" aria-hidden="true" />
        {parts.question}
        <footer>{parts.status}</footer>
      </section>
      <section className="og-evidence-board">{parts.answers}</section>
      <aside className="og-clock-dock">{parts.clock}</aside>
    </div>
  )
}

const worlds = {
  "royal-quiz": RoyalQuiz,
  "neon-arcade": NeonArcade,
  "retro-tv": RetroTV,
  "magic-storybook": MagicStorybook,
  "crystal-future": CrystalFuture,
  "carnival-pop": CarnivalPop,
  "sports-arena": SportsArena,
  "mystery-noir": MysteryNoir,
} satisfies Record<OriginalThemeId, (parts: WorldParts) => ReactNode>

const questionScenes = new Set<TadazzV4Scene>([
  "question",
  "question-image",
  "picture-answers",
  "voting-open",
  "countdown",
  "vote-locked",
  "chosen",
  "survey-results",
])
const pad = (value: number) => String(Math.max(0, value)).padStart(2, "0")

function Identity({ data }: { data: TadazzV4Data }) {
  const theme = useOptionalShowTheme()
  const { i18n } = useTranslation()
  const labels = labelsFor(data)
  const title = theme
    ? showThemeText(
        theme.definition,
        theme.definition.nameKey,
        i18n.language,
        () => "TADAZZ!",
      )
    : "TADAZZ!"

  return (
    <>
      <div className="og-brand">
        <img
          src={
            themeAdapterAsset(theme, "brandLogo") ??
            "/tadazz-show/v4/tadazz-brand-logo.png"
          }
          alt="TADAZZ!"
        />
        <span>{title}</span>
      </div>
      {data.showQuestionNumber !== false && data.number ? (
        <span className="og-round">
          {labels.questionLabel} <b>{pad(data.number)}</b>
          {data.totalQuestions ? (
            <small> / {pad(data.totalQuestions)}</small>
          ) : null}
        </span>
      ) : null}
    </>
  )
}

function Question({ data }: { data: TadazzV4Data }) {
  // The same element and geometry survive every phase; results labels belong
  // exclusively to answers. Do not use a phase-dependent eyebrow/font size.
  const question = data.questionImageText ?? data.question ?? ""
  let textSize = 72

  if (question.length > 180) {
    textSize = 42
  } else if (question.length > 100) {
    textSize = 51
  } else if (question.length > 60) {
    textSize = 60
  }

  return (
    <section
      className={[
        "og-question q-frame",
        data.questionImage && "photo-question-panel",
      ]
        .filter(Boolean)
        .join(" ")}
      data-v4="question-frame"
      data-testid="tadazz-question-panel"
      data-has-picture={data.questionImage ? "true" : "false"}
      data-answer-count={data.answerCount ?? data.answers?.length}
    >
      <div className="og-question-rule" aria-hidden="true" />
      <h2
        className="og-question-text q-text"
        dir="auto"
        style={{ "--og-question-size": `${textSize}px` } as CSSProperties}
      >
        {question}
      </h2>
      {data.questionImage ? (
        <img
          className="og-question-image photo-question-img"
          src={data.questionImage}
          alt={data.photoAlt ?? ""}
        />
      ) : null}
    </section>
  )
}

function Answers({
  data,
  scene,
  recap = false,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
  recap?: boolean
}) {
  const source = recap ? (data.winners ?? []) : (data.answers ?? [])
  const page = Math.max(0, data.page ?? 0)
  const offset = recap ? page * 6 : 0
  const answers = recap ? source.slice(offset, offset + 6) : source.slice(0, 5)
  const labels = labelsFor(data)
  const results =
    !recap &&
    (scene === "survey-results" ||
      (scene === "chosen" &&
        Boolean(data.counts?.length || data.percentages?.length)))
  const isQuiz =
    results && data.mode === "quiz" && Boolean(data.solutions?.length)
  const percentages = percentagesFor(data, answers.length)
  const winners = results ? topIndicesFor(data, answers.length) : []
  const selected = new Set(
    data.selectedIndices ??
      (data.selectedIndex === null || data.selectedIndex === undefined
        ? []
        : [data.selectedIndex]),
  )
  const interactive = Boolean(
    !recap &&
    !results &&
    !["chosen", "vote-locked"].includes(scene) &&
    data.interactive,
  )
  let tag = labels.audienceFavourite

  if (isQuiz) {
    tag = labels.correctAnswer
  } else if (winners.length > 1) {
    tag = labels.jointAudienceFavourite
  }

  return (
    <div
      className={["og-answers answers", data.questionImage && "photo-options"]
        .filter(Boolean)
        .join(" ")}
      style={
        { "--og-answer-count": Math.max(1, answers.length) } as CSSProperties
      }
      data-count={answers.length}
      data-images={answers.some((answer) => answer.imageUrl) ? "true" : "false"}
      data-v4="answer-cards"
      role={interactive ? "group" : undefined}
    >
      {answers.map((answer, index) => {
        const winner = winners.includes(index)
        const label =
          answer.title || answer.alt || `${labels.choiceLabel} ${index + 1}`
        let textSize = 33

        if (label.length > 90) {
          textSize = 23
        } else if (label.length > 50) {
          textSize = 27
        }

        const accessibleLabel = [
          label,
          selected.has(index) ? labels.choiceSelected : "",
          winner ? tag : "",
          results && data.showPercentages !== false
            ? `${Math.round(percentages[index])}%`
            : "",
        ]
          .filter(Boolean)
          .join(", ")

        return (
          <PlatformButton
            key={index}
            type="button"
            size="sm"
            classNameContent="contents"
            disabled={!interactive}
            className={[
              "og-choice choice-slot tz-card",
              data.questionImage && "photo-option",
              winner && "is-favourite",
              winner && isQuiz && "is-correct",
              !winner && isQuiz && "is-incorrect",
              selected.has(index) && "is-selected",
              interactive && "is-selectable",
            ]
              .filter(Boolean)
              .join(" ")}
            data-v4-choice={index}
            data-index={index}
            data-testid={`tadazz-card-${index}`}
            data-multi={data.multiSelect ? "true" : undefined}
            aria-label={accessibleLabel}
            aria-pressed={interactive ? selected.has(index) : undefined}
            onClick={
              interactive ? () => data.onSelectOption?.(index) : undefined
            }
          >
            <span className="og-choice-number answer-index" aria-hidden="true">
              {pad(offset + index + 1)}
            </span>
            <span className="og-choice-body answer-card">
              {answer.imageUrl ? (
                <img
                  className="og-choice-image answer-image"
                  src={answer.imageUrl}
                  alt={answer.alt ?? label}
                  loading="eager"
                  decoding="async"
                />
              ) : null}
              {answer.display === "image" && answer.imageUrl ? null : (
                <span
                  className="og-choice-title answer-title"
                  dir="auto"
                  style={
                    {
                      "--og-answer-size": `${textSize}px`,
                    } as CSSProperties
                  }
                >
                  {label}
                </span>
              )}
              <span className="og-choice-result">
                <span
                  className="result-percentage tz-result-number"
                  data-target-percentage={Math.round(percentages[index])}
                  style={{
                    visibility:
                      results && data.showPercentages !== false
                        ? "visible"
                        : "hidden",
                  }}
                >
                  {results && data.showPercentages !== false
                    ? `${Math.round(percentages[index])}%`
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
                style={{ opacity: results ? 1 : 0 }}
              >
                <span
                  className="result-track-fill tz-result-fill"
                  style={{
                    transform: `scaleX(${results ? Math.max(0.003, percentages[index] / 100) : 0})`,
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

function Clock({
  data,
  scene,
  motionOwnsCountdownText = false,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
  motionOwnsCountdownText?: boolean
}) {
  if (scene !== "countdown") {
    return null
  }

  const labels = labelsFor(data)

  return (
    <div className="og-clock countdown-floater" data-v4="countdown-floater">
      <span className="countdown-label">{labels.timeLeft}</span>
      <span className="countdown-ring">
        <svg viewBox="0 0 170 170" aria-hidden="true">
          <circle className="timer-track" cx="85" cy="85" r="73" />
          <circle className="timer-progress" cx="85" cy="85" r="73" />
        </svg>
      </span>
      <CountdownValue
        as="span"
        value={pad(
          Math.ceil(Math.max(0, data.remainingSeconds ?? data.seconds ?? 0)),
        )}
        motionOwned={motionOwnsCountdownText}
      />
    </div>
  )
}

function Status({ data, scene }: { data: TadazzV4Data; scene: TadazzV4Scene }) {
  const labels = labelsFor(data)
  let text = labels.votingOpen

  if (scene === "question") {
    text = labels.focus
  } else if (scene === "chosen") {
    text = labels.choiceSelected
  } else if (scene === "vote-locked") {
    text = labels.votesLocked
  } else if (scene === "survey-results") {
    text = data.mode === "quiz" ? labels.correctAnswer : labels.audienceResults
  }

  // Result labels are already attached to each winning answer. The invisible
  // live region announces state without printing another label on the question.
  const note = scene === "survey-results" ? presentationNote(data.note) : ""

  return (
    <div className="og-status-wrap">
      <div
        className={[
          "og-status",
          scene === "survey-results" && "og-status-announcement",
        ]
          .filter(Boolean)
          .join(" ")}
        data-testid="tadazz-status"
        role="status"
      >
        {text}
      </div>
      {note ? (
        <div
          className="og-result-note"
          data-testid="tadazz-question-note"
          dir="auto"
        >
          {note}
        </div>
      ) : null}
    </div>
  )
}

function OriginalLeaderboard({ data }: { data: TadazzV4Data }) {
  const labels = labelsFor(data)
  const entries = data.teams ?? []
  const page = Math.max(0, data.page ?? 0)
  const offset = entries.length > 4 ? page * 4 : 0
  const rows = entries.slice(offset, offset + 4)

  return (
    <section
      className="og-leaderboard"
      data-testid="tadazz-leaderboard-screen"
      data-total-entries={entries.length}
    >
      <header className="leader-head">
        <span>{labels.liveStandings}</span>
        <h2>
          {data.title ||
            (data.teamMode === false
              ? labels.leaderboard
              : labels.teamLeaderboard)}
        </h2>
      </header>
      <div className="og-board leader-board">
        {rows.map((entry, index) => (
          <div
            key={entry.id ?? offset + index}
            className="og-leader team-row tz-leader-row"
            data-id={entry.id ?? String(offset + index + 1)}
          >
            <span className="og-rank team-rank tz-rank">
              {pad(offset + index + 1)}
            </span>
            <strong className="team-name tz-team-name" dir="auto">
              {entry.name}
            </strong>
            <span className="team-score tz-team-score">
              {entry.score}
              <small>{labels.points}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function OriginalInterlude({ data }: { data: TadazzV4Data }) {
  const labels = labelsFor(data)

  return (
    <section
      className="og-interlude interlude-panel"
      data-testid="tadazz-screen-interlude"
    >
      <span className="og-scene-symbol" aria-hidden="true">
        ✦
      </span>
      <span className="interlude-mini">{data.eyebrow ?? labels.upNext}</span>
      <h2 className="interlude-title" dir="auto">
        {data.title ?? ""}
      </h2>
      <div className="interlude-rule" />
      {data.subtitle ? (
        <p className="interlude-sub" dir="auto">
          {data.subtitle}
        </p>
      ) : null}
    </section>
  )
}

function OriginalTopPick({ data }: { data: TadazzV4Data }) {
  const labels = labelsFor(data)
  const answers = data.answers ?? []
  const indices =
    data.topIndex !== undefined && data.topIndex !== null
      ? [data.topIndex]
      : topIndicesFor(data, answers.length)
  const winner = indices.length === 1 ? answers[indices[0]] : null

  return (
    <section className="og-spotlight">
      <span className="spotlight-top">{labels.mostChosenAnswer}</span>
      {winner?.imageUrl ? (
        <img
          className="og-spotlight-image spotlight-portrait"
          src={winner.imageUrl}
          alt={winner.alt ?? winner.title}
        />
      ) : (
        <span className="og-scene-symbol spotlight-portrait" aria-hidden="true">
          ✦
        </span>
      )}
      <h2
        className="spotlight-name"
        data-testid="tadazz-top-pick-name"
        dir="auto"
      >
        {winner?.title ||
          data.emptyMessage ||
          (indices.length > 1 ? labels.jointAudienceFavourite : labels.noVotes)}
      </h2>
    </section>
  )
}

function OriginalRecap({ data }: { data: TadazzV4Data }) {
  const title = data.title || labelsFor(data).roundRecap
  let titleSize = data.subtitle ? 48 : 66

  if (title.length > 50) {
    titleSize = 36
  }

  const subtitleSize = (data.subtitle?.length ?? 0) > 100 ? 22 : 28

  return (
    <section className="og-recap" data-testid="tadazz-screen-recap">
      <header
        className="og-recap-heading"
        style={
          {
            "--og-recap-title-size": `${titleSize}px`,
            "--og-recap-subtitle-size": `${subtitleSize}px`,
          } as CSSProperties
        }
      >
        <h2 className="story-finale" dir="auto">
          {title}
        </h2>
        {data.subtitle ? (
          <p className="og-recap-subtitle" dir="auto">
            {data.subtitle}
          </p>
        ) : null}
      </header>
      <Answers data={data} scene="round-recap" recap />
      <div className="story-connection" />
    </section>
  )
}

export function OriginalThemeAtmosphere({
  family,
}: {
  family: OriginalThemeId
}) {
  return (
    <div className={`og-atmosphere og-atmosphere-${family}`} aria-hidden="true">
      <div className="og-halo og-halo-one" />
      <div className="og-halo og-halo-two" />
      <div className="og-texture" />
    </div>
  )
}

export function OriginalThemeScene({
  family,
  scene,
  data,
  motionOwnsCountdownText = false,
}: {
  family: OriginalThemeId
  scene: TadazzV4Scene
  data: TadazzV4Data
  motionOwnsCountdownText?: boolean
}) {
  const World = worlds[family]

  if (questionScenes.has(scene)) {
    return (
      <World
        identity={<Identity data={data} />}
        question={<Question data={data} />}
        answers={
          scene === "question" ? null : <Answers data={data} scene={scene} />
        }
        clock={
          <Clock
            data={data}
            scene={scene}
            motionOwnsCountdownText={motionOwnsCountdownText}
          />
        }
        status={<Status data={data} scene={scene} />}
      />
    )
  }

  if (isFullShowScene(scene)) {
    // Specialized phone/directory/story interactions retain the existing public
    // binding and platform-owned ceremony. The family supplies its stage frame.
    return (
      <div
        className="og-full-show full-show-root"
        data-original-layout={`${family}-event`}
        data-full-show-scene={scene}
      >
        <FullShowSceneView scene={scene} data={data} />
      </div>
    )
  }

  return (
    <div
      className={`og-world og-event og-event-${family}`}
      data-original-layout={`${family}-event`}
    >
      <header className="og-identity">
        <Identity data={{ ...data, showQuestionNumber: false }} />
      </header>
      {scene === "leaderboard" ? <OriginalLeaderboard data={data} /> : null}
      {scene === "top-pick" ? <OriginalTopPick data={data} /> : null}
      {scene === "interlude" ? <OriginalInterlude data={data} /> : null}
      {scene === "round-recap" ? <OriginalRecap data={data} /> : null}
      {scene === "z-wipe" ? (
        <>
          <div className="wipe" />
          <div className="wipe second" />
        </>
      ) : null}
    </div>
  )
}
