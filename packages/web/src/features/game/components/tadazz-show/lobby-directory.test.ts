import { describe, expect, it } from "vitest"
import { readPublicLobbyDirectory } from "./lobby-directory"

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
