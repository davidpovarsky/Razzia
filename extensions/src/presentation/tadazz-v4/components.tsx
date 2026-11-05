import type { CSSProperties } from "react"
import {
  TADAZZ_V4_ASSET_BASE, TADAZZ_V4_LABELS, TADAZZ_V4_SHOW_SCENES,
  percentagesFor, topIndicesFor,
  type TadazzV4Answer, type TadazzV4Data, type TadazzV4Labels, type TadazzV4Scene,
} from "./types"

function asset(base: string, name: string) { return `${base || TADAZZ_V4_ASSET_BASE}${name}` }
const id2 = (n: number) => String(Math.max(0, n)).padStart(2, "0")
export function labelsFor(data: TadazzV4Data): TadazzV4Labels { return { ...TADAZZ_V4_LABELS, ...(data.labels ?? {}) } }
export function StageIdentityV4({ data, scene, assetBase }: { data: TadazzV4Data; scene: TadazzV4Scene; assetBase: string }) {
  if (scene === "z-wipe" || scene === "interlude") return null
  const number = Math.max(1, data.number ?? 1)
  const round = Math.max(1, data.round ?? 1)
  const detail = data.showQuestionNumber === false ? "" : ` · QUESTION ${id2(number)}${data.totalQuestions ? ` / ${data.totalQuestions}` : ""}`
  return <>
    <div className="stage-identity"><img className="stage-brand-logo" src={asset(assetBase, "tadazz-brand-logo.png")} alt="TADAZZ!" /></div>
    <div className="stage-round-pill">ROUND {id2(round)}{detail}</div>
  </>
}
export function QuestionFrameV4({ data, results = false }: { data: TadazzV4Data; results?: boolean }) {
  const tx = labelsFor(data)
  const question = data.question ?? ""
  const size = question.length > 65 ? 49 : question.length > 48 ? 56 : undefined
  return <div className="q-frame" data-v4="question-frame">
    <div className="eyebrow">{data.eyebrow || (results ? tx.audienceResults : tx.nextQuestion)}</div>
    <div className="q-text" style={size ? { fontSize: size } : undefined}>{question}</div>
  </div>
}
export interface AnswerSlotProps {
  answer: TadazzV4Answer
  index: number
  result?: boolean
  percentage?: number
  favourite?: boolean
  tie?: boolean
  selected?: boolean
  showPercentages?: boolean
  recap?: boolean
  assetBase?: string
  labels?: Partial<TadazzV4Labels>
}
export function AnswerSlotV4({ answer, index, result, percentage = 0, favourite, tie, selected, showPercentages = true, labels = {} }: AnswerSlotProps) {
  const tx = { ...TADAZZ_V4_LABELS, ...labels }
  return <div className={`choice-slot${favourite ? " is-favourite" : ""}${selected ? " is-selected" : ""}`} data-v4-choice={index}>
    <article className="answer-card">
      <figure>
        {answer.imageUrl ? <img className="answer-image" src={answer.imageUrl} alt={answer.alt ?? answer.title} /> : <div className="answer-image answer-image-empty" aria-label={answer.alt ?? answer.title}/>}
        <figcaption className="answer-title" style={answer.title.length > 16 ? { fontSize: 25 } : undefined}>{answer.title}</figcaption>
      </figure>
      <div className="result-percentage" data-target-percentage={percentage} style={{ visibility: result && showPercentages ? "visible" : "hidden" }}>{result ? "0%" : ""}</div>
      <div className="winner-tag">{tie ? tx.jointAudienceFavourite : tx.audienceFavourite}</div>
      <div className="result-track"><div className="result-track-fill" /></div>
    </article>
    <div className="answer-index">{id2(index + 1)}</div>
  </div>
}
export function FivePictureAnswersV4({ data, results = false, recap = false }: { data: TadazzV4Data; results?: boolean; recap?: boolean }) {
  const answers = (recap ? data.winners : data.answers) ?? []
  const top = results ? topIndicesFor(data, answers.length) : []
  const percentages = percentagesFor(data, answers.length)
  const dynamicStyle: CSSProperties | undefined = answers.length === 5 ? undefined : {
    gridTemplateColumns: `repeat(${Math.max(1, answers.length)}, minmax(0, 1fr))`,
    left: answers.length > 0 ? `${77 + (5 - answers.length) * 175}px` : "77px",
    right: answers.length > 0 ? `${77 + (5 - answers.length) * 175}px` : "77px",
  }
  return <div className={`answers${recap ? " recap-answers" : ""}`} style={recap ? undefined : dynamicStyle} data-v4="answer-cards">
    {answers.map((answer, i) => <AnswerSlotV4 key={i} answer={answer} index={i} result={results} percentage={percentages[i]} favourite={top.includes(i)} tie={top.length > 1} selected={data.selectedIndex === i} showPercentages={data.showPercentages !== false} labels={data.labels} recap={recap} />)}
  </div>
}
export function VoteStatusV4({ data, locked, chosen = false }: { data: TadazzV4Data; locked?: boolean; chosen?: boolean }) {
  const tx = labelsFor(data)
  const text = chosen ? tx.choiceSelected : locked ? tx.votesLocked : tx.votingOpen
  const left = data.remainingSeconds
  const time = !locked && !chosen && left != null && Number.isFinite(left) ? `${id2(Math.floor(left / 60))}:${id2(Math.max(0, Math.ceil(left) % 60))}` : null
  return <div className={`vote-status${locked ? " locked-status" : ""}`} data-v4="vote-status">
    <i className="vote-dot" aria-hidden="true"/><strong>{text}</strong>{time && <span>• {time}</span>}
  </div>
}
export function CountdownFloaterV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const total = Math.max(0, data.remainingSeconds ?? data.seconds ?? 0)
  const value = id2(Math.ceil(total))
  return <div className="countdown-floater" data-v4="countdown-floater">
    <div className="countdown-label">{tx.timeLeft}</div>
    <div className="countdown-ring"><svg viewBox="0 0 170 170" aria-hidden="true"><circle className="timer-track" cx="85" cy="85" r="73"/><circle className="timer-progress" cx="85" cy="85" r="73"/></svg></div>
    <div className="countdown-value">{value}</div>
  </div>
}
export function TopPickV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  const answers = data.answers ?? []
  const top = data.topIndex != null ? [data.topIndex] : topIndicesFor(data, answers.length)
  const winner = top.length === 1 ? answers[top[0]] : null
  return <>
    <div className="spotlight-top">{tx.mostChosenAnswer}</div>
    <div className="spotlight-plate"/>
    {winner?.imageUrl && <img className="spotlight-portrait" src={winner.imageUrl} alt={winner.alt ?? winner.title}/>}
    <div className="spotlight-name">{winner ? winner.title : (data.emptyMessage ?? (top.length > 1 ? tx.jointAudienceFavourite : tx.noVotes))}</div>
  </>
}
export function QuestionImageV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return <div className="photo-question">
    {data.questionImage ? <img className="photo-question-img" src={data.questionImage} alt={data.photoAlt ?? ""}/> : <div className="photo-question-img answer-image-empty"/>}
    <div className="photo-question-panel">
      <div className="eyebrow">{tx.lookClosely}</div>
      <div className="photo-question-head">{data.questionImageText ?? data.question ?? ""}</div>
    </div>
    <div className="photo-options">{(data.questionOptions ?? []).slice(0, 4).map((o, i) => {
      const title = typeof o === "string" ? o : o.title
      return <div key={i} className="photo-option">{String.fromCharCode(65+i)} · {title}</div>
    })}</div>
  </div>
}
export function LeaderboardV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return <>
    <header className="leader-head"><div className="scene-kicker">{tx.liveStandings}</div><h2>{tx.teamLeaderboard}</h2></header>
    <div className="leader-board">{(data.teams ?? []).map((team, i) => <div className="team-row" key={team.id ?? i}>
      <div className="team-rank">{id2(i+1)}</div>
      <div className="team-icon" style={i===0 ? {background:"linear-gradient(120deg,#fed963,#edff73)",color:"#2d104a"} : undefined}>{team.icon || team.name[0] || ""}</div>
      <div className="team-name">{team.name}</div>
      <div className="team-score">{team.score}<small>{tx.points}</small></div>
    </div>)}</div>
  </>
}
export function RoundRecapV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return <>
    <FivePictureAnswersV4 data={data} recap/>
    <div className="story-connection"/>
    <div className="story-finale">{tx.storyBegin}</div>
  </>
}
export function InterludeV4({ data }: { data: TadazzV4Data }) {
  const tx = labelsFor(data)
  return <div className="interlude-panel">
    <div className="interlude-ray"/>
    <div className="interlude-mini">{tx.upNext}</div>
    <div className="interlude-title">{data.title ?? ""}</div>
    <div className="interlude-rule"/>
    {data.subtitle && <div className="interlude-sub">{data.subtitle}</div>}
  </div>
}
export function ZWipeV4() { return <><div className="wipe"/><div className="wipe second"/></> }
export function StageSceneV4({ scene, data, assetBase }: {scene:TadazzV4Scene; data:TadazzV4Data;assetBase:string}) {
  const hasCards = ["picture-answers", "voting-open", "countdown", "vote-locked", "chosen", "survey-results"].includes(scene)
  const showFrame = ["question", ...["picture-answers", "voting-open", "countdown", "vote-locked", "chosen", "survey-results"]].includes(scene)
  return <>
    <StageIdentityV4 scene={scene} data={scene === "round-recap" ? {...data, showQuestionNumber:false} : data} assetBase={assetBase}/>
    {showFrame && <QuestionFrameV4 data={data} results={scene === "survey-results"} />}
    {hasCards && <FivePictureAnswersV4 data={data} results={scene === "survey-results"} />}
    {scene === "question" && <><div className="rail top"/><div className="hud-focus">{labelsFor(data).focus}</div></>}
    {scene === "voting-open" && <VoteStatusV4 data={data}/>}
    {scene === "vote-locked" && <VoteStatusV4 data={data} locked/>}
    {scene === "chosen" && <VoteStatusV4 data={data} chosen/>}
    {scene === "countdown" && <CountdownFloaterV4 data={data}/>}
    {scene === "top-pick" && <TopPickV4 data={data}/>}
    {scene === "question-image" && <QuestionImageV4 data={data}/>}
    {scene === "leaderboard" && <LeaderboardV4 data={data}/>}
    {scene === "round-recap" && <RoundRecapV4 data={data}/>}
    {scene === "interlude" && <InterludeV4 data={data}/>}
    {scene === "z-wipe" && <ZWipeV4/>}
  </>
}
export function StageBackdropV4({ scene, data, assetBase }: { scene:TadazzV4Scene; data:TadazzV4Data; assetBase:string }) {
  const isShow=TADAZZ_V4_SHOW_SCENES.has(scene)
  const url = data.backgroundUrl || asset(assetBase, isShow ? "show-stage.webp" : "question-bg.webp")
  return <div className="stage-bg" style={{backgroundImage:`url("${url.replaceAll('"','%22')}")`,backgroundSize:data.backgroundFit ?? "cover"}}/>
}
export function StageAmbientV4() {return <div className="ambient" aria-hidden="true">
  {Array.from({length:4},(_,j)=><div className="ambient-beam" key={j}/>)}
  <div className="ambient-bulbs">{Array.from({length:15},(_,j)=><i key={j} style={{animationDelay:`${(-j*.16).toFixed(2)}s`}}/>)}</div>
  <div className="ambient-floor"/>
</div>}
