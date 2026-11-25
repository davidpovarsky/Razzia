import { describe, expect, it, vi } from "vitest"
import { GameRoster } from "./index"
import type { BrowserJoinInput } from "./browser-identity"

function fixture() {
  const roster = new GameRoster({
    players: { getAll: () => [], findByClientId: () => undefined },
    onPlayerRenamed: vi.fn(),
    kickPlayer: vi.fn(),
    onChange: vi.fn(),
    setPhoneInviteOnly: vi.fn(),
  })
  const registered = roster.upsert({ displayName: "Registered" })
  const resolve = (input: Partial<BrowserJoinInput> = {}) =>
    roster.resolveBrowserJoin({
      clientId: "new",
      username: "Guest",
      isCreatingWorldsShow: false,
      temporaryGuestsAllowed: false,
      phoneInviteOnly: false,
      ...input,
    })

  return { roster, registered, resolve }
}

describe("shared roster guest policy", () => {
  it("preserves legacy ordinary, Creating Worlds and temporary-guest defaults", () => {
    const { resolve } = fixture()
    expect(resolve().error).toBeUndefined()
    expect(resolve({ isCreatingWorldsShow: true }).error).toBe(
      "errors:game.locked",
    )
    expect(
      resolve({ isCreatingWorldsShow: true, temporaryGuestsAllowed: true })
        .error,
    ).toBeUndefined()
  })

  it("lets an explicit owner policy override the Creating Worlds default", () => {
    const { resolve } = fixture()
    expect(
      resolve({
        isCreatingWorldsShow: true,
        allowUnregisteredPlayers: true,
      }).error,
    ).toBeUndefined()
    expect(
      resolve({
        temporaryGuestsAllowed: true,
        allowUnregisteredPlayers: false,
      }).error,
    ).toBe("errors:game.locked")
  })

  it("keeps the independent phone invitation constraint", () => {
    const { resolve } = fixture()
    expect(
      resolve({
        allowUnregisteredPlayers: true,
        phoneInviteOnly: true,
        claimsExtra: { source: "phone", phoneE164: "+972501234567" },
      }).error,
    ).toBe("errors:game.locked")
  })

  it("resolves only an existing registered name when new guests are disabled", () => {
    const { registered, resolve } = fixture()
    expect(
      resolve({
        username: "  REGISTERED  ",
        allowUnregisteredPlayers: false,
      }).entry?.rosterPlayerId,
    ).toBe(registered.rosterPlayerId)
    expect(
      resolve({ username: "Other", allowUnregisteredPlayers: false }).error,
    ).toBe("errors:game.locked")
  })

  it("recognizes the authenticated admitted client, without matching other guest names", () => {
    const { roster, resolve } = fixture()
    roster.recordBrowserJoin({
      clientId: "admitted",
      finalUsername: "Existing Guest",
      normalizedPhone: null,
    })
    const existingId = roster.clientIndex.get("admitted")!
    const entry = roster.entries.get(existingId)!
    entry.points = 42
    const before = structuredClone(entry)

    expect(
      resolve({
        clientId: "admitted",
        username: "Changed name",
        allowUnregisteredPlayers: false,
      }).entry,
    ).toBe(entry)
    expect(entry).toEqual(before)
    expect(
      resolve({
        clientId: "different",
        username: "Existing Guest",
        allowUnregisteredPlayers: false,
      }).error,
    ).toBe("errors:game.locked")
    expect(roster.entries.size).toBe(2)
  })
})
