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

function legacyFixture(participantCount = 38, questionCount = 10) {
  const extras = fixture(questionCount, false)

  for (const scene of Object.values(extras.scenes)) {
    if (scene.kind === "animation") {
      delete scene.seatingPlan
      delete scene.representatives
    }
  }

  extras.roster.participants = Array.from(
    { length: participantCount },
    (_, index) => ({
      rosterPlayerId: randomUUID(),
      displayName: `Legacy Representative ${index + 1}`,
      phoneE164: null,
      tableNumber: (index % 31) + 1,
    }),
  )

  return extras
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
    const guest = { ...entry("Unlisted guest", 5), preRegistered: false }
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
  it("tracks registers attached, replaced and removed after the room has opened", () => {
    const extras = fixture(23, false)
    extras.defaults.lobby = { joinMode: "phone-only", showRoster: true }
    const first = entry("Attached during the lobby")
    const guest = { ...entry("Unregistered guest"), preRegistered: false }
    const second = entry("Replacement register", undefined, "not_joined")
    let liveEntries = [first, guest]
    const getLive = () => buildFullShowDirectory(extras, liveEntries)
    expect(buildLobbyDirectory(extras, getLive)?.roster).toEqual([
      { id: first.rosterPlayerId, label: first.displayName, connected: true },
    ])
    liveEntries = [second, guest]
    expect(buildLobbyDirectory(extras, getLive)?.roster).toEqual([
      {
        id: second.rosterPlayerId,
        label: second.displayName,
        connected: false,
      },
    ])
    liveEntries = [guest]
    expect(buildLobbyDirectory(extras, getLive)?.roster).toEqual([])
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
  it("recognizes complete saved legacy seating in both public paths without rewriting the 38-person roster", () => {
    const extras = quizExtrasV2Schema.parse(legacyFixture())
    const before = structuredClone(extras)
    const liveEntries = extras.roster.participants.map((person, index) => ({
      ...entry(
        person.displayName,
        person.tableNumber,
        index === 0 || index === 31 ? "connected" : "not_joined",
      ),
      rosterPlayerId: person.rosterPlayerId,
    }))
    const live = buildFullShowDirectory(extras, liveEntries)
    const lobby = buildLobbyDirectory(extras, () => live)
    const saved = buildLobbyDirectory(extras)
    const expected = extras.roster.participants.map((person) => ({
      table: person.tableNumber,
      name: person.displayName,
    }))

    for (const projection of [live, lobby, saved]) {
      expect(projection?.seatingPlan).toBe(true)
      expect(projection?.representatives).toEqual(expected)
      expect(projection?.representatives).toHaveLength(38)
      expect(
        new Set(projection?.representatives?.map((row) => row.table)).size,
      ).toBe(31)
      expect(JSON.stringify(projection)).not.toContain("+10000000000")
      expect(JSON.stringify(projection)).not.toContain("PRIVATE-CONTACT")
      expect(JSON.stringify(projection)).not.toContain("rosterPlayerId")
    }

    expect(live.connectedTables).toEqual([1])
    expect(lobby?.connectedTables).toEqual([1])
    expect(saved?.connectedTables).toEqual([])
    liveEntries.forEach((person) => {
      person.status = "disconnected"
    })
    expect(buildFullShowDirectory(extras, liveEntries).connectedTables).toEqual(
      [],
    )
    expect(extras).toEqual(before)
  })
  it("keeps all 40 unassigned representatives generic instead of inferring seating from generated indexes", () => {
    const extras = legacyFixture(40)
    extras.roster.participants.forEach((person) => {
      delete person.tableNumber
    })
    const before = structuredClone(extras)
    const live = buildFullShowDirectory(
      extras,
      extras.roster.participants.map((person) => entry(person.displayName)),
    )

    for (const projection of [live, buildLobbyDirectory(extras, () => live)]) {
      expect(projection).not.toHaveProperty("seatingPlan")
      expect(projection?.representatives).toHaveLength(40)
      expect(projection?.representatives?.map((row) => row.name)).toEqual(
        extras.roster.participants.map((person) => person.displayName),
      )
    }

    expect(extras).toEqual(before)
  })
  it.each([false, null, "true", 1])(
    "does not infer seating when an explicit flag is %s",
    (flag) => {
      const extras = legacyFixture()
      Object.values(extras.scenes).forEach((scene) => {
        Object.assign(scene, { seatingPlan: flag })
      })
      const before = structuredClone(extras)

      expect(buildFullShowDirectory(extras, [])).not.toHaveProperty(
        "seatingPlan",
      )
      expect(buildLobbyDirectory(extras)).not.toHaveProperty("seatingPlan")
      expect(quizExtrasV2Schema.safeParse(extras).success).toBe(flag === false)
      expect(extras).toEqual(before)
    },
  )
  it("preserves explicit seating opt-in outside the legacy ten-question boundary", () => {
    const extras = fixture(1, true)

    expect(buildFullShowDirectory(extras, []).seatingPlan).toBe(true)
    expect(buildLobbyDirectory(extras)?.seatingPlan).toBe(true)
  })
  it.each([undefined, 0, 32, 1.5])(
    "requires every saved table assignment to be an integer from 1 to 31, rejecting %s",
    (tableNumber) => {
      const extras = legacyFixture()
      extras.roster.participants = extras.roster.participants.map(
        (person, index) => (index === 0 ? { ...person, tableNumber } : person),
      )

      expect(buildFullShowDirectory(extras, [])).not.toHaveProperty(
        "seatingPlan",
      )
      expect(buildLobbyDirectory(extras)).not.toHaveProperty("seatingPlan")
    },
  )
  it("requires all 31 distinct saved tables", () => {
    const extras = legacyFixture()
    extras.roster.participants.forEach((person) => {
      if (person.tableNumber === 31) {
        person.tableNumber = 30
      }
    })

    expect(buildFullShowDirectory(extras, [])).not.toHaveProperty("seatingPlan")
    expect(buildLobbyDirectory(extras)).not.toHaveProperty("seatingPlan")
  })
  it.each([1, 9, 11])(
    "retains the existing legacy ten-question boundary for %s questions",
    (questionCount) => {
      const extras = legacyFixture(38, questionCount)

      expect(buildFullShowDirectory(extras, [])).not.toHaveProperty(
        "seatingPlan",
      )
      expect(buildLobbyDirectory(extras)).toBeNull()
    },
  )
  it("does not infer seating over a modern lobby or authored representatives override", () => {
    const extras = legacyFixture()
    extras.defaults.lobby = { joinMode: "phone-only", showRoster: true }

    expect(buildFullShowDirectory(extras, [])).not.toHaveProperty("seatingPlan")
    expect(buildLobbyDirectory(extras)).not.toHaveProperty("seatingPlan")
    delete extras.defaults.lobby

    for (const representatives of [
      [],
      [{ table: 1, name: "Authored override" }],
    ]) {
      Object.values(extras.scenes).forEach((scene) => {
        Object.assign(scene, { representatives })
      })
      expect(buildFullShowDirectory(extras, [])).not.toHaveProperty(
        "seatingPlan",
      )
      expect(buildLobbyDirectory(extras)).not.toHaveProperty("seatingPlan")
    }

    extras.scenes = {}
    expect(buildFullShowDirectory(extras, [])).not.toHaveProperty("seatingPlan")
    expect(buildLobbyDirectory(extras)).toBeNull()
  })
})
