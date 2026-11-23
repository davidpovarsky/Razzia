import { describe, expect, it } from "vitest"
import { resolveRoomJoin } from "./contract"

const room = {
  origin: "https://show.example.invalid/old/path?pin=999999",
  inviteCode: "246810",
  role: "spectator" as const,
  locked: false,
}
describe("room join public contract", () => {
  it("encodes the current live room at the public route, without stale path or PIN", () => {
    const join = resolveRoomJoin(room)
    expect(join.webUrl).toBe("https://show.example.invalid/game")
    expect(join.qrUrl).toBe("https://show.example.invalid/game?pin=246810")
    expect(join.joinUrl).toBe(join.qrUrl)
    expect(join.displayPin).toBe("246810")
    expect(join.lockState).toBe("open")
  })
  it("removes joining links and QR when the server reports locked", () => {
    const join = resolveRoomJoin({ ...room, locked: true })
    expect(join.lockState).toBe("locked")
    expect(join.displayPin).toBe("######")
    expect(join.qrUrl).toBeUndefined()
    expect(join.joinUrl).toBeUndefined()
  })
  it.each([undefined, "", "123", "1234567", 123456])(
    "does not invent a PIN or QR for invalid room %s",
    (inviteCode) => {
      const join = resolveRoomJoin({ ...room, inviteCode })
      expect(join.lockState).toBe("checking")
      expect(join.pin).toBeUndefined()
      expect(join.qrUrl).toBeUndefined()
    },
  )
  it("waits for authoritative lock state on first paint/reconnect", () => {
    expect(resolveRoomJoin({ ...room, locked: undefined })).toMatchObject({
      pending: true,
      locked: true,
      displayPin: "—",
      qrUrl: undefined,
      joinUrl: undefined,
    })
  })
  it.each(["", "file:///tmp/test", "javascript:alert(1)", "invalid"])(
    "never produces a joining QR from non-web origin %s",
    (origin) =>
      expect(resolveRoomJoin({ ...room, origin }).qrUrl).toBeUndefined(),
  )
  it("publishes only explicitly configured directory dial-in, never participant contacts", () => {
    const directory = {
      dialNumber: "  TEST-NO-CALLS  ",
      phoneE164: "+10000000000",
      participants: [{ phoneRaw: "PRIVATE-CONTACT" }],
    }
    const join = resolveRoomJoin({ ...room, directory })
    expect(join.dialNumber).toBe("TEST-NO-CALLS")
    expect(JSON.stringify(join)).not.toMatch(/PRIVATE-CONTACT|10000000000/u)
    expect(
      resolveRoomJoin({ ...room, directory: { phoneE164: "+10000000000" } })
        .dialNumber,
    ).toBeUndefined()
    expect(
      resolveRoomJoin({ ...room, directory: { dialNumber: " " } }).dialNumber,
    ).toBeUndefined()
  })
  it("keeps manager-only registration counts out of public views", () => {
    const input = { ...room, connectedCount: 5, rosterCount: 40 }
    expect(resolveRoomJoin(input)).not.toHaveProperty("rosterCount")
    expect(resolveRoomJoin(input).connectedCount).toBe(5)
    expect(resolveRoomJoin({ ...input, role: "manager" }).rosterCount).toBe(40)
    expect(
      resolveRoomJoin({ ...input, connectedCount: NaN }).connectedCount,
    ).toBeUndefined()
    expect(
      resolveRoomJoin({ ...input, connectedCount: -1 }).connectedCount,
    ).toBeUndefined()
  })
})
