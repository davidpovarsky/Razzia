import type { ReactNode } from "react"
import type { TadazzV4Data, TadazzV4Answer } from "./types"

export const FULL_SHOW_SCENES = [
  "company-opening",
  "grand-opening",
  "representative-directory",
  "phone-instructions",
  "connection-readiness",
  "round-one",
  "story-progress",
  "tie-break",
  "story-assembly",
  "story-live",
  "round-two",
  "grand-finale",
] as const
export type FullShowScene = (typeof FULL_SHOW_SCENES)[number]
export const isFullShowScene = (value: string): value is FullShowScene =>
  (FULL_SHOW_SCENES as readonly string[]).includes(value)

export interface FullShowPerson {
  table: number
  name: string
}

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
  groupPage?: number
}

const DEFAULT_STORY_ROLES = [
  "Main Character",
  "Second Character",
  "Era",
  "Crisis",
  "Ending",
]
const BRAND_LOGO_SRC = "/tadazz-show/v4/tadazz-brand-logo.png"
const num = (n: number) => String(Math.max(1, n)).padStart(2, "0")

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span className={`full-brand-badge ${className || ""}`.trim()}>
      <img
        src={BRAND_LOGO_SRC}
        alt="TADAZZ!"
        className="full-brand-img"
        onError={(e) => {
          e.currentTarget.style.display = "none"
          e.currentTarget.parentElement?.classList.add("full-logo-error")
        }}
      />
      <strong className="full-brand-text">
        TADA<span>ZZ!</span>
      </strong>
    </span>
  )
}

const picture = (a: TadazzV4Answer | undefined, fallback: number) =>
  a?.imageUrl ? (
    <img
      className="full-picture full-story-image"
      src={a.imageUrl}
      alt={a.alt || a.title || ""}
    />
  ) : (
    <div className="full-picture full-picture-empty full-story-image">{num(fallback + 1)}</div>
  )

function Head({ title, chip }: { title?: string; chip?: string }) {
  return (
    <div className="full-headbar">
      <BrandLogo className="full-head-logo" />
      <div className="full-head-center">{title}</div>
      <span className="full-chip">{chip}</span>
    </div>
  )
}

export function StoryCards({
  data,
  progress = false,
  live = false,
}: {
  data: FullShowInput
  progress?: boolean
  live?: boolean
}) {
  const winners = data.winners ?? []
  const count = Math.min(5, Math.max(0, data.completed ?? 0))
  const roles =
    data.storyRoles && data.storyRoles.length === 5
      ? data.storyRoles
      : DEFAULT_STORY_ROLES
  return (
    <div
      className={`full-story-cards full-story-deck${live ? " full-story-hold holding" : ""}`}
    >
      {roles.map((role, i) => {
        const a = winners[i]
        const ready = !progress || i < count
        const displayTitle = ready
          ? a?.title || a?.alt || `Choice ${i + 1}`
          : "AWAITING THE VOTE"
        return (
          <article
            key={role}
            className={[
              "full-story-piece",
              "full-story-card",
              !ready && "pending",
            ]
              .filter(Boolean)
              .join(" ")}
            style={{ animationDelay: `${i * 180}ms` }}
            data-role-index={i}
            data-ready={ready ? "true" : "false"}
          >
            <div className="full-story-role">{role}</div>
            <div className="full-story-image-box">
              {ready ? (
                picture(a, i)
              ) : (
                <div className="full-picture full-picture-empty">?</div>
              )}
              <div className="full-story-index full-story-num">{num(i + 1)}</div>
            </div>
            <div className="full-story-title full-story-label" dir="auto">
              {displayTitle}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function Directory({ data }: { data: FullShowInput }) {
  const reps = data.representatives || []
  const connected = new Set(data.connectedTables || [])
  const group =
    typeof data.groupPage === "number" &&
    data.groupPage >= 1 &&
    data.groupPage <= 4
      ? data.groupPage
      : 0
  const startTable = group > 0 ? (group - 1) * 10 + 1 : 1
  const endTable = group > 0 ? group * 10 : 40
  const tableCount = endTable - startTable + 1
  const chipText =
    group > 0
      ? `GROUP ${group} · TABLES ${num(startTable)}–${num(endTable)}`
      : "PHONE VOTING"

  return (
    <>
      <Head title="FIND YOUR TABLE REPRESENTATIVE" chip={chipText} />
      <div className="full-phone-banner">
        <small>CALL TO JOIN</small>
        <strong>{data.dialNumber || "NUMBER TO BE ADDED"}</strong>
      </div>
      <div
        className={`full-directory${group > 0 ? " full-directory-focused" : ""}`}
        data-testid="tadazz-full-directory"
        data-group-page={group}
      >
        {Array.from({ length: tableCount }, (_, idx) => {
          const table = startTable + idx
          const person = reps.find((r) => r.table === table)
          const isConnected = connected.has(table)
          return (
            <div
              key={table}
              data-table={table}
              className={[
                "full-rep-row",
                isConnected && "connected full-join-pulse",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ animationDelay: `${(idx % 10) * 65}ms` }}
            >
              <b>{num(table)}</b>
              <span>{person?.name || `Table ${table} Representative`}</span>
              <i aria-label={isConnected ? "Connected" : "Waiting"} />
            </div>
          )
        })}
      </div>
    </>
  )
}

export function PhoneInstructions({ data }: { data: FullShowInput }) {
  return (
    <>
      <Head title="JUST DIAL. THEN CHOOSE." chip="KEYPAD VOTING" />
      <div className="full-phone-instructions">
        <div className="full-phone-device">
          <div className="full-phone-speaker" />
          <div className="full-phone-screen">
            <small>TADAZZ! IS READY</small>
            <strong>{data.dialNumber || "DIAL IN"}</strong>
          </div>
          <div className="full-phone-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
              (n, i) => (
                <span key={n} style={{ animationDelay: `${i * 100}ms` }}>
                  {n}
                </span>
              ),
            )}
          </div>
        </div>
        <div className="full-phone-steps">
          {[
            [
              "01",
              "DIAL THE EVENT NUMBER",
              "The host will display or announce the number.",
            ],
            [
              "02",
              "LISTEN FOR THE QUESTION",
              "Discuss your choice with your table.",
            ],
            [
              "03",
              "PRESS 1, 2, 3, 4 OR 5",
              "One vote per table, using the phone keypad.",
            ],
          ].map(([n, t, d]) => (
            <div key={n}>
              <b>{n}</b>
              <strong>{t}</strong>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function Readiness({ data }: { data: FullShowInput }) {
  const connected = new Set(data.connectedTables || [])
  return (
    <>
      <Head title="THE TABLES ARE LIGHTING UP" chip="LIVE CONNECTIONS" />
      <h2 className="full-subhead">THE ROOM IS COMING ONLINE</h2>
      <div className="full-light-grid">
        {Array.from({ length: 40 }, (_, i) => {
          const n = i + 1
          const isConnected = connected.has(n)
          return (
            <div
              data-table={n}
              key={n}
              className={`full-light${isConnected ? " connected" : ""}`}
              style={{
                animationDelay: `${(i % 10) * 60 + Math.floor(i / 10) * 75}ms`,
              }}
            >
              <small>TABLE</small>
              <b>{num(n)}</b>
              <i />
            </div>
          )
        })}
      </div>
      <div className="full-light-status">
        <b>{connected.size} / 40 TABLES CONNECTED</b>
        <div>
          <i
            style={{ width: `${Math.min(100, (connected.size / 40) * 100)}%` }}
          />
        </div>
        <small>
          {data.isLive ? "CONNECTED TABLES" : "PREVIEW DATA — NOT LIVE"}
        </small>
      </div>
    </>
  )
}

export function Tie({ data }: { data: FullShowInput }) {
  const picks = data.contestants || data.winners?.slice(0, 2) || []
  const isResolved = data.resolvedIndex != null
  const chosenPick =
    isResolved && data.resolvedIndex != null ? picks[data.resolvedIndex] : null
  const chosenTitle =
    chosenPick?.title || chosenPick?.alt
      ? ` · ${chosenPick.title || chosenPick.alt}`
      : ""
  return (
    <>
      <Head
        title="THE AUDIENCE IS SPLIT"
        chip={`ROUND ${num(data.round || 1)}`}
      />
      <div className="full-tie-wrap">
        {[0, 1].map((i) => {
          const pick = picks[i]
          const isChosen = data.resolvedIndex === i
          const isMuted = isResolved && !isChosen
          const displayTitle = pick?.title || pick?.alt || `Choice ${i + 1}`
          return (
            <article
              key={i}
              className={`full-tie-card ${isChosen ? "chosen" : isMuted ? "muted" : ""}`}
              style={{ animationDelay: `${i * 190}ms` }}
              data-tie-index={i}
              data-chosen={isChosen ? "true" : undefined}
            >
              {picture(pick, i)}
              <div className="full-tie-index">{num(i + 1)}</div>
              <h2>{displayTitle}</h2>
              <b>
                {data.voteCount == null
                  ? "EQUAL VOTES"
                  : `${data.voteCount} VOTES`}
              </b>
            </article>
          )
        })}
        <strong className="full-equals">=</strong>
      </div>
      <p className="full-tie-instruction">
        {data.resolvedIndex == null
          ? "Host, choose which picture goes into the story."
          : `CHOICE SELECTED${chosenTitle}`}
      </p>
    </>
  )
}

export function Finale({ data }: { data: FullShowInput }) {
  const leftCurtain =
    data.curtainLeftUrl || "/tadazz-show/second-library/curtain-left.png"
  const rightCurtain =
    data.curtainRightUrl || "/tadazz-show/second-library/curtain-right.png"
  return (
    <div className="full-grand-finale">
      <div className="full-final-bloom" />
      <div className="full-final-rings full-finale-rings" />
      <div className="full-final-arc" />
      <div className="full-finale-z full-wing-z left">Z</div>
      <div className="full-finale-z full-wing-z right">Z</div>
      <svg
        viewBox="0 0 1920 1080"
        className="full-final-zigzags"
        aria-hidden="true"
      >
        <path
          className="full-zig blue"
          d="M-90 340 L620 420 L300 680 L1060 560"
        />
        <path
          className="full-zig lime"
          d="M2010 340 L1300 420 L1620 680 L860 560"
        />
      </svg>
      <div className="full-final-tunnel">
        {Array.from({ length: 9 }, (_, i) => (
          <div
            key={i}
            className="full-final-ray"
            style={{ "--ray-rot": `${(i - 4) * 13}deg` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="full-final-sparks" />
      <div className="full-final-center">
        <BrandLogo className="full-finale-logo" />
      </div>
      <img
        src={leftCurtain}
        alt="Curtain Left"
        className="full-curtain left"
      />
      <img
        src={rightCurtain}
        alt="Curtain Right"
        className="full-curtain right"
      />
      <div className="full-curtain-seam" />
    </div>
  )
}

export function CompanyOpening({ data }: { data: FullShowInput }) {
  const artwork =
    data.eventArtworkUrl ||
    "/tadazz-show/second-library/creating-worlds-intro.png"
  return (
    <div className="full-company">
      <img
        src={artwork}
        alt="Creating Worlds"
        className="full-company-event"
      />
      <div className="full-company-glow" />
      <div className="full-company-brand">
        <BrandLogo className="full-company-logo" />
      </div>
    </div>
  )
}

export function GrandOpening({ data }: { data: FullShowInput }) {
  const teaserSrc =
    data.eventArtworkUrl ||
    "/tadazz-show/second-library/teaser-screen-source.jpg"
  return (
    <div className="full-grand-opening">
      <img
        src={teaserSrc}
        alt="Grand Opening Teaser"
        className="full-opening-event"
      />
      <div className="full-opening-warm-veil" />
      <div className="full-portal full-opening-portal" />
      <div className="full-portal full-opening-portal portal-two" />
      <div className="full-opening-shock" />
      <BrandLogo className="full-opening-logo" />
      <h2 className="full-opening-tag">
        {data.title || "THE STORY STARTS WITH YOU"}
      </h2>
      <p className="full-opening-footnote">
        {data.subtitle || "A LIVE AUDIENCE-CREATED EXPERIENCE"}
      </p>
    </div>
  )
}

export function RoundLaunch({
  scene,
  data,
}: {
  scene: "round-one" | "round-two"
  data: FullShowInput
}) {
  const isRoundOne = scene === "round-one"
  return (
    <div className="full-round-launch">
      <Head title="" chip={`ROUND ${num(isRoundOne ? 1 : 2)}`} />
      <div className="full-launch-glow" />
      <div className="full-wing-z left">Z</div>
      <div className="full-wing-z right">Z</div>
      <div className="full-round-plaque">
        <small className="full-round-mini">
          {isRoundOne ? "THE FIRST STORY" : "A WHOLE NEW WORLD"}
        </small>
        <strong className="full-round-number">
          ROUND {num(isRoundOne ? 1 : 2)}
        </strong>
      </div>
      <div className="full-launch-rule full-round-underline" />
    </div>
  )
}

export function FullShowSceneView({
  scene,
  data,
}: {
  scene: FullShowScene
  data: FullShowInput
}): ReactNode {
  switch (scene) {
    case "company-opening":
      return <CompanyOpening data={data} />
    case "grand-opening":
      return <GrandOpening data={data} />
    case "representative-directory":
      return <Directory data={data} />
    case "phone-instructions":
      return <PhoneInstructions data={data} />
    case "connection-readiness":
      return <Readiness data={data} />
    case "round-one":
    case "round-two":
      return <RoundLaunch scene={scene} data={data} />
    case "story-progress":
      return (
        <>
          <Head
            title="YOUR WORLD IS TAKING SHAPE"
            chip={`ROUND ${num(data.round || 1)}`}
          />
          <h3 className="full-story-status">
            {Math.max(0, Math.min(5, data.completed || 0))} OF 5 STORY PIECES
            COLLECTED
          </h3>
          <StoryCards data={data} progress />
          <div className="full-story-bridge full-story-ribbon" />
        </>
      )
    case "tie-break":
      return <Tie data={data} />
    case "story-assembly":
      return (
        <>
          <Head
            title="THE WORLD YOU CREATED"
            chip={`ROUND ${num(data.round || 1)}`}
          />
          <StoryCards data={data} />
          <div className="full-story-bridge full-story-ribbon" />
          <div className="full-story-ending full-story-begin">
            LET THE STORY BEGIN…
          </div>
        </>
      )
    case "story-live":
      return (
        <>
          <Head
            title="THE WORLD YOU CREATED"
            chip={`ROUND ${num(data.round || 1)}`}
          />
          <h3 className="full-story-status">
            STORYTELLING MODE · All five choices remain visible while the host
            tells the story.
          </h3>
          <StoryCards data={data} live />
          <div className="full-story-live-note full-live-footer">
            <span className="full-live-dot" />
            <span>STORY {data.round || 1} · HOST IS TELLING YOUR STORY</span>
          </div>
        </>
      )
    case "grand-finale":
      return <Finale data={data} />
  }
}

export function renderFullShowScene(
  scene: FullShowScene,
  data: FullShowInput,
): ReactNode {
  if (!isFullShowScene(scene)) return null
  return <FullShowSceneView scene={scene} data={data} />
}
