import type { ReactNode } from "react"
import type { TadazzV4Data, TadazzV4Answer } from "./types"

export const FULL_SHOW_SCENES = [
  "company-opening", "grand-opening", "representative-directory", "phone-instructions",
  "connection-readiness", "round-one", "story-progress", "tie-break",
  "story-assembly", "story-live", "round-two", "grand-finale",
] as const
export type FullShowScene = (typeof FULL_SHOW_SCENES)[number]
export const isFullShowScene = (value: string): value is FullShowScene =>
  (FULL_SHOW_SCENES as readonly string[]).includes(value)
export interface FullShowPerson { table: number; name: string }
export interface FullShowInput extends TadazzV4Data {
  representatives?: FullShowPerson[]
  dialNumber?: string
  connectedTables?: number[]
  completed?: number
  contestants?: TadazzV4Answer[]
  voteCount?: number
  resolvedIndex?: number | null
  isLive?: boolean
  storyRoles?: string[]
  eventArtworkUrl?: string
  curtainLeftUrl?: string
  curtainRightUrl?: string
}
const roles = ["Main Character", "Second Character", "Era", "Crisis", "Ending"]
const num = (n: number) => String(n).padStart(2, "0")
const picture = (a: TadazzV4Answer | undefined, fallback: number) => a?.imageUrl
  ? <img className="full-picture" src={a.imageUrl} alt={a.alt || a.title || ""} />
  : <div className="full-picture full-picture-empty">{num(fallback+1)}</div>
function Head({title,chip}: {title?:string;chip?:string}) {
  return <div className="full-headbar"><strong className="full-head-logo">TADA<span>ZZ!</span></strong><div className="full-head-center">{title}</div><span className="full-chip">{chip}</span></div>
}
function StoryCards({data,progress=false,live=false}: {data:FullShowInput;progress?:boolean;live?:boolean}) {
  const winners=data.winners ?? []
  const count=Math.min(5,Math.max(0,data.completed ?? 0))
  return <div className={`full-story-cards${live?" full-story-hold":""}`}>
    {roles.map((role,i)=>{
      const a=winners[i]
      const ready=!progress || i<count
      return <article key={role} className={`full-story-piece${ready?"":" pending"}`} style={{animationDelay:`${i*180}ms`}}>
        <div className="full-story-role">{data.storyRoles?.[i] || role}</div>
        {ready ? picture(a,i) : <div className="full-picture full-picture-empty">?</div>}
        <div className="full-story-title">{ready ? (a?.title || `Choice ${i+1}`) : "AWAITING THE VOTE"}</div>
      </article>
    })}
  </div>
}
function Directory({data}:{data:FullShowInput}) {
  const reps=data.representatives || []
  const connected=new Set(data.connectedTables || [])
  return <><Head title="FIND YOUR TABLE REPRESENTATIVE" chip="PHONE VOTING"/>
    <div className="full-phone-banner"><small>CALL TO JOIN</small><strong>{data.dialNumber || "NUMBER TO BE ADDED"}</strong></div>
    <div className="full-directory" data-testid="tadazz-full-directory">{Array.from({length:40},(_,i)=>{
      const table=i+1,person=reps.find(r=>r.table===table)
      return <div key={table} data-table={table} className={`full-rep-row${connected.has(table)?" connected":""}`}>
        <b>{num(table)}</b><span>{person?.name || "Name to be supplied"}</span><i aria-label={connected.has(table)?"Connected":"Waiting"}/>
      </div>
    })}</div>
  </>
}
function PhoneInstructions({data}:{data:FullShowInput}) {
  return <><Head title="JUST DIAL. THEN CHOOSE." chip="KEYPAD VOTING"/>
    <div className="full-phone-instructions">
      <div className="full-phone-device"><div className="full-phone-speaker"/><div className="full-phone-screen"><small>TADAZZ! IS READY</small><strong>{data.dialNumber || "DIAL IN"}</strong></div><div className="full-phone-keys">{["1","2","3","4","5","6","7","8","9","*","0","#"].map((n,i)=><span key={n} style={{animationDelay:`${i*100}ms`}}>{n}</span>)}</div></div>
      <div className="full-phone-steps">{[["01","DIAL THE EVENT NUMBER","The host will display or announce the number."],["02","LISTEN FOR THE QUESTION","Discuss your choice with your table."],["03","PRESS 1, 2, 3, 4 OR 5","One vote per table, using the phone keypad."]].map(([n,t,d])=><div key={n}><b>{n}</b><strong>{t}</strong><p>{d}</p></div>)}</div>
    </div>
  </>
}
function Readiness({data}:{data:FullShowInput}) {
  const connected=new Set(data.connectedTables || [])
  return <><Head title="THE TABLES ARE LIGHTING UP" chip="LIVE CONNECTIONS"/>
    <h2 className="full-subhead">THE ROOM IS COMING ONLINE</h2>
    <div className="full-light-grid">{Array.from({length:40},(_,i)=>{
      const n=i+1
      return <div data-table={n} key={n} className={`full-light${connected.has(n)?" connected":""}`} style={{animationDelay:`${(i%10)*60+Math.floor(i/10)*75}ms`}}><small>TABLE</small><b>{num(n)}</b><i/></div>
    })}</div>
    <div className="full-light-status"><b>{connected.size} / 40 TABLES CONNECTED</b><div><i style={{width:`${Math.min(100,connected.size/40*100)}%`}}/></div><small>{data.isLive?"CONNECTED TABLES":"PREVIEW DATA — NOT LIVE"}</small></div>
  </>
}
function Tie({data}:{data:FullShowInput}) {
  const picks=data.contestants || data.winners?.slice(0,2) || []
  return <><Head title="THE AUDIENCE IS SPLIT" chip={`ROUND ${num(data.round || 1)}`}/>
    <div className="full-tie-wrap">{[0,1].map(i=><article key={i} className={`full-tie-card ${data.resolvedIndex===i?"chosen":data.resolvedIndex!=null?"muted":""}`} style={{animationDelay:`${i*190}ms`}}>
      {picture(picks[i],i)}<h2>{picks[i]?.title || `Choice ${i+1}`}</h2><b>{data.voteCount==null?"EQUAL VOTES":`${data.voteCount} VOTES`}</b>
    </article>)}<strong className="full-equals">=</strong></div>
    <p className="full-tie-instruction">{data.resolvedIndex==null?"Host, choose which picture goes into the story.":"CHOICE SELECTED"}</p>
  </>
}
function Finale({data}:{data:FullShowInput}) {
  return <div className="full-grand-finale"><div className="full-finale-rings"/><div className="full-finale-z left">Z</div><div className="full-finale-z right">Z</div><div className="full-final-center"><strong>TADA<span>ZZ!</span></strong></div>
    <div className="full-curtain left" style={data.curtainLeftUrl?{backgroundImage:`url("${data.curtainLeftUrl}")`}:undefined}/>
    <div className="full-curtain right" style={data.curtainRightUrl?{backgroundImage:`url("${data.curtainRightUrl}")`}:undefined}/>
  </div>
}
export function FullShowSceneView({scene,data}: {scene:FullShowScene;data:FullShowInput}):ReactNode {
  switch(scene) {
    case "company-opening": return <div className="full-company"><div className="full-company-event" style={data.eventArtworkUrl?{backgroundImage:`url("${data.eventArtworkUrl}")`}:undefined}/><div className="full-company-brand">TADA<span>ZZ!</span></div></div>
    case "grand-opening": return <div className="full-grand-opening"><div className="full-portal"/><strong>TADA<span>ZZ!</span></strong><h2>THE STORY STARTS WITH YOU</h2><p>A LIVE AUDIENCE-CREATED EXPERIENCE</p></div>
    case "representative-directory": return <Directory data={data}/>
    case "phone-instructions": return <PhoneInstructions data={data}/>
    case "connection-readiness": return <Readiness data={data}/>
    case "round-one": case "round-two": return <div className="full-round-launch"><div className="full-portal"/><small>{scene==="round-one"?"THE FIRST STORY":"A WHOLE NEW WORLD"}</small><strong>ROUND {num(scene==="round-one"?1:2)}</strong><div className="full-launch-rule"/></div>
    case "story-progress": return <><Head title="YOUR WORLD IS TAKING SHAPE" chip={`ROUND ${num(data.round||1)}`}/><h3 className="full-story-status">{Math.max(0,Math.min(5,data.completed||0))} OF 5 STORY PIECES COLLECTED</h3><StoryCards data={data} progress/><div className="full-story-bridge"/></>
    case "tie-break": return <Tie data={data}/>
    case "story-assembly": return <><Head title="THE WORLD YOU CREATED" chip={`ROUND ${num(data.round||1)}`}/><StoryCards data={data}/><div className="full-story-bridge"/><div className="full-story-ending">LET THE STORY BEGIN…</div></>
    case "story-live": return <><Head title="THE WORLD YOU CREATED" chip={`ROUND ${num(data.round||1)}`}/><StoryCards data={data} live/><div className="full-story-live-note">STORY {data.round||1} · HOST IS TELLING YOUR STORY</div></>
    case "grand-finale": return <Finale data={data}/>
  }
}
