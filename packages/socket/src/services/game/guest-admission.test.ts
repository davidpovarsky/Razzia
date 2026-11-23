import { EVENTS } from "@razzia/common/constants"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtrasV2,
} from "@razzia/extensions/core"
import { completeCreatingWorldsShow } from "@razzia/extensions/core/creating-worlds-show"
import { writeSidecar } from "@razzia/extensions/server/storage/sidecar"
import { getPath, saveQuizz } from "@razzia/socket/services/config"
import { resolveGameJoin } from "@razzia/socket/api/extensions/join-policy"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { MANAGER, setup } from "@razzia/socket/test/game-setup"
import { mkdirSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("live guest admission at the game boundary", () => {
  it("preserves ordinary admission until an explicit owner override", () => {
    const { game, createSocket } = setup(createQuizz([createQuestion()]), [])
    expect(game.settings.allowUnregisteredPlayers).toBeUndefined()
    expect(game.allowUnregisteredPlayers).toBe(true)
    expect(game.join(createSocket("guest"), "Guest")).toBeNull()
  })

  it("broadcasts an atomic owner change and preserves independent room locking", () => {
    const { game, createSocket, lastEvent } = setup(
      createQuizz([createQuestion()]),
      [],
    )
    game.setPhoneInviteOnly(true)
    game.setLocked(true)
    game.setRosterJoinSettings({ allowUnregisteredPlayers: true })
    expect(game.phoneInviteOnly).toBe(false)
    expect(
      lastEvent(MANAGER, EVENTS.MANAGER.HOST_PRESENCE)?.data,
    ).toMatchObject({
      allowUnregisteredPlayers: true,
      phoneInviteOnly: false,
    })
    expect(game.locked).toBe(true)
    expect(game.join(createSocket("new"), "Guest")).toBe("errors:game.locked")
    expect(game.players).toHaveLength(0)
  })

  it("revalidates admission after a ticket was issued and retains registered names", () => {
    const { game, createSocket } = setup(createQuizz([createQuestion()]), [])
    const issued = resolveGameJoin(game, {
      clientId: "new",
      username: "Guest",
      source: "web",
    })
    expect(issued.kind).toBe("ticket")
    game.setRosterJoinSettings({ allowUnregisteredPlayers: false })
    expect(game.join(createSocket("new"), "Guest", { source: "web" })).toBe(
      "errors:game.locked",
    )

    game.upsertRosterParticipant({ displayName: "Registered" })
    const admitted = resolveGameJoin(game, {
      clientId: "registered",
      username: "Registered",
      source: "web",
    })
    expect(admitted).toMatchObject({
      kind: "ticket",
      identity: { username: "Registered" },
    })
    expect(game.join(createSocket("registered"), "Registered")).toBeNull()
    expect(game.players).toHaveLength(1)
  })

  it("keeps admitted guest identity, score and streak when reconnecting after closure", () => {
    const { game, createSocket } = setup(createQuizz([createQuestion()]), [])
    const first = createSocket("first", "existing-guest")
    expect(game.join(first, "Guest")).toBeNull()
    const [player] = game.players
    player.points = 321
    player.streak = 2
    game.setPlayerDisconnected(first.id)
    game.setRosterJoinSettings({ allowUnregisteredPlayers: false })

    expect(
      resolveGameJoin(game, {
        clientId: "existing-guest",
        username: "Changed",
      }),
    ).toEqual({ kind: "existing", username: "Guest" })
    expect(
      game.join(createSocket("second", "existing-guest"), "Changed"),
    ).toBeNull()
    expect(game.players).toEqual([player])
    expect(player).toMatchObject({
      id: "second",
      username: "Guest",
      points: 321,
      streak: 2,
      connected: true,
    })
    expect(game.getHostPresenceSnapshot().registeredTotal).toBe(1)
  })

  it("does not let a second browser take a connected registered name", () => {
    const { game, createSocket } = setup(createQuizz([createQuestion()]), [])
    game.upsertRosterParticipant({ displayName: "Registered" })
    game.setRosterJoinSettings({ allowUnregisteredPlayers: false })
    expect(game.join(createSocket("first"), "Registered")).toBeNull()
    expect(game.join(createSocket("other"), "Registered")).toBe(
      "errors:game.playerAlreadyConnected",
    )
    expect(game.players).toHaveLength(1)
  })
})

it("uses one effective Creating Worlds roster policy for UI, HTTP and native phone before and after overrides", () => {
  mkdirSync(getPath("quizz"), { recursive: true })
  const base = createQuizz(Array.from({ length: 10 }, () => createQuestion()))
  const { id } = saveQuizz(base)
  const extras = createDefaultQuizExtrasV2(
    id,
    base.questions.map(() => crypto.randomUUID()),
    computeCanonicalBaseDigest(base),
  )
  extras.roster.phoneInviteOnly = false
  extras.roster.participants = [
    {
      rosterPlayerId: crypto.randomUUID(),
      displayName: "Registered caller",
      phoneE164: "+972501111111",
    },
  ]
  writeSidecar(getPath, id, completeCreatingWorldsShow(extras))
  const saved = { ...base, id }
  const { game } = setup(saved, [])

  expect(game.settings.allowUnregisteredPlayers).toBeUndefined()
  expect(game.phoneInviteOnly).toBe(false)
  expect(game.allowUnregisteredPlayers).toBe(false)
  expect(game.getHostPresenceSnapshot().allowUnregisteredPlayers).toBe(false)
  expect(
    resolveGameJoin(game, { clientId: "new-web", username: "Guest" }),
  ).toMatchObject({ kind: "denied", reason: "roster_only" })
  expect(
    game.joinOrRebindPhoneCaller({
      phoneRaw: "+972502222222",
      callId: "default-denied",
      fallbackName: "Guest",
    }),
  ).toEqual({ ok: false, error: "errors:game.locked" })
  expect(game.players).toHaveLength(0)
  expect(game.settings.allowUnregisteredPlayers).toBeUndefined()

  expect(
    game.joinOrRebindPhoneCaller({
      phoneRaw: "+972501111111",
      callId: "registered",
    }),
  ).toMatchObject({ ok: true, displayName: "Registered caller" })

  game.setRosterJoinSettings({ allowUnregisteredPlayers: true })
  expect(game.getHostPresenceSnapshot()).toMatchObject({
    allowUnregisteredPlayers: true,
    phoneInviteOnly: false,
  })
  const admitted = game.joinOrRebindPhoneCaller({
    phoneRaw: "+972502222222",
    callId: "enabled-guest",
    fallbackName: "Guest",
  })
  expect(admitted.ok).toBe(true)
  const guest = game.players.find(
    (player) => player.clientId === admitted.clientId,
  )!
  guest.points = 64
  guest.streak = 2

  game.setRosterJoinSettings({ allowUnregisteredPlayers: false })
  expect(
    game.joinOrRebindPhoneCaller({
      phoneRaw: "+972503333333",
      callId: "explicit-denied",
      fallbackName: "New guest",
    }),
  ).toEqual({ ok: false, error: "errors:game.locked" })
  expect(
    game.joinOrRebindPhoneCaller({
      phoneRaw: "+972502222222",
      callId: "existing-redial",
    }),
  ).toMatchObject({ ok: true, reconnected: true, points: 64 })
  expect(guest).toMatchObject({ points: 64, streak: 2 })
  expect(game.players).toHaveLength(2)
  game.dispose()
})
