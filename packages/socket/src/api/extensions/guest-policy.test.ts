import { SESSION_ROLES } from "@razzia/common/constants"
import { app } from "@razzia/socket/app"
import { mintToken, verifyJoinTicket } from "@razzia/socket/services/auth"
import { getPath, initConfig, saveQuizz } from "@razzia/socket/services/config"
import { setIo } from "@razzia/socket/services/io"
import Registry from "@razzia/socket/services/registry"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import fs from "node:fs"
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

const fake = createFakeIo()
let ownerToken = ""
let otherOwnerToken = ""
let guestToken = ""

function request({
  path,
  token,
  body,
  method = "POST",
}: {
  path: string
  token: string
  body: unknown
  method?: string
}) {
  return app.request(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

async function createRoom() {
  const { id: quizzId } = saveQuizz(createQuizz([createQuestion()]))
  const response = await request({
    path: "/games",
    token: ownerToken,
    body: { quizzId },
  })
  expect(response.status).toBe(201)

  return (await response.json()) as { gameId: string; inviteCode: string }
}

beforeAll(async () => {
  setIo(fake.io)
  ownerToken = (await mintToken("owner", SESSION_ROLES.MANAGER)).token
  otherOwnerToken = (await mintToken("other-owner", SESSION_ROLES.MANAGER))
    .token
  guestToken = (await mintToken("guest", SESSION_ROLES.PLAYER)).token
})

beforeEach(() => {
  fs.rmSync(getPath(), { recursive: true, force: true })
  initConfig()
})

afterEach(() => {
  const registry = Registry.getInstance()
  for (const game of registry.getAllGames()) {
    registry.removeGame(game.gameId)
  }
})

describe("owner-controlled event-roster admission", () => {
  it("rejects guests and other owners without changing the room policy", async () => {
    const { gameId } = await createRoom()
    const game = Registry.getInstance().getGameById(gameId)!
    const before = game.getHostPresenceSnapshot()

    for (const token of ["", guestToken, otherOwnerToken]) {
      const response = await request({
        path: `/games/${gameId}/roster/settings`,
        token,
        body: { allowUnregisteredPlayers: false },
        method: "PATCH",
      })
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect(response.status).toBeLessThan(500)
      expect(game.getHostPresenceSnapshot()).toEqual(before)
    }

    const empty = await request({
      path: `/games/${gameId}/roster/settings`,
      token: ownerToken,
      body: {},
      method: "PATCH",
    })
    expect(empty.status).toBe(400)
    expect(game.getHostPresenceSnapshot()).toEqual(before)
  })

  it("atomically clears the phone restriction when the owner enables guests", async () => {
    const { gameId } = await createRoom()
    expect(
      (
        await request({
          path: `/games/${gameId}/roster/settings`,
          token: ownerToken,
          body: { phoneInviteOnly: true },
          method: "PATCH",
        })
      ).status,
    ).toBe(200)

    const enabled = await request({
      path: `/games/${gameId}/roster/settings`,
      token: ownerToken,
      body: { allowUnregisteredPlayers: true, phoneInviteOnly: true },
      method: "PATCH",
    })
    expect(enabled.status).toBe(200)
    expect(await enabled.json()).toMatchObject({
      presence: {
        gameId,
        allowUnregisteredPlayers: true,
        phoneInviteOnly: false,
      },
    })
    expect(Registry.getInstance().getGameById(gameId)!.settings).toMatchObject({
      allowUnregisteredPlayers: true,
      phoneInviteOnly: false,
    })
  })

  it("keeps the entry screen available but denies new guests and stale tickets", async () => {
    const { gameId, inviteCode } = await createRoom()
    const issued = await request({
      path: "/games/join",
      token: guestToken,
      body: {
        inviteCode,
        username: "Guest",
      },
    })
    expect(issued.status).toBe(200)
    const { ticket } = (await issued.json()) as { ticket: string }
    const claims = await verifyJoinTicket(ticket)

    const closed = await request({
      path: `/games/${gameId}/roster/settings`,
      token: ownerToken,
      body: { allowUnregisteredPlayers: false },
      method: "PATCH",
    })
    expect(closed.status).toBe(200)

    expect(
      (await request({ path: "/games/check", token: "", body: { inviteCode } }))
        .status,
    ).toBe(200)
    const rejected = await request({
      path: "/games/join",
      token: guestToken,
      body: {
        inviteCode,
        username: "Guest",
      },
    })
    expect(rejected.status).toBe(403)
    expect(await rejected.json()).toMatchObject({ reason: "roster_only" })

    const game = Registry.getInstance().getGameById(gameId)!
    expect(
      game.join(fake.createSocket("stale-ticket", "guest"), claims.username, {
        rosterPlayerId: claims.rosterPlayerId,
        phoneE164: claims.phoneE164,
        source: claims.source,
      }),
    ).toBe("errors:game.locked")
    expect(game.players).toHaveLength(0)

    const registered = await request({
      path: `/games/${gameId}/roster`,
      token: ownerToken,
      body: {
        displayName: "Registered",
      },
    })
    expect(registered.status).toBe(200)
    const registeredToken = (
      await mintToken("registered", SESSION_ROLES.PLAYER)
    ).token
    const admitted = await request({
      path: "/games/join",
      token: registeredToken,
      body: {
        inviteCode,
        username: "Registered",
      },
    })
    expect(admitted.status).toBe(200)
    const registeredClaims = await verifyJoinTicket(
      ((await admitted.json()) as { ticket: string }).ticket,
    )
    expect(registeredClaims.rosterPlayerId).toBeTruthy()
    expect(
      game.join(
        fake.createSocket("registered-socket", "registered"),
        registeredClaims.username,
        {
          rosterPlayerId: registeredClaims.rosterPlayerId,
          source: registeredClaims.source,
        },
      ),
    ).toBeNull()
    expect(game.players).toHaveLength(1)
    expect(game.players[0].username).toBe("Registered")
  })
})
