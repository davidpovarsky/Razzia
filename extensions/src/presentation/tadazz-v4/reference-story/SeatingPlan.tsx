import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react"
import { SEATING_LAYOUT } from "./seating-layout"
import { STORY_ASSETS } from "./assets"
import { HostQuickGuide } from "./HostQuickGuide"
import "./reference-stages.css"

export interface SeatingLabels {
  call: string
  pin: string
  stage: string
  production: string
  entrance: string
  connected: string
  table: string
  noPhone: string
}
export function SeatingPlan({
  representatives,
  connectedTables,
  dialNumber,
  pin,
  qr,
  labels,
}: {
  representatives: Array<{ table: number; name: string }>
  connectedTables: number[]
  dialNumber?: string
  pin: string
  qr: ReactNode
  labels: SeatingLabels
}) {
  const dial = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = dial.current
    if (!el) return
    let size = 67
    el.style.fontSize = `${size}px`
    while (el.scrollWidth > 420 && size > 33) el.style.fontSize = `${--size}px`
  }, [dialNumber, labels.noPhone])
  const connected = new Set(connectedTables)
  // Reference uses first name + surname initial; retain each real roster entry.
  const shortName = (name: string) => {
    const parts = name.trim().split(/\s+/)
    return parts.length < 2
      ? name
      : `${parts.slice(0, -1).join(" ")} ${parts.at(-1)![0]}.`
  }
  return (
    <div className="tadazz-reference-seating has-host-guide" data-testid="tadazz-screen-lobby">
      <div id="screen">
        <aside className="left-panel">
          <div className="left-accent" aria-hidden="true" />
          <img className="logo" src={STORY_ASSETS.logo} alt="TADAZZ!" />
          <section className="dial-info">
            <div className="dial-caption">{labels.call}</div>
            <div ref={dial} className="dial-number" dir="ltr">
              {dialNumber?.trim() || labels.noPhone}
            </div>
            <div className="phone-rule" />
            <div className="qr-and-pin">
              <div className="qr" data-testid="tadazz-lobby-qr">
                {qr}
              </div>
              <div className="pin-area">
                <div className="pin-caption">{labels.pin}</div>
                <div className="pin-number" data-testid="tadazz-lobby-pin">
                  {pin}
                </div>
              </div>
            </div>
          </section>
          <HostQuickGuide />
          <div className="join-note" data-testid="tadazz-lobby-count">
            {labels.connected}
          </div>
        </aside>
        <div className="room" data-testid="tadazz-full-directory">
          <div className="stage">
            <span>{labels.stage}</span>
          </div>
          <div className="door-marker door-left" />
          <div className="door-marker door-right" />
          <div className="floorplan">
            {SEATING_LAYOUT.map(({ table, shape, x, y }) => {
              const names = representatives
                .filter((rep) => rep.table === table)
                .map((rep) => rep.name)
              return (
                <div
                  key={table}
                  className={[
                    "table-unit",
                    shape,
                    connected.has(table) && "connected",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-table={table}
                  data-connected={connected.has(table)}
                  aria-label={`${labels.table} ${table}: ${names.join(", ")}`}
                  style={{ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties}
                >
                  <div className="top" aria-hidden="true">
                    <span className="table-number">{table}</span>
                  </div>
                  <div className="table-label">
                    {shape.startsWith("banquet")
                      ? names.map((name, i) => (
                          <span key={i} title={name}>
                            {shortName(name)}
                          </span>
                        ))
                      : names.map(shortName).join(" / ")}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="venue-sign production">{labels.production}</div>
          <div className="venue-sign entrance">
            <div className="doors" aria-hidden="true" />
            {labels.entrance}
          </div>
        </div>
      </div>
    </div>
  )
}
