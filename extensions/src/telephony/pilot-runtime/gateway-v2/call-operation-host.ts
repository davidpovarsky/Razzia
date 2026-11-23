import type {
  OperationInput,
  Receipt,
} from "../../../server/phone-lifecycle-v2/contracts"
import type {
  GatewayBinding,
  GatewayPrivateKeyPort,
  GatewayOperationDispatcher,
  GatewayTarget,
} from "./contracts"
import { binding, deny, immutableText, scopeText, target } from "./codec"
import { operationReceipt } from "./adapter"
import {
  callAttempt,
  callAttemptText,
  decodeCallRecord,
  type GatewayCallAttempt,
} from "./call-record"
import { PrivateImmutableRecord } from "./private-immutable-record"
import {
  PrivateOperationPrecommit,
  operationIntent,
  type GatewayOperationIntent,
  type GatewayOperationPrecommitOptions,
} from "./operation-precommit"

export interface GatewayCallOperationHostOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly target: GatewayTarget
  readonly key: GatewayPrivateKeyPort
  readonly attempt: GatewayCallAttempt
  readonly dispatcher: GatewayOperationDispatcher
}
// Read-only operation consumer of an existing call record. It has no registration,
// preparation, capability generation or missing-record recovery entry point.
export class PrivateCallOperationHost {
  private readonly scope: GatewayTarget
  private readonly expected: GatewayCallAttempt
  private readonly files: Pick<
    PrivateImmutableRecord,
    "read" | "assertUnchanged"
  >
  constructor(private readonly options: GatewayCallOperationHostOptions) {
    this.scope = target(options.target)
    this.expected = callAttempt(options.attempt)
    this.files = new PrivateImmutableRecord({
      ...options,
      kind: "call",
      expectedText: callAttemptText(this.expected),
    })
  }
  private current(action: OperationInput["action"]): GatewayBinding {
    const actual = binding(this.options.dispatcher.current(action))
    if (
      scopeText(actual) !== scopeText(this.scope) ||
      actual.expiresAt <= Date.now()
    )
      deny()
    return actual
  }
  private matches(stored: GatewayBinding, action: OperationInput["action"]) {
    const actual = this.current(action)
    if (
      immutableText(stored) !== immutableText(actual) ||
      stored.version > actual.version
    )
      deny()
    return actual
  }
  private read(action: OperationInput["action"]) {
    const record = this.files.read(() => {
      this.current(action)
    })
    const call = decodeCallRecord(record.body, this.expected)
    this.matches(call.binding, action)
    return { ...call, record }
  }
  operation(
    options: GatewayOperationPrecommitOptions,
  ): PrivateOperationPrecommit {
    return new PrivateOperationPrecommit(
      options,
      Object.freeze({
        target: this.scope,
        call: this.expected,
        callText: callAttemptText(this.expected),
        current: (action: OperationInput["action"]) => {
          this.read(action)
          return this.current(action)
        },
        execute: (intent: GatewayOperationIntent) => this.execute(intent),
      }),
    )
  }
  private async execute(input: GatewayOperationIntent): Promise<Receipt> {
    try {
      const intent = operationIntent(input),
        stored = this.read(intent.action)
      const request: OperationInput = Object.freeze({
        requestId: stored.input.requestId,
        capability: stored.input.capability,
        ...intent,
      })
      const result = await this.options.dispatcher.operate(request)
      this.matches(stored.binding, intent.action)
      this.files.assertUnchanged(stored.record, () => {
        this.current(intent.action)
      })
      return operationReceipt(result, [stored.input.capability])
    } catch {
      return deny()
    }
  }
}
