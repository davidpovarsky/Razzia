import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { PrototypeStore } from "../../../../../extensions/src/server/phone-lifecycle-v2/store"
import { LifecyclePrototype } from "../../../../../extensions/src/server/phone-lifecycle-v2/prototype"
import type {
  OperationInput,
  Receipt,
  RegistrationDecision,
  Reservation,
  VerifiedServiceContext,
} from "../../../../../extensions/src/server/phone-lifecycle-v2/contracts"
import { bootActualBackend, precommit } from "./actual-game"

const root = process.env.PHONE_V2A_CASE_ROOT!,
  window = process.env.PHONE_V2A_KILL_WINDOW!
const backend = await bootActualBackend(),
  r = await backend.room()
const request = precommit(root, "kill-registration", "+447700900901")
writeFileSync(
  join(root, "synthetic-case.json"),
  JSON.stringify({ context: r.context, request }),
  { flag: "wx", mode: 0o600 },
)
let rosterId = ""
function boundary(stage: string, result?: Receipt) {
  if (stage !== window) return
  process.send?.({
    stage,
    context: r.context,
    root,
    result,
    snapshot: rosterId ? r.snapshot(rosterId) : null,
  })
  // Parent sends SIGKILL after observing the precise boundary. No cleanup or
  // synthetic rollback occurs. The blocked event loop cannot complete a receipt.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0)
}
class CrashStore extends PrototypeStore {
  override reserveRegistration(
    ...args: Parameters<PrototypeStore["reserveRegistration"]>
  ): RegistrationDecision {
    const result = super.reserveRegistration(...args)
    if (result.kind === "reserved") boundary("register-reserved")
    return result
  }
  override completeRegistration(
    context: VerifiedServiceContext,
    reservation: Reservation,
    result: Receipt,
  ) {
    rosterId = result.rosterPlayerId ?? ""
    boundary("register-projected", result)
    const receipt = super.completeRegistration(context, reservation, result)
    boundary("register-committed", receipt)
    return receipt
  }
  override reserveOperation(
    ...args: Parameters<PrototypeStore["reserveOperation"]>
  ) {
    const result = super.reserveOperation(...args)
    if (result.kind === "pending" && args[1].action === "answer")
      boundary("answer-reserved")
    if (result.kind === "pending" && args[1].action === "hangup")
      boundary("hangup-reserved")
    return result
  }
  override completeOperation(
    context: VerifiedServiceContext,
    input: OperationInput,
    result: Receipt,
  ) {
    if (input.action === "answer") boundary("answer-projected", result)
    if (input.action === "hangup") boundary("hangup-projected", result)
    const receipt = super.completeOperation(context, input, result)
    if (input.action === "answer") boundary("answer-committed", receipt)
    if (input.action === "hangup") boundary("hangup-committed", receipt)
    return receipt
  }
}
const store = new CrashStore(root, r.context, () => true)
const prototype = new LifecyclePrototype(store, r.facade, () => true)
const registration = prototype.register(r.context, request)
assert.equal(registration.ok, true)
rosterId = registration.rosterPlayerId!
if (window.startsWith("answer-") || window.startsWith("hangup-")) {
  if (window.startsWith("answer-")) await r.start()
  const input: OperationInput = {
    action: window.startsWith("answer-") ? "answer" : "hangup",
    requestId: request.requestId,
    registrationId: registration.registrationId!,
    generation: registration.generation!,
    capability: request.capability,
    operationId: "kill-operation",
    epoch: r.game.getQuestionStateForGateway().epoch,
    answerIndex: 4,
  }
  writeFileSync(join(root, "synthetic-operation.json"), JSON.stringify(input), {
    flag: "wx",
    mode: 0o600,
  })
  prototype.operate(r.context, input)
}
throw new Error("Requested kill window was not reached")
