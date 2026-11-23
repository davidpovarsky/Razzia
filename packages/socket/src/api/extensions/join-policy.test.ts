import { expect, it } from "vitest"
import { resolveGameJoin, type GameJoinPort } from "./join-policy"
const room = (patch: Partial<GameJoinPort> = {}): GameJoinPort => ({
  players: [],
  settings: { generatedUsernames: false },
  locked: false,
  phoneInviteOnly: false,
  findRosterByPhone: () => null,
  ...patch,
})
it("keeps an already joined client ahead of subsequent lock/invite restrictions", () => {
  expect(
    resolveGameJoin(
      room({
        players: [{ clientId: "same", username: "Existing" }],
        locked: true,
        phoneInviteOnly: true,
      }),
      { clientId: "same", source: "phone" },
    ),
  ).toEqual({ kind: "existing", username: "Existing" })
})
it("rejects unlisted telephone joins with the existing distinct reason", () => {
  expect(
    resolveGameJoin(room({ phoneInviteOnly: true }), {
      clientId: "new",
      source: "phone",
      username: "Guest",
    }),
  ).toEqual({
    kind: "denied",
    error: "errors:game.locked",
    status: 403,
    reason: "phone_invite_only",
  })
})
it("uses the registered name and identity through the locked/generated-name path", () => {
  const game = room({
    locked: true,
    phoneInviteOnly: true,
    settings: { generatedUsernames: true },
    findRosterByPhone: (phone) =>
      phone === "+972501234567"
        ? { rosterPlayerId: "registered", displayName: "Registered" }
        : null,
  })
  expect(
    resolveGameJoin(game, {
      clientId: "new",
      phone: "+972-50-123-4567",
      username: "Other",
    }),
  ).toEqual({
    kind: "ticket",
    identity: {
      username: "Registered",
      rosterPlayerId: "registered",
      phoneE164: "+972501234567",
      source: "phone",
    },
  })
})
it("preserves generated names, missing-name errors and ordinary room locking", () => {
  expect(
    resolveGameJoin(room({ settings: { generatedUsernames: true } }), {
      clientId: "new",
    }),
  ).toMatchObject({
    kind: "ticket",
    identity: { username: undefined, source: "web" },
  })
  expect(resolveGameJoin(room(), { clientId: "new" })).toEqual({
    kind: "denied",
    error: "errors:auth.usernameTooShort",
    status: 400,
  })
  expect(
    resolveGameJoin(room({ locked: true }), {
      clientId: "new",
      username: "Guest",
    }),
  ).toEqual({ kind: "denied", error: "errors:game.locked", status: 403 })
})
it("retains an explicit browser source even with a normalized telephone identity", () => {
  expect(
    resolveGameJoin(room(), {
      clientId: "new",
      username: "Guest",
      phone: "+972501234567",
      source: "web",
    }),
  ).toMatchObject({
    kind: "ticket",
    identity: { phoneE164: "+972501234567", source: "web" },
  })
})
