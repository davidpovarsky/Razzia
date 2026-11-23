import { createAdaptorServer } from "@hono/node-server"
import {
  EVENTS,
  QUESTION_LEAD_IN_SECONDS,
  SESSION_ROLES,
} from "@razzia/common/constants"
import type {
  AnswerSubmissionAck,
  ClientToServerEvents,
  ExtensionCommandAck,
  Server,
  ServerToClientEvents,
} from "@razzia/common/types/game/socket"
import { STATUS, type Status } from "@razzia/common/types/game/status"
import {
  computeCanonicalBaseDigest,
  createDefaultQuizExtras,
  generateQuestionIds,
  extensionStateEnvelopeSchema,
  readPlatformOpening,
  type PlatformOpeningSnapshot,
} from "@razzia/extensions/core"
import { writeSidecar } from "@razzia/extensions/server"
import { app, createSocketServer } from "@razzia/socket/app"
import { mintJoinTicket, mintToken } from "@razzia/socket/services/auth"
import { getPath } from "@razzia/socket/services/config"
import Game from "@razzia/socket/services/game"
import Registry from "@razzia/socket/services/registry"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import { SECOND_MS } from "@razzia/socket/utils/sleep"
import type { AddressInfo } from "node:net"
import { io as connect, type Socket as ClientSocket } from "socket.io-client"
import { afterAll, afterEach, beforeAll, expect, it } from "vitest"

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>
type WireStatus = Parameters<ServerToClientEvents[typeof EVENTS.GAME.STATUS]>[0]
const server = createAdaptorServer({ fetch: app.fetch })
const io: Server = createSocketServer(server)
const clients: Client[] = []
let url = ""

async function connectAs(clientId: string, manager = false) {
  const { token } = await mintToken(
    clientId,
    manager ? SESSION_ROLES.MANAGER : SESSION_ROLES.PLAYER,
  )
  const client: Client = connect(url, {
    path: "/ws",
    auth: { token },
    transports: ["websocket"],
    forceNew: true,
  })
  clients.push(client)
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve)
    client.once("connect_error", reject)
  })

  return client
}

function waitFor<E extends keyof ServerToClientEvents>(
  client: Client,
  event: E,
) {
  return new Promise<Parameters<ServerToClientEvents[E]>[0]>((resolve) => {
    // @ts-expect-error -- Generic event names are not narrowed by socket.io types.
    client.once(event, resolve)
  })
}

function waitStatus(client: Client, name: Status) {
  return new Promise<WireStatus>((resolve) => {
    const listener = (status: WireStatus) => {
      if (status.name !== name) {
        return
      }

      client.off(EVENTS.GAME.STATUS, listener)
      resolve(status)
    }
    client.on(EVENTS.GAME.STATUS, listener)
  })
}

function waitLaunch(client: Client, stage: "opening" | "lobby") {
  return new Promise<PlatformOpeningSnapshot>((resolve) => {
    const listener = (state: unknown) => {
      const launch = readPlatformOpening(
        extensionStateEnvelopeSchema.parse(state).extras.presentationLaunch,
      )

      if (launch?.stage !== stage) {
        return
      }

      client.off(EVENTS.EXTENSIONS.STATE, listener)
      resolve(launch)
    }
    client.on(EVENTS.EXTENSIONS.STATE, listener)
  })
}

function command(
  client: Client,
  gameId: string,
  {
    requestId,
    action = "END_ANSWER_TIMER",
    epoch,
  }: {
    requestId: string
    action?: "END_ANSWER_TIMER" | "PAUSE_GAME" | "RESUME_GAME"
    epoch?: number
  },
) {
  return new Promise<ExtensionCommandAck>((resolve) => {
    client.emit(
      EVENTS.EXTENSIONS.COMMAND,
      {
        v: 1,
        gameId,
        requestId,
        action,
        payload: epoch === undefined ? {} : { epoch },
      },
      resolve,
    )
  })
}

async function join(game: Game, clientId: string) {
  const client = await connectAs(clientId)
  const joined = waitFor(client, EVENTS.GAME.SUCCESS_JOIN)
  client.emit(EVENTS.PLAYER.LOGIN, {
    ticket: await mintJoinTicket(clientId, game.gameId, clientId),
  })
  await joined

  return client
}

beforeAll(async () => {
  await new Promise<void>(
    (resolve) => void server.listen(0, "127.0.0.1", resolve),
  )
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterEach(() => {
  clients.splice(0).forEach((client) => void client.disconnect())
  Registry.getInstance()
    .getAllGames()
    .forEach((game) => {
      Registry.getInstance().removeGame(game.gameId)
    })
})
afterAll(async () => {
  await io.close()
})

it("authorizes End Timer over real Socket.IO and delivers one reveal before a tick", async () => {
  const quizz = {
    ...createQuizz([
      createQuestion({ cooldown: QUESTION_LEAD_IN_SECONDS, time: 20 }),
      createQuestion(),
    ]),
    id: crypto.randomUUID(),
  }
  writeSidecar(
    getPath,
    quizz.id,
    createDefaultQuizExtras(
      quizz.id,
      generateQuestionIds(quizz.questions.length),
      computeCanonicalBaseDigest(quizz),
    ),
  )
  const game = new Game(io, "timer-manager", quizz)
  game.updateSettings({
    endOnAllAnswered: false,
    autoAdvance: { enable: false, responsesDelay: 5, leaderboardDelay: 5 },
  })
  Registry.getInstance().addGame(game)
  const manager = await connectAs("timer-manager", true)
  const reconnected = waitFor(manager, EVENTS.MANAGER.SUCCESS_RECONNECT)
  manager.emit(EVENTS.MANAGER.RECONNECT, { gameId: game.gameId })
  await reconnected
  const alice = await join(game, "Timer Alice")
  const bob = await join(game, "Timer Bob")
  const otherManager = await connectAs("different-manager", true)
  const statuses: WireStatus[] = []
  const states: Array<{ epoch: number; seq: number; phase: string }> = []
  manager.on(EVENTS.GAME.STATUS, (status) => statuses.push(status))
  manager.on(EVENTS.EXTENSIONS.STATE, (state: unknown) => {
    states.push(extensionStateEnvelopeSchema.parse(state))
  })

  expect(
    await command(manager, game.gameId, { requestId: "lobby" }),
  ).toMatchObject({
    success: false,
    error: "errors:extensions.cannotEndTimerOutsideAnswerPhase",
  })
  for (const unauthorized of [alice, otherManager]) {
    const rejected = waitFor(unauthorized, EVENTS.GAME.ERROR_MESSAGE)
    unauthorized.emit(EVENTS.EXTENSIONS.COMMAND, {
      v: 1,
      gameId: game.gameId,
      requestId: "unauthorized",
      action: "END_ANSWER_TIMER",
      payload: {},
    })
    expect(await rejected).toBe("errors:auth.unauthorized")
  }

  // Host Start first opens the product intro, then skips it to the lobby.
  // Only the next Start begins the question; use the real socket lifecycle.
  for (const stage of ["opening", "lobby"] as const) {
    const launch = waitLaunch(manager, stage)
    manager.emit(EVENTS.MANAGER.START_GAME, { gameId: game.gameId })
    expect(await launch).toMatchObject({ stage })
    expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(false)
  }

  const question = waitStatus(manager, STATUS.SHOW_QUESTION)
  const voting = waitStatus(manager, STATUS.SELECT_ANSWER)
  manager.emit(EVENTS.MANAGER.START_GAME, { gameId: game.gameId })
  expect(await question).toMatchObject({
    name: STATUS.SHOW_QUESTION,
    data: { cooldown: QUESTION_LEAD_IN_SECONDS },
  })
  expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(false)
  await voting
  const epoch = states.at(-1)?.epoch
  expect(epoch).toBeGreaterThan(0)
  expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)
  expect(
    await command(manager, game.gameId, { requestId: "stale", epoch: 999 }),
  ).toMatchObject({ success: false, error: "errors:extensions.staleEpoch" })
  expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(true)

  expect(
    await command(manager, game.gameId, {
      requestId: "pause",
      action: "PAUSE_GAME",
    }),
  ).toMatchObject({ success: true })
  expect(
    await command(manager, game.gameId, { requestId: "paused" }),
  ).toMatchObject({
    success: false,
    error: "errors:extensions.gamePaused",
  })
  expect(
    await command(manager, game.gameId, {
      requestId: "resume",
      action: "RESUME_GAME",
    }),
  ).toMatchObject({ success: true })

  const accepted = await new Promise<AnswerSubmissionAck>(
    (resolve) =>
      void alice.emit(
        EVENTS.PLAYER.SELECTED_ANSWER,
        {
          gameId: game.gameId,
          data: { answerKeys: [0] },
        },
        resolve,
      ),
  )
  expect(accepted.accepted).toBe(true)
  const results = waitStatus(manager, STATUS.SHOW_RESPONSES)
  const personal = waitStatus(alice, STATUS.SHOW_RESULT)
  const beganAt = performance.now()
  expect(
    await command(manager, game.gameId, {
      requestId: "end-once",
      epoch,
    }),
  ).toMatchObject({ success: true })
  expect(game.roundManager.isCurrentlyAcceptingAnswers).toBe(false)
  await results
  const deliveryMs = performance.now() - beganAt
  expect(deliveryMs).toBeLessThan(SECOND_MS / 2)
  expect((await personal).data).toMatchObject({ correct: true })
  expect(game.getVoteCompletionReason()).toBe("manual")
  const late = await new Promise<AnswerSubmissionAck>(
    (resolve) =>
      void bob.emit(
        EVENTS.PLAYER.SELECTED_ANSWER,
        {
          gameId: game.gameId,
          data: { answerKeys: [0] },
        },
        resolve,
      ),
  )
  expect(late).toMatchObject({
    accepted: false,
    reason: "not_accepting_answers",
  })
  expect(
    await command(manager, game.gameId, {
      requestId: "end-once",
      epoch,
    }),
  ).toMatchObject({ success: true, deduplicated: true })
  expect(
    await command(manager, game.gameId, {
      requestId: "another-click",
      epoch,
    }),
  ).toMatchObject({
    success: false,
    error: "errors:extensions.cannotEndTimerOutsideAnswerPhase",
  })

  await new Promise((resolve) => void setTimeout(resolve, SECOND_MS + 25))
  expect(
    statuses.filter((status) => status.name === STATUS.SHOW_RESPONSES),
  ).toHaveLength(1)
  expect(game.roundManager.getHistory()).toHaveLength(1)
  expect(game.roundManager.getQuestionLedgerEntry(0)?.answers).toHaveLength(1)
  expect(game.roundManager.currentQuestionIndex).toBe(0)
  expect(states.at(-1)?.epoch).toBe(epoch)
  expect(
    states.filter(
      (state, index) =>
        state.phase === "responses" && states[index - 1]?.phase !== "responses",
    ),
  ).toHaveLength(1)
  console.info(
    JSON.stringify({
      proof: "real authoritative Socket.IO End Timer",
      deliveryMs,
      tickMs: SECOND_MS,
      resultTransitions: 1,
      epoch,
      acceptedAnswers: 1,
    }),
  )
}, 25_000)
