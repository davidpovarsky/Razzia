import assert from "node:assert/strict"
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto"
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { after, test } from "node:test"
import { io as connect } from "socket.io-client"
import type { Question } from "@razzia/common/types/game"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import { createQuestion, createQuizz } from "@razzia/socket/test/fixtures"
import type {
  OperationInput,
  Receipt,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { PrivateGatewayAdapter } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/adapter"
import {
  GATEWAY_KEY_PURPOSE,
  GATEWAY_ROOT_CONTENT,
  GATEWAY_ROOT_MARKER,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/contracts"
import * as real from "./actual-gameplay-backend"

const sockets: ReturnType<typeof connect>[] = []
after(async () => {
  for (const socket of sockets) socket.disconnect()
  await real.close()
})
const question = (playMode: Question["playMode"] = "quiz") =>
  createQuestion({
    answers: ["One", "Two", "Three", "Four", "Five"],
    solutions: [4],
    time: 60,
    cooldown: 3,
    playMode,
  })
async function provision(r: real.Room) {
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
  const attempt = await r.factory.issue(r.subject.token, r.issue)
  assert.ok(attempt.credential)
  const credential = real.remember(attempt.credential),
    target = {
      owner: r.subject.user.id,
      game: r.game.gameId,
      provider: r.issue.provider,
      service: attempt.receipt.service,
    }
  const authority = await r.factory.openGatewayAuthority(
    r.subject.token,
    target,
  )
  const root = real.privateRoot("gameplay-custody"),
    key = randomBytes(32)
  real.remember(key.toString("hex"))
  writeFileSync(join(root, GATEWAY_ROOT_MARKER), GATEWAY_ROOT_CONTENT, {
    mode: 0o600,
  })
  const adapter = new PrivateGatewayAdapter({
    enabled: true,
    root,
    installationId: "gameplay-fixture",
    keyId: "gameplay-key",
    target,
    authority,
    key: {
      open() {
        const bytes = Buffer.from(key)
        return {
          purpose: GATEWAY_KEY_PURPOSE,
          installationId: "gameplay-fixture",
          keyId: "gameplay-key",
          bytes,
          close() {
            bytes.fill(0)
          },
        }
      },
    },
  })
  adapter.initializeEmpty()
  await r.factory.deliverGatewayAttempt(r.subject.token, attempt, adapter, 0)
  assert.equal((await adapter.activate(randomUUID())).state, "ACTIVE")
  assert.equal(adapter.authorization("register").storedVersion, 1)
  return { address: { ...target, version: 1 }, credential, adapter, authority }
}
type Provisioned = Awaited<ReturnType<typeof provision>>

// Fixture-only complete scoped precommit witness. No production ingress/key
// store or provider new-attempt authentication is implemented by these tests.
function precommit(r: real.Room, p: Provisioned, phone: string) {
  const input = { ...real.registration(), phone },
    expected = p.authority.current().binding
  const root = real.privateRoot("gameplay-precommit"),
    key = randomBytes(32),
    iv = randomBytes(12)
  real.remember(key.toString("hex"))
  const aad = Buffer.from(
    JSON.stringify(["gameplay-synthetic-precommit-v1", expected]),
  )
  const plain = Buffer.from(JSON.stringify({ binding: expected, input }))
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  cipher.setAAD(aad)
  let decrypted: Buffer | undefined
  try {
    const data = Buffer.concat([cipher.update(plain), cipher.final()]),
      tag = cipher.getAuthTag()
    const path = join(root, "attempt.enc"),
      fd = openSync(path, "wx", 0o600)
    try {
      writeFileSync(fd, Buffer.concat([iv, tag, data]))
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    const dir = openSync(root, "r")
    try {
      fsyncSync(dir)
    } finally {
      closeSync(dir)
    }
    const bytes = readFileSync(path),
      decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12))
    decipher.setAAD(aad)
    decipher.setAuthTag(bytes.subarray(12, 28))
    decrypted = Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ])
    const reopened = JSON.parse(decrypted.toString()) as {
      binding: typeof expected
      input: typeof input
    }
    assert.deepEqual(reopened.binding, p.authority.current().binding)
    assert.deepEqual(reopened.input, input)
    assert.equal(
      r.game.players.some((player) => player.clientId === input.requestId),
      false,
    )
    return reopened.input
  } finally {
    key.fill(0)
    plain.fill(0)
    decrypted?.fill(0)
  }
}
function operation(
  input: ReturnType<typeof precommit>,
  receipt: Receipt,
  action: OperationInput["action"],
  overrides: Partial<OperationInput> = {},
): OperationInput {
  assert.ok(receipt.ok && receipt.registrationId && receipt.generation)
  return {
    requestId: input.requestId,
    registrationId: receipt.registrationId,
    generation: receipt.generation,
    capability: input.capability,
    operationId: randomUUID(),
    action,
    ...overrides,
  }
}
async function waitFor(predicate: () => boolean, label: string, ms = 12000) {
  const until = Date.now() + ms
  while (!predicate()) {
    if (Date.now() >= until) throw Error("Actual native deadline: " + label)
    await new Promise((done) => setTimeout(done, 20))
  }
}
async function manager(r: real.Room) {
  const socket = connect(real.base, {
    path: "/ws",
    auth: { token: r.subject.token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  })
  sockets.push(socket)
  let sequence = 0,
    name: string = ""
  socket.on(EVENTS.GAME.STATUS, (status) => {
    sequence++
    name = status.name
  })
  const event = (eventName: string) =>
    new Promise<void>((done, reject) => {
      const success = () => {
        clearTimeout(timer)
        done()
      }
      const timer = setTimeout(() => {
        socket.off(eventName, success)
        reject(Error("Actual manager deadline"))
      }, 6000)
      socket.once(eventName, success)
    })
  const connected = event("connect")
  socket.connect()
  await connected
  const ready = event(EVENTS.MANAGER.SUCCESS_RECONNECT)
  socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: r.game.gameId })
  await ready
  r.game.updateSettings({ endOnAllAnswered: false })
  return {
    async start() {
      socket.emit(EVENTS.MANAGER.START_GAME, { gameId: r.game.gameId })
      await waitFor(
        () => r.game.getQuestionStateForGateway().acceptingAnswers,
        "start",
      )
    },
    async until(predicate: () => boolean) {
      for (let index = 0; index < 20; index++) {
        if (predicate()) return
        const before = sequence
        if (name !== STATUS.SHOW_PREPARED && name !== STATUS.SHOW_QUESTION)
          socket.emit(EVENTS.MANAGER.ADVANCE, { gameId: r.game.gameId })
        await waitFor(() => predicate() || sequence !== before, "advance", 6000)
      }
      assert.fail(
        "Bounded actual manager controls did not reach expected state",
      )
    },
  }
}

test(
  "LIVE-COMPOSED-01 actual fifth choice scores two questions once, then survey preserves score",
  { timeout: 45000 },
  async () => {
    const r = await real.room(
        undefined,
        createQuizz([question(), question(), question("survey")]),
      ),
      p = await provision(r)
    const input = precommit(r, p, "+447700900881"),
      joined = await r.factory.register(p.address, p.credential, input)
    assert.ok(joined.ok && joined.rosterPlayerId && joined.clientId)
    const host = await manager(r),
      epochs: number[] = [],
      points: number[] = []
    let nativeAnswers = 0
    const answer = r.game.submitPhoneAnswerByRosterId.bind(r.game)
    r.game.submitPhoneAnswerByRosterId = (...args) => {
      nativeAnswers++
      return answer(...args)
    }
    await host.start()
    for (let index = 0; index < 3; index++) {
      const state = r.game.getQuestionStateForGateway(joined.rosterPlayerId)
      assert.equal(state.acceptingAnswers, true)
      assert.equal(state.isSurvey, index === 2)
      assert.equal(r.game.getCurrentQuestionPstnSupport().maxAnswerIndex, 4)
      epochs.push(state.epoch)
      if (index > 0) {
        const stale = await r.factory.operate(
          p.address,
          p.credential,
          operation(input, joined, "answer", {
            epoch: epochs[index - 1],
            answerIndex: 4,
          }),
        )
        assert.equal(stale.status, "stale_epoch")
        assert.equal(nativeAnswers, index)
      }
      const op = operation(input, joined, "answer", {
        epoch: state.epoch,
        answerIndex: 4,
      })
      const accepted = await r.factory.operate(p.address, p.credential, op)
      assert.equal(accepted.accepted, true)
      assert.deepEqual(
        await r.factory.operate(p.address, p.credential, op),
        accepted,
      )
      assert.equal(
        (
          await r.factory.operate(p.address, p.credential, {
            ...op,
            answerIndex: 0,
          })
        ).status,
        "operation_conflict",
      )
      assert.equal(nativeAnswers, index + 1)
      const poll = await r.factory.operate(
        p.address,
        p.credential,
        operation(input, joined, "poll"),
      )
      assert.equal(poll.answered, true)
      await host.until(
        () => !!r.game.roundManager.getQuestionLedgerEntry(index),
      )
      const ledger = r.game.roundManager.getQuestionLedgerEntry(index)!
      assert.equal(ledger.answers.length, 1)
      assert.deepEqual(ledger.answers[0].answerIds, [4])
      const currentPoints = r.game.players.find(
        (player) => player.clientId === joined.clientId,
      )!.points
      if (index < 2) assert.ok(currentPoints > (points[index - 1] ?? 0))
      else assert.equal(currentPoints, points[1])
      points.push(currentPoints)
      if (index < 2)
        await host.until(
          () =>
            r.game.getQuestionStateForGateway().epoch > state.epoch &&
            r.game.getQuestionStateForGateway().acceptingAnswers,
        )
    }
    const final = await r.factory.operate(
      p.address,
      p.credential,
      operation(input, joined, "poll"),
    )
    assert.equal(final.points, points[2])
    assert.equal(r.game.players.length, 1)
    assert.equal(r.game.getHostPresenceSnapshot().connectedNow, 1)
    real.record({
      test: "LIVE-COMPOSED-01",
      actualGatewayActivation: true,
      actualManagerSocket: true,
      fullScopedFixturePrecommitReadback: true,
      fifthChoice: 4,
      epochs,
      points,
      nativeAnswers,
      ledgerAnswersPerQuestion: [1, 1, 1],
      physicalDTMF: false,
    })
  },
)

test("INVITE-COMPOSED-01 default admission and actual invite-only refusal/removal preserve fail-closed receipts", async () => {
  const open = await real.room(),
    openService = await provision(open)
  assert.equal(open.game.phoneInviteOnly, false)
  const ordinary = precommit(open, openService, "+447700900882")
  assert.equal(
    (
      await open.factory.register(
        openService.address,
        openService.credential,
        ordinary,
      )
    ).ok,
    true,
  )
  const r = await real.room(),
    p = await provision(r)
  r.game.setPhoneInviteOnly(true)
  const invited = r.game.upsertRosterParticipant({
    displayName: "Synthetic invited participant",
    phone: "+447700900883",
  })
  const unknown = precommit(r, p, "+447700900884")
  const denied = await r.factory.register(p.address, p.credential, unknown)
  assert.equal(denied.ok, false)
  assert.equal(denied.status, "admission_outcome_unknown")
  assert.equal(r.game.players.length, 0)
  const input = precommit(r, p, "+447700900883"),
    joined = await r.factory.register(p.address, p.credential, input)
  assert.equal(joined.ok, true)
  assert.equal(joined.rosterPlayerId, invited.rosterPlayerId)
  const op = operation(input, joined, "poll"),
    before = await r.factory.operate(p.address, p.credential, op)
  assert.equal(before.ok, true)
  r.game.setPhoneInviteOnly(false)
  assert.equal(
    (await r.factory.register(p.address, p.credential, unknown)).status,
    "registration_pending_unknown",
  )
  assert.equal(r.game.players.length, 1)
  assert.equal(r.game.removeRosterParticipant(invited.rosterPlayerId), true)
  assert.equal(
    (await r.factory.register(p.address, p.credential, input)).status,
    "game_binding_changed",
  )
  assert.equal(
    (await r.factory.operate(p.address, p.credential, op)).status,
    "game_binding_changed",
  )
  assert.equal(r.game.getRosterEntry(invited.rosterPlayerId), undefined)
  real.record({
    test: "INVITE-COMPOSED-01",
    defaultOpenControl: true,
    explicitInviteOnlyRefusal: denied.status,
    invitedOriginalRoster: true,
    noUnknownRetryRepairAfterPolicyChange: true,
    removedRosterCachedReceiptsDenied: 2,
    providerInvitationOrPSTN: false,
  })
})
