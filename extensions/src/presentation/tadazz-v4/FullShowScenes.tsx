import {ReferenceStoryScene} from "./reference-story/ReferenceStoryScene"
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
  onResolveTie?: (contestantIndex: number) => void
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
    <div className="full-picture full-picture-empty full-story-image">
      {num(fallback + 1)}
    </div>
  )

function Head({
  title,
  chip,
  eyebrow,
  subtitle,
}: {
  title?: string
  chip?: string
  eyebrow?: string
  subtitle?: string
}) {
  return (
    <>
      <img className="full-corner-logo" src={BRAND_LOGO_SRC} alt="TADAZZ!" />
      <div className="full-status-pill">{chip}</div>
      {title && (
        <div className="full-head">
          {eyebrow && <div className="full-eyebrow">{eyebrow}</div>}
          <h2 className="full-title">{title}</h2>
          {subtitle && <p className="full-subtitle">{subtitle}</p>}
        </div>
      )}
    </>
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
    data.storyRoles?.length === 5 ? data.storyRoles : DEFAULT_STORY_ROLES

  return (
    <div
      className={`full-story-cards full-story-deck${live ? " full-story-hold holding" : ""}`}
    >
      {roles.map((role, i) => {
        const a = winners[i]
        const ready =
          Boolean(a?.title || a?.alt || a?.imageUrl) && (!progress || i < count)
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
              <div className="full-story-index full-story-num">
                {num(i + 1)}
              </div>
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
  const connected = new Set(data.connectedTables || [])
  const focused =
    Number.isInteger(data.groupPage) &&
    data.groupPage! >= 0 &&
    data.groupPage! < 4
  const start = focused ? data.groupPage! * 10 : 0
  const columns = focused ? 2 : 4
  const size = focused ? 5 : 10

  return (
    <>
      <Head title="FIND YOUR TABLE REPRESENTATIVE" chip="PHONE VOTING" />
      <div className="full-directory-dial">
        <span className="full-directory-dial-label">CALL TO JOIN</span>
        <span className="full-directory-dial-number">
          {data.dialNumber?.trim() || "NUMBER TO BE ADDED"}
        </span>
      </div>
      <div
        className={`full-directory${focused ? " focus" : ""}`}
        data-testid="tadazz-full-directory"
        data-group-page={data.groupPage}
      >
        {Array.from({ length: columns }, (_, column) => {
          const first = start + column * size + 1

          return (
            <div className="full-directory-col" key={column}>
              <div className="full-col-title">
                TABLES {num(first)}–{num(first + size - 1)}
              </div>
              {Array.from({ length: size }, (_, i) => {
                const table = first + i
                const name =
                  data.representatives?.find((rep) => rep.table === table)
                    ?.name || "Name to be supplied"
                const joined = connected.has(table)

                return (
                  <div
                    key={table}
                    className={`full-rep-row${joined ? " connected" : ""}`}
                    data-table={table}
                    aria-label={`Table ${table}: ${name}, ${joined ? "connected" : "waiting"}`}
                  >
                    <span className="full-table-number">{num(table)}</span>
                    <span className="full-rep-name" dir="auto">
                      {name}
                    </span>
                    <span
                      className="full-rep-joined"
                      aria-label={joined ? "Connected" : "Waiting"}
                    />
                  </div>
                )
              })}
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
      <Head
        title="JUST DIAL. THEN CHOOSE."
        chip="KEYPAD VOTING"
        eyebrow="NO APPS. NO SMARTPHONES."
        subtitle="Your table representative votes on an ordinary telephone keypad."
      />
      <div className="full-phone">
        <div className="full-phone-device">
          <div className="full-phone-speaker" />
          <div className="full-phone-display">
            <div className="full-phone-display-small">TADAZZ! IS READY</div>
            <div className="full-phone-display-number">
              {data.dialNumber || "DIAL IN"}
            </div>
          </div>
          <div className="full-phone-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map(
              (key, i) => (
                <div
                  key={key}
                  className={`full-phone-key${i < 5 ? " full-number-key" : ""}`}
                >
                  {key}
                </div>
              ),
            )}
          </div>
          <div className="full-phone-chin" />
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
        ].map(([n, title, text]) => (
          <div className="full-step" key={n}>
            <span className="full-step-num">{n}</span>
            <div className="full-step-info">
              <div className="full-step-head">{title}</div>
              <div className="full-step-text">{text}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function Readiness({ data }: { data: FullShowInput }) {
  const connected = new Set(
    (data.connectedTables || []).filter((n) => n >= 1 && n <= 40),
  )

  return (
    <>
      <Head
        title="THE TABLES ARE LIGHTING UP"
        chip="LIVE CONNECTIONS"
        eyebrow="THE ROOM IS COMING ONLINE"
        subtitle="A light appears for each connected table representative."
      />
      <div className="full-readiness-tray">
        <div className="full-table-grid">
          {Array.from({ length: 40 }, (_, i) => (
            <div
              key={i + 1}
              data-table={i + 1}
              className={`full-table-led${connected.has(i + 1) ? " connected" : ""}`}
            >
              <span className="full-led-label">TABLE</span>
              <span className="full-led-number">{num(i + 1)}</span>
              <span className="full-led-pip" />
            </div>
          ))}
        </div>
      </div>
      <div className="full-connection-status">
        <div className="full-connected-count">
          {connected.size} / 40 TABLES CONNECTED
        </div>
        <div className="full-connection-track">
          <div
            className="full-connection-fill"
            style={{ transform: `scaleX(${connected.size / 40})` }}
          />
        </div>
        <div className="full-connection-legend">
          {data.isLive ? "CONNECTED TABLES" : "PREVIEW DATA — NOT LIVE"}
        </div>
      </div>
    </>
  )
}

export function StoryProgress({ data }: { data: FullShowInput }) {
  const completed = Math.max(0, Math.min(5, data.completed || 0))
  const roles =
    data.storyRoles?.length === 5 ? data.storyRoles : DEFAULT_STORY_ROLES

  return (
    <>
      <Head
        title="YOUR WORLD IS TAKING SHAPE"
        chip={`ROUND ${num(data.round || 1)}`}
        eyebrow={`${completed} OF 5 STORY PIECES COLLECTED`}
        subtitle="Every chosen picture becomes part of the story."
      />
      <div className="full-progress-bridge" />
      <div className="full-progress-cards">
        {roles.map((role, i) => {
          const answer = data.winners?.[i]
          const ready =
            i < completed &&
            Boolean(answer?.title || answer?.alt || answer?.imageUrl)

          return (
            <div
              key={role}
              className={`full-progress-piece${ready ? " is-filled" : ""}`}
            >
              <div className="full-progress-cap">{role}</div>
              <div className="full-progress-frame">
                {ready && answer?.imageUrl ? (
                  <img
                    src={answer.imageUrl}
                    alt={answer.alt || answer.title}
                    className="full-progress-image"
                  />
                ) : (
                  <div className="full-progress-placeholder">?</div>
                )}
              </div>
              <div className="full-progress-name" dir="auto">
                {ready ? answer?.title || answer?.alt : "AWAITING THE VOTE"}
              </div>
              <div className="full-progress-index">{num(i + 1)}</div>
            </div>
          )
        })}
      </div>
      <div className="full-progress-bottom">
        <span>{completed} / 5</span>
        <span>STORY PIECES READY</span>
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
              {data.onResolveTie && !isResolved && (
                <button
                  type="button"
                  className="full-tie-choose"
                  aria-label={displayTitle}
                  disabled={data.scenePaused}
                  onClick={() => data.onResolveTie?.(i)}
                  data-testid={`host-tie-picture-${i}`}
                />
              )}
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
      <img src={leftCurtain} alt="Curtain Left" className="full-curtain left" />
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
      <img src={artwork} alt="Creating Worlds" className="full-company-event" />
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
}: {
  scene: "round-one" | "round-two"
  data: FullShowInput
}) {
  const isRoundOne = scene === "round-one"

  return (
    <div className="full-round-launch">
      <Head title="" chip={`ROUND ${num(isRoundOne ? 1 : 2)}`} />
      <div className="full-launch-glow" />
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
      return <StoryProgress data={data} />

    case "tie-break":
      return <Tie data={data} />

    case "story-assembly":
    case "story-live":
      return <ReferenceStoryScene scene={scene} data={data}/>

    case "grand-finale":
      return <Finale data={data} />
  }
}

export function renderFullShowScene(
  scene: FullShowScene,
  data: FullShowInput,
): ReactNode {
  if (!isFullShowScene(scene)) {
    return null
  }
  return <FullShowSceneView scene={scene} data={data} />
}
