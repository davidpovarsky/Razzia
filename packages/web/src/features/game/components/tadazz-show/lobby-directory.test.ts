import { describe, expect, it } from "vitest"
import { readPublicLobbyDirectory } from "./lobby-directory"

it("keeps public register presence without private contacts or caller records", () => {
  expect(
    readPublicLobbyDirectory({
      dialNumber: "+44 20 0000 0000",
      joinMode: "phone-only",
      instructions: ["Stay on the line.", 4],
      roster: [
        { id: "a", label: "Alex", connected: true, phoneE164: "PRIVATE" },
        { id: "b", label: "Bea", connected: false },
        { id: "bad", label: 1, connected: true },
      ],
      activeCallId: "PRIVATE-CALL",
    }),
  ).toEqual({
    dialNumber: "+44 20 0000 0000",
    joinMode: "phone-only",
    instructions: ["Stay on the line."],
    roster: [
      { id: "a", label: "Alex", connected: true },
      { id: "b", label: "Bea", connected: false },
    ],
  })
})

describe("public lobby directory boundary", () => {
  it("keeps public tables and names without copying private contact fields", () => {
    expect(
      readPublicLobbyDirectory({
        dialNumber: "+12025550100",
        representatives: [
          {
            table: 3,
            name: "QA table",
            phoneE164: "+12025550101",
            clientId: "private",
          },
        ],
        connectedTables: [3],
        token: "private",
      }),
    ).toEqual({
      dialNumber: "+12025550100",
      representatives: [{ table: 3, name: "QA table" }],
      connectedTables: [3],
    })
  })
  it("ignores malformed entries and cannot derive a directory from private presence", () => {
    expect(readPublicLobbyDirectory(null)).toBeUndefined()
    expect(
      readPublicLobbyDirectory({
        players: [{ displayName: "Private person", phoneE164: "+12025550101" }],
      }),
    ).toEqual({})
    expect(
      readPublicLobbyDirectory({
        representatives: [
          null,
          { table: -1, name: "No" },
          { table: 4, name: "" },
          { table: 4, name: "QA" },
        ],
        connectedTables: [4, "4", -1, Infinity],
      }),
    ).toEqual({
      representatives: [{ table: 4, name: "QA" }],
      connectedTables: [4],
    })
  })
})
