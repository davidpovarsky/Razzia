import {
  FullShowSceneView,
  isFullShowScene,
  type FullShowInput,
} from "./FullShowScenes"
import type { CSSProperties } from "react"
import {
  TADAZZ_V4_ASSET_BASE,
  TADAZZ_V4_LABELS,
  TADAZZ_V4_SHOW_SCENES,
  percentagesFor,
  topIndicesFor,
  type TadazzV4Answer,
  type TadazzV4Data,
  type TadazzV4Labels,
  type TadazzV4Scene,
} from "./types"

function asset(base: string, name: string) {
  return `${base || TADAZZ_V4_ASSET_BASE}${name}`
}
const id2 = (n: number) => String(Math.max(0, n)).padStart(2, "0")
export function labelsFor(data: TadazzV4Data): TadazzV4Labels {
  return { ...TADAZZ_V4_LABELS, ...(data.labels ?? {}) }
}
export function StageIdentityV4({
  data,
  scene,
  assetBase,
}: {
  data: TadazzV4Data
  scene: TadazzV4Scene
  assetBase: string
}) {
  if (scene === "z-wipe" || scene === "interlude") return null
  const number = Math.max(1, data.number ?? 1)
  const round = Math.max(1, data.round ?? 1)
  const detail =
    data.showQuestionNumber === false
      ? ""
      : ` · QUESTION ${id2(number)}${data.totalQuestions ? ` / ${data.totalQuestions}` : ""}`
  return (
    <>
      <div className="stage-identity">
        <img
          className="stage-brand-logo"
          src={asset(assetBase, "tadazz-brand-logo.png")}
          alt="TADAZZ!"
        />
      </div>
      <div className="stage-round-pill">
        ROUND {id2(round)}
        {detail}
      </div>
    </>
  )
}
export function QuestionFrameV4({
  data,
  results = false,
}: {
  data: TadazzV4Data
  results?: boolean
}) {
  const tx = labelsFor(data)
  const question = data.question ?? ""
  const size = question.length > 65 ? 49 : question.length > 48 ? 56 : undefined
  return (
    <div
      className="q-frame"
      data-v4="question-frame"
      data-testid="tadazz-question-panel"
    >
      <div className="eyebrow">
        {data.eyebrow || (results ? tx.audienceResults : tx.nextQuestion)}
      </div>
      <div className="q-text" style={size ? { fontSize: size } : undefined}>
        {question}
      </div>
      {data.note && results && (
        <div className="q-note" data-testid="tadazz-question-note">
          {data.note}
        </div>
      )}
    </div>
  )
}
export interface AnswerSlotProps {
  answer: TadazzV4Answer
  index: number
  result?: boolean
  percentage?: number
  favourite?: boolean
  correct?: boolean
  incorrect?: boolean
  tie?: boolean
  selected?: boolean
  interactive?: boolean
  multiSelect?: boolean
  onSelect?: (index: number) => void
  showPercentages?: boolean
  recap?: boolean
  assetBase?: string
  labels?: Partial<TadazzV4Labels>
}
export function AnswerSlotV4({
  answer,
  index,
  result,
  percentage = 0,
  favourite,
  correct,
  incorrect,
  tie,
  selected,
  interactive,
  multiSelect,
  onSelect,
  showPercentages = true,
  recap = false,
  labels = {},
}: AnswerSlotProps) {
  const tx = { ...TADAZZ_V4_LABELS, ...labels }
  const displayTitle =
    answer.title ||
    answer.alt ||
    (answer as { label?: string }).label ||
    (recap ? `Choice ${index + 1}` : "")
  const slotClasses = [
    "choice-slot",
    "tz-card",
    !result && "is-vote-open",
    favourite && "is-favourite",
    correct && "is-correct",
    incorrect && "is-incorrect",
    selected && "is-selected",
    interactive && "is-selectable",
  ]
    .filter(Boolean)
    .join(" ")
  const tagText = correct
    ? tx.correctAnswer
    : tie
      ? tx.jointAudienceFavourite
      : tx.audienceFavourite
  const roundedPct = Math.round(percentage)
  const isResultActive = Boolean(result && showPercentages)
  const pctText = isResultActive ? `${roundedPct}%` : ""
  return (
    <div
      className={slotClasses}
      data-v4-choice={index}
      data-index={index}
      data-testid={`tadazz-card-${index}`}
      data-multi={multiSelect ? "true" : undefined}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? Boolean(selected) : undefined}
      aria-label={
        interactive
          ? `${String.fromCharCode(65 + index)} ${displayTitle}`
          : undefined
      }
      onClick={interactive ? () => onSelect?.(index) : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onSelect?.(index)
              }
            }
          : undefined
      }
    >
      <article className="answer-card">
        <figure className="answer-figure">
          <div
            className={`tz-photo-frame${answer.imageUrl ? "" : " tz-photo-empty"}`}
          >
            {answer.imageUrl ? (
              <img
                className="answer-image"
                src={answer.imageUrl}
                alt={answer.alt ?? displayTitle}
                loading="eager"
                decoding="async"
              />
            ) : (
              <div
                className="answer-image answer-image-empty"
                aria-label={answer.alt ?? displayTitle}
              >
                <span className="answer-monogram" aria-hidden="true">
                  {index + 1}
                </span>
              </div>
            )}
          </div>
          <figcaption
            className="answer-title"
            style={
              displayTitle.length > 28
                ? { fontSize: 21 }
                : displayTitle.length > 16
                  ? { fontSize: 25 }
                  : undefined
            }
            data-has-caption={displayTitle ? "true" : "false"}
            dir="auto"
          >
            {displayTitle || (
              <span className="answer-title-empty" aria-hidden="true">
                &nbsp;
              </span>
            )}
          </figcaption>
        </figure>
        <div
          className="result-percentage tz-result-number"
          data-target-percentage={roundedPct}
          style={{
            visibility: isResultActive ? "visible" : "hidden",
            opacity: isResultActive ? 1 : 0,
          }}
        >
          {pctText}
        </div>
        <div
          className="winner-tag tz-winner-tag"
          style={favourite ? { opacity: 1 } : undefined}
        >
          {tagText}
        </div>
        <div
          className="result-track tz-result-track"
          style={{ opacity: result ? 1 : 0 }}
        >
          <div
            className="result-track-fill tz-result-fill"
            style={{
              transform: result
                ? `scaleX(${Math.max(0.003, percentage / 100)})`
                : "scaleX(0)",
              transformOrigin: "left center",
            }}
          />
        </div>
      </article>
      <div className="answer-index">{id2(index + 1)}</div>
    </div>
  )
}
export function FivePictureAnswersV4({
  data,
  results = false,
  recap = false,
}: {
  data: TadazzV4Data
  results?: boolean
  recap?: boolean
}) {
  const rawAnswers = (recap ? data.winners : data.answers) ?? []
  const page = Math.max(0, data.page ?? 0)
  const answers =
    recap && rawAnswers.length > 5
      ? rawAnswers.slice(page * 5, (page + 1) * 5)
      : rawAnswers.slice(0, 5)
  const isQuiz =
    results &&
    data.mode === "quiz" &&
    Array.isArray(data.solutions) &&
    data.solutions.length > 0
  const top = results ? topIndicesFor(data, answers.length) : []
  const percentages = percentagesFor(data, answers.length)
  const selectedSet = new Set<number>(
    Array.isArray(data.selectedIndices)
      ? data.selectedIndices
      : typeof data.selectedIndex === "number" && data.selectedIndex >= 0
        ? [data.selectedIndex]
        : [],
  )
  const dynamicStyle: CSSProperties | undefined =
    answers.length === 5
      ? undefined
      : {
          gridTemplateColumns: `repeat(${Math.max(1, answers.length)}, minmax(0, 1fr))`,
          left:
            answers.length > 0
              ? `${77 + (5 - answers.length) * 175}px`
              : "77px",
          right:
            answers.length > 0
              ? `${77 + (5 - answers.length) * 175}px`
              : "77px",
        }
  const canSelect = Boolean(
    data.interactive && !results && !recap && answers.length > 0,
  )
  return (
    <div
      className={`answers${recap ? " recap-answers" : ""}`}
      style={recap && answers.length === 5 ? undefined : dynamicStyle}
      data-v4="answer-cards"
      role={canSelect ? "group" : undefined}
    >
      {answers.map((answer, i) => {
        const isTop = top.includes(i)
        return (
          <AnswerSlotV4
            key={i}
            answer={answer}
            index={recap && rawAnswers.length > 5 ? page * 5 + i : i}
            result={results}
            percentage={percentages[i]}
            favourite={isTop}
            correct={isQuiz && isTop}
            incorrect={isQuiz && !isTop}
            tie={!isQuiz && top.length > 1}
            selected={selectedSet.has(i)}
            interactive={canSelect}
            multiSelect={data.multiSelect}
            onSelect={data.onSelectOption}
            showPercentages={data.showPercentages !== false}
            labels={data.labels}
            recap={recap}
          />
        )
      })}
    </div>
  )
}
export function VoteStatusV4({
  data,
  locked,
  chosen = false,
}: {
  data: TadazzV4Data
  locked?: boolean
  chosen?: boolean
}) {
  const tx = labelsFor(data)
  const text = chosen
    ? tx.choiceSelected
    : locked
      ? tx.votesLocked
      : tx.votingOpen
  const left = data.remainingSeconds
  const time =
    !locked && !chosen && left != null && Number.isFinite(left)
      ? `${id2(Math.floor(left / 60))}:${id2(Math.max(0, Math.ceil(left) % 60))}`
      : null
  return (
    <div
      className={`vote-status${locked ? " locked-status" : ""}`}
      data-v4="vote-status"
      data-testid="tadazz-status"
    >
      <i className="vote-dot" aria-hidden="true" />
      <strong>{text}</strong>
      {time && <span data-testid="tadazz-timer">• {time}</span>}
    </div>
  )
}
export function CountdownFloaterV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const total = Math.max(0, data.remainingSeconds ?? data.seconds ?? 0)
  const value = id2(Math.ceil(total))
  return (
    <div className="countdown-floater" data-v4="countdown-floater">
      <div className="countdown-label">{tx.timeLeft}</div>
      <div className="countdown-ring">
        <svg viewBox="0 0 170 170" aria-hidden="true">
          <circle className="timer-track" cx="85" cy="85" r="73" />
          <circle className="timer-progress" cx="85" cy="85" r="73" />
        </svg>
      </div>
      <div className="countdown-value" data-testid="tadazz-timer">
        {value}
      </div>
    </div>
  )
}
export function TopPickV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const answers = data.answers ?? []
  const top =
    data.topIndex != null
      ? [data.topIndex]
      : topIndicesFor(data, answers.length)
  const winner = top.length === 1 ? answers[top[0]] : null
  return (
    <>
      <div className="spotlight-top">{tx.mostChosenAnswer}</div>
      <div className="spotlight-plate" />
      {winner?.imageUrl ? (
        <img
          className="spotlight-portrait"
          src={winner.imageUrl}
          alt={winner.alt ?? winner.title}
        />
      ) : winner ? (
        <div
          className="spotlight-portrait answer-image-empty"
          aria-label={winner.alt ?? winner.title}
        >
          <span className="answer-monogram" aria-hidden="true">
            {(top[0] ?? 0) + 1}
          </span>
        </div>
      ) : null}
      <div className="spotlight-name" data-testid="tadazz-top-pick-name">
        {winner
          ? winner.title
          : (data.emptyMessage ??
            (top.length > 1 ? tx.jointAudienceFavourite : tx.noVotes))}
      </div>
    </>
  )
}
export function QuestionImageV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const canSelect = Boolean(data.interactive)
  const selectedSet = new Set<number>(
    Array.isArray(data.selectedIndices)
      ? data.selectedIndices
      : typeof data.selectedIndex === "number" && data.selectedIndex >= 0
        ? [data.selectedIndex]
        : [],
  )
  return (
    <div className="photo-question" data-testid="tadazz-question-image-scene">
      {data.questionImage ? (
        <img
          className="photo-question-img"
          src={data.questionImage}
          alt={data.photoAlt ?? ""}
        />
      ) : (
        <div className="photo-question-img answer-image-empty" />
      )}
      <div className="photo-question-panel" data-testid="tadazz-question-panel">
        <div className="eyebrow">{tx.lookClosely}</div>
        <div className="photo-question-head">
          {data.questionImageText ?? data.question ?? ""}
        </div>
      </div>
      <div className="photo-options" role={canSelect ? "group" : undefined}>
        {(data.questionOptions ?? []).slice(0, 4).map((o, i) => {
          const title = typeof o === "string" ? o : o.title
          const isSelected = selectedSet.has(i)
          const cls = [
            "photo-option",
            "tz-card",
            "is-vote-open",
            canSelect && "is-selectable",
            isSelected && "is-selected",
          ]
            .filter(Boolean)
            .join(" ")
          return (
            <div
              key={i}
              className={cls}
              data-v4-choice={i}
              data-index={i}
              data-testid={`tadazz-card-${i}`}
              role={canSelect ? "button" : undefined}
              tabIndex={canSelect ? 0 : undefined}
              aria-pressed={canSelect ? isSelected : undefined}
              aria-label={
                canSelect
                  ? `${String.fromCharCode(65 + i)} ${title}`
                  : undefined
              }
              onClick={canSelect ? () => data.onSelectOption?.(i) : undefined}
              onKeyDown={
                canSelect
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        data.onSelectOption?.(i)
                      }
                    }
                  : undefined
              }
            >{`${String.fromCharCode(65 + i)}  ·  ${title}`}</div>
          )
        })}
      </div>
    </div>
  )
}
export function LeaderboardV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const allTeams = data.teams ?? []
  const page = Math.max(0, data.page ?? 0)
  const visibleTeams =
    allTeams.length > 4 ? allTeams.slice(page * 4, (page + 1) * 4) : allTeams
  const rankOffset = allTeams.length > 4 ? page * 4 : 0
  return (
    <div
      data-testid="tadazz-leaderboard-screen"
      className="is-visible"
      data-total-entries={allTeams.length}
    >
      <header className="leader-head">
        <div className="scene-kicker">{tx.liveStandings}</div>
        <h2>{data.teamMode === false ? tx.leaderboard : tx.teamLeaderboard}</h2>
      </header>
      <div className="leader-board">
        {visibleTeams.map((team, i) => {
          const rank = rankOffset + i + 1
          return (
            <div
              className="team-row tz-leader-row"
              key={team.id ?? rank}
              data-id={team.id ?? String(rank)}
            >
              <div className="team-rank tz-rank">{id2(rank)}</div>
              <div
                className="team-icon"
                style={
                  rank === 1
                    ? {
                        background: "linear-gradient(120deg,#fed963,#edff73)",
                        color: "#2d104a",
                      }
                    : undefined
                }
              >
                {team.icon || team.name[0] || ""}
              </div>
              <div className="team-name tz-team-name">{team.name}</div>
              <div className="team-score tz-team-score">
                {team.score}
                <small>{tx.points}</small>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
export function RoundRecapV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return (
    <div data-testid="tadazz-screen-recap">
      <FivePictureAnswersV4 data={data} recap />
      <div className="story-connection" />
      <div className="story-finale">{data.subtitle || tx.storyBegin}</div>
    </div>
  )
}
export function InterludeV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return (
    <div className="interlude-panel" data-testid="tadazz-screen-interlude">
      <div className="interlude-ray" />
      <div className="interlude-mini">{tx.upNext}</div>
      <div className="interlude-title">{data.title ?? ""}</div>
      <div className="interlude-rule" />
      {data.subtitle && <div className="interlude-sub">{data.subtitle}</div>}
    </div>
  )
}
export function ZWipeV4() {
  return (
    <>
      <div className="wipe" />
      <div className="wipe second" />
    </>
  )
}
export function StageSceneV4({
  scene,
  data,
  assetBase,
}: {
  scene: TadazzV4Scene
  data: TadazzV4Data
  assetBase: string
}) {
  if (isFullShowScene(scene))
    return (
      <div className="full-show-root" data-full-show-scene={scene}>
        <FullShowSceneView scene={scene} data={data as FullShowInput} />
      </div>
    )
  const tx = labelsFor(data)
  const hasCards = [
    "picture-answers",
    "voting-open",
    "countdown",
    "vote-locked",
    "chosen",
    "survey-results",
  ].includes(scene)
  const showFrame = [
    "question",
    ...[
      "picture-answers",
      "voting-open",
      "countdown",
      "vote-locked",
      "chosen",
      "survey-results",
    ],
  ].includes(scene)
  return (
    <>
      <StageIdentityV4
        scene={scene}
        data={
          scene === "round-recap"
            ? { ...data, showQuestionNumber: false }
            : data
        }
        assetBase={assetBase}
      />
      {showFrame && (
        <QuestionFrameV4
          data={data}
          results={
            scene === "survey-results" ||
            scene === "chosen" ||
            Boolean(data.percentages?.length || data.counts?.length)
          }
        />
      )}
      {hasCards && (
        <FivePictureAnswersV4
          data={data}
          results={
            scene === "survey-results" ||
            scene === "chosen" ||
            Boolean(data.percentages?.length || data.counts?.length)
          }
        />
      )}
      {scene === "question" && (
        <>
          <div className="rail top" />
          <div className="hud-focus" data-testid="tadazz-status">
            {tx.focus}
          </div>
        </>
      )}
      {scene === "voting-open" && <VoteStatusV4 data={data} />}
      {scene === "vote-locked" && <VoteStatusV4 data={data} locked />}
      {(scene === "picture-answers" || scene === "countdown") && (
        <div className="tzv4-sr-status" data-testid="tadazz-status">
          {tx.votingOpen}
        </div>
      )}
      {scene === "survey-results" && (
        <div className="tzv4-sr-status" data-testid="tadazz-status">
          {tx.audienceResults}
        </div>
      )}
      {scene === "question-image" && (
        <div className="tzv4-sr-status" data-testid="tadazz-status">
          {tx.votingOpen}
        </div>
      )}
      {scene === "chosen" && <VoteStatusV4 data={data} chosen />}
      {scene === "countdown" && <CountdownFloaterV4 data={data} />}
      {scene === "top-pick" && <TopPickV4 data={data} />}
      {scene === "question-image" && <QuestionImageV4 data={data} />}
      {scene === "leaderboard" && <LeaderboardV4 data={data} />}
      {scene === "round-recap" && <RoundRecapV4 data={data} />}
      {scene === "interlude" && <InterludeV4 data={data} />}
      {scene === "z-wipe" && <ZWipeV4 />}
    </>
  )
}
export function StageBackdropV4({
  scene,
  data,
  assetBase,
}: {
  scene: TadazzV4Scene
  data: TadazzV4Data
  assetBase: string
}) {
  const isShow = TADAZZ_V4_SHOW_SCENES.has(scene)
  const url =
    data.backgroundUrl ||
    asset(assetBase, isShow ? "show-stage.webp" : "question-bg.webp")
  return (
    <div
      className="stage-bg"
      data-testid="tadazz-backdrop"
      style={{
        backgroundImage: `url("${url.replaceAll('"', "%22")}")`,
        backgroundSize: data.backgroundFit ?? "cover",
      }}
    />
  )
}
export function StageAmbientV4() {
  return (
    <div className="ambient" aria-hidden="true">
      {Array.from({ length: 4 }, (_, j) => (
        <div className="ambient-beam" key={j} />
      ))}
      <div className="ambient-bulbs">
        {Array.from({ length: 15 }, (_, j) => (
          <i key={j} style={{ animationDelay: `${(-j * 0.16).toFixed(2)}s` }} />
        ))}
      </div>
      <div className="ambient-floor" />
    </div>
  )
}
