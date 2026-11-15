import {
  EVENTS,
  QUIZZ_MODES,
  createDefaultGameSettings,
} from "@razzia/common/constants"
import {
  usernameValidator,
  joinTicketClaimsValidator,
} from "@razzia/common/validators/auth"
import type { Player } from "@razzia/common/types/game"
import { PlayerManager } from "@razzia/socket/services/game/player-manager"
import { createFakeIo } from "@razzia/socket/test/fake-io"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { expect, it, vi } from "vitest"
import { GamePhoneController, type PhoneGamePorts } from "./phone-controller"
import { GameRoster } from "./roster/index"

function fixture() {
  const fake = createFakeIo()
  const players = new PlayerManager({
    io: fake.io,
    gameId: "g",
    gameMode: QUIZZ_MODES.QUIZ,
    getManagerId: () => "host",
    isStarted: () => false,
  })
  const roster = new GameRoster({
    players,
    onPlayerRenamed: vi.fn(),
    kickPlayer: vi.fn(),
    onChange: vi.fn(),
    setPhoneInviteOnly: vi.fn(),
  })
  const sentinel = roster.upsert({
    displayName: "Untouched participant",
    phone: "+972501111111",
  })
  const sentinelBefore = structuredClone(
    roster.entries.get(sentinel.rosterPlayerId),
  )
  const settings = createDefaultGameSettings()
  settings.phoneInviteOnly = false
  const admit = vi.fn(
    (identity: string, call: string, join: () => string | null) => join(),
  )
  const finishPhone = vi.fn()
  const ports: PhoneGamePorts = {
    gameId: "g",
    inviteCode: "123456",
    gameMode: QUIZZ_MODES.QUIZ,
    quizz: createQuizz([createQuestion()]),
    io: fake.io,
    players,
    roster,
    round: {
      currentEpoch: 0,
      currentQuestionIndex: 0,
      isCurrentlyAcceptingAnswers: false,
      isPaused: false,
      isSurvey: () => false,
      hasPlayerAnswered: () => false,
      selectAnswer: vi.fn(),
      updatePlayerId: vi.fn(),
    },
    started: () => false,
    settings: () => settings,
    locked: () => false,
    session: () => null,
    coordinator: () => null,
    admitPhone: admit,
    finishPhone,
    notifyPlayerUpdated: vi.fn(),
    broadcastExtensionState: vi.fn(),
    broadcastHostPresence: vi.fn(),
    setPlayerDisconnected: vi.fn(),
  }
  const controller = new GamePhoneController(ports)
  const sentinelUnchanged = () =>
    expect(roster.entries.get(sentinel.rosterPlayerId)).toEqual(sentinelBefore)

  return {
    fake,
    players,
    roster,
    admit,
    ports,
    controller,
    sentinelUnchanged,
    finishPhone,
  }
}

it.each([1, 24, 25, 29, 40])(
  "admits a resolved %i-character roster name with one native Player",
  (length) => {
    const f = fixture(),
      name = "N".repeat(length)
    const row = f.roster.upsert({
      displayName: `  ${name}  `,
      phone: "+972502222222",
    })
    const outcome = f.controller.joinOrRebindPhoneCaller({
      rosterPlayerId: row.rosterPlayerId,
      phoneRaw: "+972502222222",
      callId: "call-1",
      fallbackName: "untrusted fallback",
    })
    expect(outcome).toMatchObject({
      ok: true,
      displayName: name,
      reconnected: false,
    })
    expect(f.players.getAll()).toHaveLength(1)
    expect(f.players.getAll()[0].username).toBe(name)
    expect(f.roster.entries.get(row.rosterPlayerId)?.displayName).toBe(name)
    expect(f.admit).toHaveBeenCalledTimes(1)
    expect(f.admit.mock.calls[0].slice(0, 2)).toEqual([
      `roster:${row.rosterPlayerId}`,
      "call-1",
    ])
    expect(f.fake.events("host", EVENTS.MANAGER.NEW_PLAYER)).toHaveLength(1)
    expect(f.fake.events("g", EVENTS.GAME.TOTAL_PLAYERS)).toHaveLength(1)
    f.sentinelUnchanged()
  },
)

it("resolves the real roster row by phone without using caller fallback text", () => {
  const f = fixture(),
    name = "P".repeat(40)
  f.roster.upsert({ displayName: name, phone: "+972502222222" })
  expect(
    f.controller.joinOrRebindPhoneCaller({
      phoneRaw: "+972502222222",
      callId: "phone-index",
      fallbackName: "wrong",
    }),
  ).toMatchObject({ ok: true, displayName: name })
  expect(f.players.getAll()[0].username).toBe(name)
  f.sentinelUnchanged()
})

it.each([25, 40])(
  "keeps unknown-roster and fallback names at the ordinary 24-character rule (%i)",
  (length) => {
    const f = fixture()
    const result = f.controller.joinOrRebindPhoneCaller({
      rosterPlayerId: "unknown",
      callId: "fallback",
      fallbackName: "F".repeat(length),
    })
    expect(result).toEqual({ ok: false, error: "errors:auth.usernameTooLong" })
    expect(f.players.count()).toBe(0)
    expect(f.roster.entries.size).toBe(1)
    expect(f.fake.events("host", EVENTS.MANAGER.NEW_PLAYER)).toHaveLength(0)
    f.sentinelUnchanged()
  },
)

it("retains ordinary web and join-ticket maximum24 exactly", () => {
  const f = fixture()
  expect(f.players.join(f.fake.createSocket("web-long"), "W".repeat(25))).toBe(
    "errors:auth.usernameTooLong",
  )
  expect(
    f.players.join(f.fake.createSocket("web-ok"), "W".repeat(24)),
  ).toBeNull()
  expect(usernameValidator.safeParse("W".repeat(25)).success).toBe(false)
  expect(
    joinTicketClaimsValidator.safeParse({
      sub: "p",
      gameId: "g",
      username: "W".repeat(25),
      iat: 1,
      exp: 2,
    }).success,
  ).toBe(false)
  expect(f.players.count()).toBe(1)
  f.sentinelUnchanged()
})

it.each(["", " ", "X".repeat(41)])(
  "rejects an invalid resolved stored name without native side effects: %j",
  (name) => {
    const f = fixture(),
      row = f.roster.upsert({ displayName: "valid", phone: "+972502222222" })
    f.roster.entries.get(row.rosterPlayerId)!.displayName = name
    expect(
      f.controller.joinOrRebindPhoneCaller({
        rosterPlayerId: row.rosterPlayerId,
        callId: "bad-name",
      }).ok,
    ).toBe(false)
    expect(f.players.count()).toBe(0)
    expect(f.fake.emitted).toHaveLength(0)
    f.sentinelUnchanged()
  },
)

it("does not join or mutate roster after the existing billing/capacity gate refuses", () => {
  const f = fixture(),
    row = f.roster.upsert({
      displayName: "R".repeat(40),
      phone: "+972502222222",
    })
  const before = structuredClone(f.roster.entries.get(row.rosterPlayerId))
  f.admit.mockImplementation(() => "extensions:billing.errors.capacity")
  expect(
    f.controller.joinOrRebindPhoneCaller({
      rosterPlayerId: row.rosterPlayerId,
      callId: "denied",
    }),
  ).toEqual({ ok: false, error: "extensions:billing.errors.capacity" })
  expect(f.admit).toHaveBeenCalledTimes(1)
  expect(f.players.count()).toBe(0)
  expect(f.fake.emitted).toHaveLength(0)
  expect(f.roster.entries.get(row.rosterPlayerId)).toEqual(before)
  f.sentinelUnchanged()
})

it.each(["removed", "replaced", "renamed"])(
  "revalidates actual roster identity inside admission when %s",
  (change) => {
    const f = fixture(),
      row = f.roster.upsert({
        displayName: "R".repeat(40),
        phone: "+972502222222",
      })
    f.admit.mockImplementation((_identity, _call, join) => {
      const current = f.roster.entries.get(row.rosterPlayerId)!

      if (change === "removed") {
        f.roster.entries.delete(row.rosterPlayerId)
      }

      if (change === "replaced") {
        f.roster.entries.set(row.rosterPlayerId, { ...current })
      }

      if (change === "renamed") {
        current.displayName = "changed"
      }

      return join()
    })
    expect(
      f.controller.joinOrRebindPhoneCaller({
        rosterPlayerId: row.rosterPlayerId,
        callId: "removed",
      }),
    ).toEqual({ ok: false, error: "errors:invalidRequest" })
    expect(f.players.count()).toBe(0)
    expect(f.fake.emitted).toHaveLength(0)
    f.sentinelUnchanged()
  },
)

it("warm rebind preserves points/name and creates no second Player or new-player event", () => {
  const f = fixture(),
    row = f.roster.upsert({
      displayName: "R".repeat(40),
      phone: "+972502222222",
    })
  const first = f.controller.joinOrRebindPhoneCaller({
    rosterPlayerId: row.rosterPlayerId,
    callId: "first",
  })
  expect(first.ok).toBe(true)
  const [player] = f.players.getAll()
  player.points = 77
  player.streak = 3
  const rebound = f.controller.joinOrRebindPhoneCaller({
    rosterPlayerId: row.rosterPlayerId,
    callId: "second",
    fallbackName: "wrong",
  })
  expect(rebound).toMatchObject({
    ok: true,
    reconnected: true,
    points: 77,
    displayName: "R".repeat(40),
  })
  expect(f.players.getAll()).toEqual([player])
  expect(player).toMatchObject({
    id: "phone-sock-second",
    points: 77,
    streak: 3,
  })
  expect(f.admit).toHaveBeenCalledTimes(2)
  expect(f.finishPhone).toHaveBeenCalledExactlyOnceWith("first")
  expect(f.fake.events("host", EVENTS.MANAGER.NEW_PLAYER)).toHaveLength(1)
  f.sentinelUnchanged()
})

it("internal roster admission shares original socket and success-event path once", () => {
  const f = fixture(),
    socket = f.fake.createSocket("native")
  const join = vi.spyOn(socket, "join")
  const port = f.players
  expect(port.joinResolvedRoster(socket, "A".repeat(40))).toBeNull()
  expect(port.joinResolvedRoster(socket, "A".repeat(40))).toBe(
    "errors:game.playerAlreadyConnected",
  )
  expect(join).toHaveBeenCalledExactlyOnceWith("g")
  expect(f.fake.events("host", EVENTS.MANAGER.NEW_PLAYER)).toHaveLength(1)
  expect(f.fake.events("native", EVENTS.GAME.SUCCESS_JOIN)).toHaveLength(1)
  expect(
    f.fake.events("native", EVENTS.GAME.SUCCESS_JOIN)[0].data,
  ).toMatchObject({ username: "A".repeat(40) })
  expect(f.players.getAll()[0]).toMatchObject({
    username: "A".repeat(40),
    connected: true,
    points: 0,
    streak: 0,
  } satisfies Partial<Player>)
  f.sentinelUnchanged()
})
