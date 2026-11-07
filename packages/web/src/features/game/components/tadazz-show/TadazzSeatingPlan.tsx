import { TADAZZ_LOGO_URL } from "@razzia/extensions/presentation"
import { QRCodeSVG } from "qrcode.react"
import "./TadazzSeatingPlan.css"

export type SeatingRepresentative = { table: number; name: string }

type SeatingPlanProps = {
  representatives: SeatingRepresentative[]
  connectedTables?: number[]
  inviteCode?: string
  dialNumber?: string
  locked?: boolean
  joinOrigin?: string
}

type SeatPosition = {
  table: number
  x: number
  y: number
  banquet?: boolean
  central?: boolean
}

// Topology follows the supplied SBS floor plan: stage at the top, long
// tables on both sides, round tables in the centre, entrance at the bottom.
// The portrait floor plan is reflowed for the game's 1920 x 1080 stage.
const POSITIONS: SeatPosition[] = [
  ...[11, 7, 1].map((table, i) => ({
    table,
    x: 40,
    y: 92 + i * 219,
    banquet: true,
  })),
  ...[12, 10, 9, 8, 6].map((table, i) => ({
    table,
    x: 279,
    y: 78 + i * 124,
  })),
  ...[5, 4, 3, 2].map((table, i) => ({
    table,
    x: 505,
    y: 140 + i * 124,
  })),
  ...[13, 14, 15, 16, 17, 18, 19].map((table, i) => ({
    table,
    x: 810,
    y: 60 + i * 96,
    central: true,
  })),
  ...[30, 29, 28, 27, 25].map((table, i) => ({
    table,
    x: 1105,
    y: 78 + i * 124,
  })),
  ...[24, 23, 21, 20].map((table, i) => ({
    table,
    x: 1331,
    y: 140 + i * 124,
  })),
  ...[31, 26, 22].map((table, i) => ({
    table,
    x: 1640,
    y: 92 + i * 219,
    banquet: true,
  })),
]

export function TadazzSeatingPlan({
  representatives,
  connectedTables = [],
  inviteCode,
  dialNumber,
  locked = false,
  joinOrigin,
}: SeatingPlanProps) {
  const names = new Map<number, string[]>()
  for (const representative of representatives) {
    if (representative.table < 1 || representative.table > 31) continue
    const known = names.get(representative.table) ?? []
    if (!known.includes(representative.name)) {
      names.set(representative.table, [...known, representative.name])
    }
  }
  const connected = new Set(connectedTables)
  const joinedCount = [...names.keys()].filter((n) => connected.has(n)).length
  const assignedCount = names.size
  const baseUrl =
    joinOrigin ??
    (typeof window === "undefined" ? "" : window.location.origin)
  const joinUrl = inviteCode
    ? baseUrl + "?pin=" + encodeURIComponent(inviteCode)
    : ""
  const displayedNumber = dialNumber?.trim() || "CALL-IN NUMBER NOT SET"
  const displayedPin = inviteCode
    ? locked
      ? inviteCode.replace(/./g, "#")
      : inviteCode
    : "—"

  return (
    <div className="tz-seating-screen" data-testid="tadazz-seating-plan">
      <div className="tz-seating-orb tz-seating-orb-left" aria-hidden="true" />
      <div className="tz-seating-orb tz-seating-orb-right" aria-hidden="true" />

      <header className="tz-seating-header">
        <div className="tz-seating-heading">
          <div className="tz-seating-eyebrow">WELCOME TO THE SHOW</div>
          <h1>FIND YOUR <em>TABLE</em></h1>
          <p>Look for your name, then watch your table light up.</p>
        </div>
        <div className="tz-seating-phone" data-testid="tadazz-seating-phone">
          <span>CALL THIS NUMBER TO JOIN</span>
          <strong>{displayedNumber}</strong>
        </div>
        <div className="tz-seating-join-details">
          <img src={TADAZZ_LOGO_URL} alt="TADAZZ!" />
          <div className="tz-seating-join-mini">
            <div className="tz-seating-pin">
              <span>GAME PIN</span>
              <b data-testid="tadazz-seating-pin">{displayedPin}</b>
            </div>
            <div className="tz-seating-qr" data-testid="tadazz-seating-qr">
              {!locked && joinUrl ? (
                <QRCodeSVG value={joinUrl} level="M" />
              ) : (
                <span>QR UNAVAILABLE</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="tz-seating-stage">
        <span>STAGE</span>
        <div aria-hidden="true" />
      </div>

      <main className="tz-seating-map" aria-label="Seating plan">
        <div className="tz-seating-map-glow" aria-hidden="true" />
        {POSITIONS.map((position) => {
          const people = names.get(position.table) ?? []
          const isJoined = connected.has(position.table)
          return (
            <article
              className={
                "tz-seating-table" +
                (position.banquet ? " banquet" : "") +
                (position.central ? " central" : "") +
                (isJoined ? " joined" : "") +
                (people.length === 0 ? " unassigned" : "") +
                (people.length > 1 ? " multi" : "")
              }
              style={{ left: position.x, top: position.y }}
              key={position.table}
              data-table={position.table}
              data-testid={"tadazz-seat-table-" + position.table}
              aria-label={
                "Table " +
                position.table +
                ": " +
                (people.join(", ") || "Unassigned") +
                (isJoined ? " — connected" : " — waiting")
              }
            >
              <div className="tz-seating-table-number">{position.table}</div>
              <div className="tz-seating-table-names">
                {people.length ? (
                  people.map((name) => <span key={name}>{name}</span>)
                ) : (
                  <span>—</span>
                )}
              </div>
              <i className="tz-seating-table-light" aria-hidden="true" />
            </article>
          )
        })}
      </main>

      <footer className="tz-seating-footer">
        <span className="tz-seating-production">PRODUCTIONS TEAM</span>
        <div className="tz-seating-entrance">ENTRANCE <span>↑</span></div>
        <div className="tz-seating-status" data-testid="tadazz-seating-count">
          <i aria-hidden="true" />
          <strong>{joinedCount} / {assignedCount}</strong>
          <span>TABLES CONNECTED</span>
        </div>
      </footer>
    </div>
  )
}
