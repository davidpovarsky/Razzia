import assert from "node:assert/strict"
import { randomBytes, randomUUID } from "node:crypto"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { io as connect } from "socket.io-client"
import { EVENTS } from "@razzia/common/constants"
import { STATUS } from "@razzia/common/types/game/status"
import type { RealGameFacade } from "../../../../../extensions/src/server/phone-lifecycle-v2/game-facade"
import { PrivateGatewayAdapter } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/adapter"
import {
  PrivateCallPrecommit,
  CALL_PRECOMMIT_MARKER,
  CALL_PRECOMMIT_CONTENT,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/call-precommit"
import {
  OPERATION_PRECOMMIT_MARKER,
  OPERATION_PRECOMMIT_CONTENT,
  type GatewayOperationIntent,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/operation-precommit"
import {
  GATEWAY_KEY_PURPOSE,
  GATEWAY_ROOT_MARKER,
  GATEWAY_ROOT_CONTENT,
  type GatewayCallAuthorityPort,
} from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/contracts"
import { PrivateCallOperationHost } from "../../../../../extensions/src/telephony/pilot-runtime/gateway-v2/call-operation-host"
import * as real from "../gameplay-source/actual-gameplay-backend"
export { real }
const sockets: ReturnType<typeof connect>[] = []
export async function close() {
  for (const socket of sockets) socket.disconnect()
  await real.close()
}
export async function fixture(
  mode: "normal" | "lost-poll" | "lost-answer" | "revoke-poll" = "normal",
) {
  const r = await real.room()
  await r.factory.initializeAuthority(r.subject.token, r.game.gameId)
  const issued = await r.factory.issue(r.subject.token, r.issue)
  assert.ok(issued.credential)
  real.remember(issued.credential)
  const target = {
    owner: r.subject.user.id,
    game: r.game.gameId,
    provider: r.issue.provider,
    service: issued.receipt.service,
  }
  const actual = await r.factory.openGatewayAuthority(r.subject.token, target)
  let lost = false
  const authority: GatewayCallAuthorityPort = {
    ...actual,
    async register(...args) {
      real.remember(args[2].capability)
      return actual.register(...args)
    },
    async operate(binding, credential, input) {
      real.remember(input.capability)
      const receipt = await actual.operate(binding, credential, input)
      if (
        !lost &&
        ((mode === "lost-poll" && input.action === "poll") ||
          (mode === "lost-answer" && input.action === "answer"))
      ) {
        lost = true
        throw Error(input.capability)
      }
      if (mode === "revoke-poll" && input.action === "poll") {
        assert.equal(receipt.ok, true)
        real.account.revokeAccountSession(r.subject.claims.sid!)
      }
      return receipt
    },
  }
  const key = randomBytes(32)
  real.remember(key.toString("hex"))
  let opKeys = 0
  const keyPort = (operation = false) => ({
    open() {
      if (operation) opKeys++
      const bytes = Buffer.from(key)
      return {
        purpose: GATEWAY_KEY_PURPOSE,
        installationId: "operation-fixture",
        keyId: "gateway-key",
        bytes,
        close() {
          bytes.fill(0)
        },
      }
    },
  })
  const serviceRoot = real.privateRoot("operation-service"),
    root = real.privateRoot("operation-call")
  writeFileSync(join(serviceRoot, GATEWAY_ROOT_MARKER), GATEWAY_ROOT_CONTENT, {
    mode: 0o600,
  })
  writeFileSync(join(root, CALL_PRECOMMIT_MARKER), CALL_PRECOMMIT_CONTENT, {
    mode: 0o600,
  })
  const service = new PrivateGatewayAdapter({
    enabled: true,
    root: serviceRoot,
    installationId: "operation-fixture",
    keyId: "gateway-key",
    target,
    key: keyPort(),
    authority,
  })
  service.initializeEmpty()
  await r.factory.deliverGatewayAttempt(r.subject.token, issued, service, 0)
  await service.activate(randomUUID())
  const input = {
    requestId: randomUUID(),
    providerReference: randomUUID(),
    phone: "+447700900892",
    expectedPredecessor: 0,
  }
  const callOptions = {
    enabled: true,
    root,
    installationId: "operation-fixture",
    keyId: "gateway-key",
    target,
    key: keyPort(),
    dispatcher: service.registrationDispatcher(),
    attempt: input,
  }
  const call = new PrivateCallPrecommit(callOptions)
  call.prepare(input)
  const joined = await call.register()
  const operator = new PrivateCallOperationHost({
    ...callOptions,
    dispatcher: service.operationDispatcher(),
  })
  assert.ok(
    joined.ok &&
      joined.registrationId &&
      joined.generation &&
      joined.clientId &&
      joined.rosterPlayerId,
  )
  const facades = (
    r.factory as unknown as { facades: WeakMap<object, RealGameFacade> }
  ).facades
  const facade = facades.get(r.game)!
  assert.ok(facade)
  const native: string[] = [],
    operate = facade.operate.bind(facade)
  facade.operate = (...args) => {
    native.push(args[2].action)
    return operate(...args)
  }
  const intent = (
    action: GatewayOperationIntent["action"],
    extra: Partial<GatewayOperationIntent> = {},
  ): GatewayOperationIntent => ({
    operationId: randomUUID(),
    registrationId: joined.registrationId!,
    generation: joined.generation!,
    action,
    ...extra,
  })
  const options = (value: GatewayOperationIntent) => {
    const opRoot = real.privateRoot("operation-intent")
    writeFileSync(
      join(opRoot, OPERATION_PRECOMMIT_MARKER),
      OPERATION_PRECOMMIT_CONTENT,
      { mode: 0o600 },
    )
    return {
      enabled: true,
      root: opRoot,
      installationId: "operation-fixture",
      keyId: "gateway-key",
      key: keyPort(true),
      intent: value,
    }
  }
  return {
    r,
    target,
    actual,
    service,
    root,
    key,
    input,
    callOptions,
    call,
    operator,
    joined,
    native,
    intent,
    options,
    opKeys: () => opKeys,
  }
}
export async function manager(f: Awaited<ReturnType<typeof fixture>>) {
  const socket = connect(real.base, {
    path: "/ws",
    auth: { token: f.r.subject.token },
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  })
  sockets.push(socket)
  const event = (name: string) =>
    new Promise<void>((done, reject) => {
      const success = () => {
        clearTimeout(timer)
        done()
      }
      const timer = setTimeout(() => {
        socket.off(name, success)
        reject(Error("Actual manager deadline"))
      }, 6000)
      socket.once(name, success)
    })
  let sequence = 0,
    name: string = ""
  socket.on(EVENTS.GAME.STATUS, (status) => {
    sequence++
    name = status.name
  })
  const connected = event("connect")
  socket.connect()
  await connected
  const ready = event(EVENTS.MANAGER.SUCCESS_RECONNECT)
  socket.emit(EVENTS.MANAGER.RECONNECT, { gameId: f.r.game.gameId })
  await ready
  f.r.game.updateSettings({ endOnAllAnswered: false })
  const wait = async (predicate: () => boolean, ms = 12000) => {
    const until = Date.now() + ms
    while (!predicate()) {
      if (Date.now() > until) throw Error("Actual round deadline")
      await new Promise((done) => setTimeout(done, 20))
    }
  }
  return {
    async start() {
      socket.emit(EVENTS.MANAGER.START_GAME, { gameId: f.r.game.gameId })
      await wait(() => f.r.game.getQuestionStateForGateway().acceptingAnswers)
    },
    async until(predicate: () => boolean) {
      for (let i = 0; i < 20; i++) {
        if (predicate()) return
        const before = sequence
        if (name !== STATUS.SHOW_PREPARED && name !== STATUS.SHOW_QUESTION)
          socket.emit(EVENTS.MANAGER.ADVANCE, { gameId: f.r.game.gameId })
        await wait(() => predicate() || before !== sequence, 6000)
      }
      assert.fail("Bounded actual manager controls exhausted")
    },
  }
}
