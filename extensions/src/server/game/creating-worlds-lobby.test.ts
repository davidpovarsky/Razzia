import { describe, expect, it } from "vitest"
import { createDefaultQuizExtrasV2 } from "../../core/studio-timeline-schema"
import { ExtensionGameSession } from "./session"

describe("Creating Worlds: authoritative lobby roster", () => {
  const makeExtras = () => {
    const questionIds = Array.from({ length: 10 }, () => crypto.randomUUID())
    const extras = createDefaultQuizExtrasV2(
      "creating-worlds",
      questionIds,
      "a".repeat(64),
    )
    extras.roster.participants = Array.from({ length: 40 }, (_, index) => ({
      rosterPlayerId: `table-${index + 1}`,
      displayName: `Representative ${index + 1}`,
      phoneE164: null,
    }))
    const id = crypto.randomUUID()
    extras.scenes[id] = {
      id,
      kind: "animation",
      preset: "representative-directory",
      advance: "manual",
      durationMs: 10000,
    }

    return extras
  }

  it("shows all 40 names while zero players are connected, without a delegate", () => {
    const session = new ExtensionGameSession("test-game", makeExtras())
    const snapshot = session.getStateSnapshot("manager", [])
    const fullShow = snapshot.extras.lobbyFullShow as {
      representatives: Array<{ table: number; name: string }>
      connectedTables: number[]
      isLive: boolean
    }
    expect(fullShow.representatives).toHaveLength(40)
    expect(fullShow.representatives[0]).toEqual({
      table: 1,
      name: "Representative 1",
    })
    expect(fullShow.representatives[39]).toEqual({
      table: 40,
      name: "Representative 40",
    })
    expect(fullShow.connectedTables).toEqual([])
    expect(fullShow.isLive).toBe(false)
  })

  it("uses live connected-table indicators without removing stored names", () => {
    const session = new ExtensionGameSession("test-game", makeExtras())
    session.setDelegate({
      getFullShowData: () => ({
        representatives: [],
        connectedTables: [3, 12],
        isLive: true,
      }),
    })
    const fullShow = session.getStateSnapshot("manager", []).extras
      .lobbyFullShow as {
      representatives: Array<{ table: number; name: string }>
      connectedTables: number[]
    }
    expect(fullShow.representatives).toHaveLength(40)
    expect(fullShow.connectedTables).toEqual([3, 12])
  })

  it("does not turn unrelated quizzes into a table directory", () => {
    const extras = makeExtras()
    extras.scenes = {}
    const session = new ExtensionGameSession("test-game", extras)
    expect(
      session.getStateSnapshot("manager", []).extras.lobbyFullShow,
    ).toBeUndefined()
  })

  it("keeps multiple representatives at a real table and never publishes private phones", () => {
    const extras = makeExtras()
    extras.roster.participants = extras.roster.participants
      .slice(0, 37)
      .map((person, index) => ({
        ...person,
        tableNumber: index < 31 ? index + 1 : index - 30,
        phoneE164: `+44770090${String(index).padStart(4, "0")}`,
      }))
    const snapshot = new ExtensionGameSession(
      "test-game",
      extras,
    ).getStateSnapshot("player", [])
    const fullShow = snapshot.extras.lobbyFullShow as {
      representatives: Array<{ table: number; name: string }>
    }
    expect(fullShow.representatives).toHaveLength(37)
    expect(
      new Set(fullShow.representatives.map((person) => person.table)).size,
    ).toBe(31)
    expect(
      fullShow.representatives.filter((person) => person.table === 1),
    ).toHaveLength(2)
    expect(JSON.stringify(snapshot)).not.toContain("+44770090")
  })
})
