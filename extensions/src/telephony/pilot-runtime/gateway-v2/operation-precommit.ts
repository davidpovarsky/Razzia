import type {
  OperationInput,
  Receipt,
} from "../../../server/phone-lifecycle-v2/contracts"
import type {
  GatewayBinding,
  GatewayPrivateKeyPort,
  GatewayTarget,
} from "./contracts"
import type { GatewayCallAttempt } from "./call-precommit"
import {
  binding,
  deny,
  exact,
  id,
  immutableText,
  integer,
  object,
  scopeText,
  target,
} from "./codec"
import { operationReceipt } from "./adapter"
import {
  PRIVATE_RECORD_SPEC,
  PrivateImmutableRecord,
} from "./private-immutable-record"

export const OPERATION_PRECOMMIT_MARKER = PRIVATE_RECORD_SPEC.operation.marker
export const OPERATION_PRECOMMIT_CONTENT = PRIVATE_RECORD_SPEC.operation.content
export const OPERATION_PRECOMMIT_PURPOSE = PRIVATE_RECORD_SPEC.operation.purpose
export type GatewayOperationIntent = Readonly<
  Pick<
    OperationInput,
    | "operationId"
    | "registrationId"
    | "generation"
    | "action"
    | "epoch"
    | "answerIndex"
  >
>
export interface GatewayOperationPrecommitOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly key: GatewayPrivateKeyPort
  readonly intent: GatewayOperationIntent
}
export interface PrivateOperationHost {
  readonly target: GatewayTarget
  readonly call: GatewayCallAttempt
  readonly callText: string
  current(action: OperationInput["action"]): GatewayBinding
  execute(intent: GatewayOperationIntent): Promise<Receipt>
}
export function operationIntent(input: unknown): GatewayOperationIntent {
  const raw = object(input),
    answer = raw.action === "answer"
  const row = exact(input, [
    "operationId",
    "registrationId",
    "generation",
    "action",
    ...(answer ? ["epoch", "answerIndex"] : []),
  ])
  if (!["poll", "answer", "hangup"].includes(row.action as string)) deny()
  const basic = {
    operationId: id(row.operationId),
    registrationId: id(row.registrationId),
    generation: integer(row.generation, 1),
    action: row.action as OperationInput["action"],
  }
  if (!answer) return Object.freeze(basic)
  const index = integer(row.answerIndex)
  if (index > 4) deny()
  return Object.freeze({
    ...basic,
    epoch: integer(row.epoch),
    answerIndex: index,
  })
}
export const operationText = (value: GatewayOperationIntent) =>
  JSON.stringify([
    value.operationId,
    value.registrationId,
    value.generation,
    value.action,
    value.epoch ?? null,
    value.answerIndex ?? null,
  ])

// A private immutable intent, never a queue or result/permission cache. Only the
// explicit execute method sends the independently expected operation.
export class PrivateOperationPrecommit {
  private readonly expected: GatewayOperationIntent
  private readonly scope: GatewayTarget
  private readonly call: GatewayCallAttempt
  private readonly files: PrivateImmutableRecord
  constructor(
    options: GatewayOperationPrecommitOptions,
    private readonly host: PrivateOperationHost,
  ) {
    this.expected = operationIntent(options.intent)
    this.scope = target(host.target)
    this.call = Object.freeze({ ...host.call })
    this.files = new PrivateImmutableRecord({
      ...options,
      target: this.scope,
      kind: "operation",
      expectedText: JSON.stringify([
        host.callText,
        operationText(this.expected),
      ]),
    })
  }
  private current() {
    const actual = binding(this.host.current(this.expected.action))
    if (
      scopeText(actual) !== scopeText(this.scope) ||
      actual.expiresAt <= Date.now()
    )
      deny()
    return actual
  }
  private match(value: GatewayBinding) {
    const actual = this.current()
    if (
      immutableText(actual) !== immutableText(value) ||
      value.version > actual.version
    )
      deny()
  }
  prepare(): Readonly<{ operationId: string; precommitted: true }> {
    try {
      const expected = this.current()
      this.files.prepare(
        () => ({
          schema: 1,
          binding: expected,
          call: this.call,
          intent: this.expected,
        }),
        () => {
          this.match(expected)
        },
      )
      return Object.freeze({
        operationId: this.expected.operationId,
        precommitted: true,
      })
    } catch {
      return deny()
    }
  }
  async execute(): Promise<Receipt> {
    try {
      const check = () => {
        this.current()
      }
      const record = this.files.read(check),
        body = exact(record.body, ["schema", "binding", "call", "intent"])
      const call = exact(body.call, [
        "requestId",
        "providerReference",
        "phone",
        "expectedPredecessor",
      ])
      if (
        body.schema !== 1 ||
        JSON.stringify([
          call.requestId,
          call.providerReference,
          call.phone,
          call.expectedPredecessor,
        ]) !== this.host.callText ||
        operationText(operationIntent(body.intent)) !==
          operationText(this.expected)
      )
        deny()
      const expected = binding(body.binding)
      this.match(expected)
      const result = await this.host.execute(this.expected)
      this.match(expected)
      this.files.assertUnchanged(record, check)
      return operationReceipt(result)
    } catch {
      return deny()
    }
  }
}
