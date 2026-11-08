import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import { createDefaultQuizExtrasV2, quizExtrasV2Schema } from "../../core/index"
import { ExtensionGameSession } from "./session"
import { buildFullShowDirectory, buildLobbyDirectory } from "./public-directory"
import type { RosterEntry } from "./roster/types"

function fixture(count = 1, seatingPlan = true) {
  const extras = createDefaultQuizExtrasV2(
    "directory-sync",
    Array.from({ length: count }, () => randomUUID()),
    "0".repeat(64),
  )
  const id = randomUUID()
  extras.scenes[id] = {
    id,
    kind: "animation",
    preset: "representative-directory",
    title: "Directory",
    durationMs: 1000,
    advance: "manual",
    seatingPlan,
    representatives: [
      { table: 5, name: "QA Representative" },
      { table: 5, name: "Second Representative" },
    ],
    dialNumber: "TEST-NO-CALLS",
  }

  return extras
}
function entry(
  name: string,
  tableNumber?: number,
  status: RosterEntry["status"] = "connected",
): RosterEntry {
  return {
    rosterPlayerId: randomUUID(),
    clientId: randomUUID(),
    displayName: name,
    tableNumber,
    phoneE164: "+10000000000",
    phoneRaw: "PRIVATE-CONTACT",
    source: "web",
    status,
    points: 0,
    preRegistered: true,
  }
}

describe("reconciled branch seating directory", () => {
  it("accepts old explicit seating metadata and projects authored names before anyone connects", () => {
    const extras = quizExtrasV2Schema.parse(fixture())
    const session = new ExtensionGameSession("test-directory", extras)
    const result = session.getStateSnapshot("player", []).extras.lobbyFullShow
    expect(result).toEqual({
      isLive: false,
      seatingPlan: true,
      representatives: [
        { table: 5, name: "QA Representative" },
        { table: 5, name: "Second Representative" },
      ],
      connectedTables: [],
      dialNumber: "TEST-NO-CALLS",
    })
  })
  it("uses authoritative explicit table identity even when display names match another assignment", () => {
    const projection = buildFullShowDirectory(fixture(), [
      entry("QA Representative", 9),
    ])
    expect(projection.connectedTables).toEqual([9])
    expect(JSON.stringify(projection)).not.toContain("PRIVATE-CONTACT")
    expect(JSON.stringify(projection)).not.toContain("+10000000000")
    expect(projection).not.toHaveProperty("rosterPlayerId")
  })
  it("maps old name-only connections, deduplicates a shared table and clears disconnected presence", () => {
    const extras = fixture()
    const first = entry("  qa   REPRESENTATIVE  ")
    const second = entry("Second Representative")
    expect(
      buildFullShowDirectory(extras, [first, second]).connectedTables,
    ).toEqual([5])
    first.status = "disconnected"
    expect(
      buildFullShowDirectory(extras, [first, second]).connectedTables,
    ).toEqual([5])
    second.status = "disconnected"
    expect(
      buildFullShowDirectory(extras, [first, second]).connectedTables,
    ).toEqual([])
  })
  it("does not publish an ordinary unflagged show's roster through the lobby directory", () => {
    const extras = fixture(1, false)
    extras.roster.participants = [
      {
        rosterPlayerId: randomUUID(),
        displayName: "Private roster name",
        phoneE164: null,
        tableNumber: 7,
      },
    ]
    expect(buildLobbyDirectory(extras)).toBeNull()
  })
  it("preserves the current unflagged ten-question lobby and explicit roster table numbers", () => {
    const extras = fixture(10, false)
    extras.roster.participants = [
      {
        rosterPlayerId: randomUUID(),
        displayName: "Current Representative",
        phoneE164: null,
        tableNumber: 7,
      },
    ]
    const live = buildFullShowDirectory(extras, [
      entry("Current Representative", 7),
    ])
    expect(buildLobbyDirectory(extras, () => live)).toEqual({
      isLive: true,
      representatives: [{ table: 7, name: "Current Representative" }],
      connectedTables: [7],
      dialNumber: "TEST-NO-CALLS",
    })
  })
})
