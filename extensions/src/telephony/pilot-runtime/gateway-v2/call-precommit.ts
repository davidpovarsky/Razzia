import { randomBytes } from "node:crypto"
import { normalizePhoneE164 } from "@razzia/extensions/core"
import type {
  Action,
  OperationInput,
  Receipt,
  RegistrationInput,
} from "../../../server/phone-lifecycle-v2/contracts"
import { registrationReceipt, operationReceipt } from "./adapter"
import type {
  GatewayBinding,
  GatewayPrivateKeyPort,
  GatewayRegistrationDispatcher,
  GatewayOperationDispatcher,
  GatewayTarget,
} from "./contracts"
import {
  binding,
  credential,
  deny,
  exact,
  id,
  immutableText,
  integer,
  scopeText,
  target,
} from "./codec"
import {
  PRIVATE_RECORD_SPEC,
  PrivateImmutableRecord,
  type ImmutableRecord,
} from "./private-immutable-record"
import {
  PrivateOperationPrecommit,
  operationIntent,
  type GatewayOperationIntent,
  type GatewayOperationPrecommitOptions,
} from "./operation-precommit"

export const CALL_PRECOMMIT_PURPOSE = PRIVATE_RECORD_SPEC.call.purpose
export const CALL_PRECOMMIT_MARKER = PRIVATE_RECORD_SPEC.call.marker
export const CALL_PRECOMMIT_CONTENT = PRIVATE_RECORD_SPEC.call.content
export interface GatewayCallAttempt {
  readonly requestId: string
  readonly providerReference: string
  readonly phone: string
  readonly expectedPredecessor: number
}
export interface GatewayCallPrecommitOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly target: GatewayTarget
  readonly key: GatewayPrivateKeyPort
  readonly dispatcher: GatewayRegistrationDispatcher
  readonly attempt: GatewayCallAttempt
  readonly operations?: GatewayOperationDispatcher
}
interface StoredCall {
  binding: GatewayBinding
  input: RegistrationInput
  record: ImmutableRecord
}
const attemptText = (value: GatewayCallAttempt) =>
  JSON.stringify([
    value.requestId,
    value.providerReference,
    value.phone,
    value.expectedPredecessor,
  ])
function attempt(input: unknown): GatewayCallAttempt {
  const row = exact(input, [
    "requestId",
    "providerReference",
    "phone",
    "expectedPredecessor",
  ])
  const phone =
    typeof row.phone === "string" ? normalizePhoneE164(row.phone) : null
  if (!phone) deny()
  const predecessor = integer(row.expectedPredecessor)
  if (predecessor >= Number.MAX_SAFE_INTEGER) deny()
  return Object.freeze({
    requestId: id(row.requestId),
    providerReference: id(row.providerReference),
    phone,
    expectedPredecessor: predecessor,
  })
}

// One immutable call tuple per independently injected root. File/key mechanics
// are shared with immutable operations; neither file creates authority.
export class PrivateCallPrecommit {
  private readonly scope: GatewayTarget
  private readonly expected: GatewayCallAttempt
  private readonly files: PrivateImmutableRecord
  constructor(private readonly options: GatewayCallPrecommitOptions) {
    this.scope = target(options.target)
    this.expected = attempt(options.attempt)
    this.files = new PrivateImmutableRecord({
      ...options,
      kind: "call",
      expectedText: attemptText(this.expected),
    })
  }
  private current(action: Action = "register"): GatewayBinding {
    const value = binding(
      action === "register"
        ? this.options.dispatcher.current()
        : this.options.operations?.current(action),
    )
    if (
      scopeText(value) !== scopeText(this.scope) ||
      value.expiresAt <= Date.now()
    )
      deny()
    return value
  }
  private matches(stored: GatewayBinding, action: Action = "register") {
    const current = this.current(action)
    if (
      immutableText(stored) !== immutableText(current) ||
      stored.version > current.version
    )
      deny()
    return current
  }
  private read(action: Action = "register"): StoredCall {
    const record = this.files.read(() => {
        this.current(action)
      }),
      body = exact(record.body, ["schema", "binding", "input"])
    if (body.schema !== 1) deny()
    const value = binding(body.binding),
      row = exact(body.input, [
        "requestId",
        "providerReference",
        "phone",
        "expectedPredecessor",
        "capability",
      ])
    const canonical = attempt({
      requestId: row.requestId,
      providerReference: row.providerReference,
      phone: row.phone,
      expectedPredecessor: row.expectedPredecessor,
    })
    if (
      canonical.phone !== row.phone ||
      attemptText(canonical) !== attemptText(this.expected)
    )
      deny()
    const input = Object.freeze({
      ...canonical,
      capability: credential(row.capability),
    })
    this.matches(value, action)
    return { binding: value, input, record }
  }
  prepare(
    input: GatewayCallAttempt,
  ): Readonly<{ requestId: string; precommitted: true }> {
    try {
      const expected = this.current(),
        canonical = attempt(input)
      if (attemptText(canonical) !== attemptText(this.expected)) deny()
      this.files.prepare(
        () => ({
          schema: 1,
          binding: expected,
          input: { ...canonical, capability: randomBytes(32).toString("hex") },
        }),
        () => {
          this.matches(expected)
        },
      )
      return Object.freeze({
        requestId: canonical.requestId,
        precommitted: true,
      })
    } catch {
      return deny()
    }
  }
  async register(): Promise<Receipt> {
    try {
      const stored = this.read()
      const result = await this.options.dispatcher.register(stored.input)
      this.matches(stored.binding)
      this.files.assertUnchanged(stored.record, () => {
        this.current()
      })
      return registrationReceipt(result, [stored.input.capability])
    } catch {
      return deny()
    }
  }
  operation(
    options: GatewayOperationPrecommitOptions,
  ): PrivateOperationPrecommit {
    if (
      typeof this.options.operations?.current !== "function" ||
      typeof this.options.operations.operate !== "function"
    )
      deny()
    return new PrivateOperationPrecommit(
      options,
      Object.freeze({
        target: this.scope,
        call: this.expected,
        callText: attemptText(this.expected),
        current: (action: OperationInput["action"]) => {
          this.read(action)
          return this.current(action)
        },
        execute: (intent: GatewayOperationIntent) =>
          this.executeOperation(intent),
      }),
    )
  }
  private async executeOperation(
    input: GatewayOperationIntent,
  ): Promise<Receipt> {
    try {
      const intent = operationIntent(input),
        stored = this.read(intent.action)
      const request: OperationInput = Object.freeze({
        requestId: stored.input.requestId,
        capability: stored.input.capability,
        ...intent,
      })
      const result = await this.options.operations!.operate(request)
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
