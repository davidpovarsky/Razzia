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
  it("supports a phone-only 23-question lobby without inventing or requiring a roster", () => {
    const extras = fixture(23, false)
    extras.scenes = {}
    extras.defaults.presentationLocale = "en"
    extras.defaults.lobby = {
      joinMode: "phone-only",
      dialNumber: "+44 20 0000 0000",
      showRoster: true,
      instructions: ["Stay on the line."],
    }
    expect(quizExtrasV2Schema.parse(extras).defaults.presentationLocale).toBe(
      "en",
    )
    expect(buildLobbyDirectory(extras)).toEqual({
      isLive: false,
      joinMode: "phone-only",
      dialNumber: "+44 20 0000 0000",
      instructions: ["Stay on the line."],
      roster: [],
    })
  })
  it("publishes only explicitly attached names and stable individual presence, including disconnects", () => {
    const extras = fixture(23, false)
    extras.defaults.lobby = { joinMode: "phone-only", showRoster: true }
    const first = entry("Same name", 5)
    const second = entry("Same name", 5, "not_joined")
    const guest = entry("Unlisted guest", 5)
    extras.roster.participants = [first, second].map((person) => ({
      rosterPlayerId: person.rosterPlayerId,
      displayName: person.displayName,
      phoneE164: person.phoneE164,
      tableNumber: person.tableNumber,
    }))
    const getLive = () => buildFullShowDirectory(extras, [first, second, guest])
    const result = buildLobbyDirectory(extras, getLive)
    expect(result?.roster).toEqual([
      { id: first.rosterPlayerId, label: "Same name", connected: true },
      { id: second.rosterPlayerId, label: "Same name", connected: false },
    ])
    expect(JSON.stringify(result)).not.toContain("Unlisted guest")
    expect(JSON.stringify(result)).not.toContain("PRIVATE-CONTACT")
    expect(JSON.stringify(result)).not.toContain("+10000000000")
    first.status = "disconnected"
    second.status = "connected"
    expect(
      buildLobbyDirectory(extras, getLive)?.roster?.map((row) => row.connected),
    ).toEqual([false, true])
    extras.defaults.lobby.showRoster = false
    expect(buildLobbyDirectory(extras, getLive)).not.toHaveProperty("roster")
  })
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
