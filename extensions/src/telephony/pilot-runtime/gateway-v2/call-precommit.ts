import { randomBytes } from "node:crypto"
import type { Receipt } from "../../../server/phone-lifecycle-v2/contracts"
import { registrationReceipt } from "./adapter"
import type {
  GatewayBinding,
  GatewayPrivateKeyPort,
  GatewayRegistrationDispatcher,
  GatewayTarget,
} from "./contracts"
import { binding, deny, immutableText, scopeText, target } from "./codec"
import {
  PRIVATE_RECORD_SPEC,
  PrivateImmutableRecord,
} from "./private-immutable-record"
import {
  callAttempt,
  callAttemptText,
  decodeCallRecord,
  type GatewayCallAttempt,
} from "./call-record"

export type { GatewayCallAttempt } from "./call-record"
export const CALL_PRECOMMIT_PURPOSE = PRIVATE_RECORD_SPEC.call.purpose
export const CALL_PRECOMMIT_MARKER = PRIVATE_RECORD_SPEC.call.marker
export const CALL_PRECOMMIT_CONTENT = PRIVATE_RECORD_SPEC.call.content
export interface GatewayCallPrecommitOptions {
  readonly enabled?: boolean
  readonly root: string
  readonly installationId: string
  readonly keyId: string
  readonly target: GatewayTarget
  readonly key: GatewayPrivateKeyPort
  readonly dispatcher: GatewayRegistrationDispatcher
  readonly attempt: GatewayCallAttempt
}

// Explicit REGISTER-only journal. There is deliberately no operation host,
// poll/answer/hangup forwarding or new-attempt inference on this class.
export class PrivateCallPrecommit {
  private readonly scope: GatewayTarget
  private readonly expected: GatewayCallAttempt
  private readonly files: PrivateImmutableRecord
  constructor(private readonly options: GatewayCallPrecommitOptions) {
    this.scope = target(options.target)
    this.expected = callAttempt(options.attempt)
    this.files = new PrivateImmutableRecord({
      ...options,
      kind: "call",
      expectedText: callAttemptText(this.expected),
    })
  }
  private current(): GatewayBinding {
    const value = binding(this.options.dispatcher.current())
    if (
      scopeText(value) !== scopeText(this.scope) ||
      value.expiresAt <= Date.now()
    )
      deny()
    return value
  }
  private matches(stored: GatewayBinding) {
    const current = this.current()
    if (
      immutableText(stored) !== immutableText(current) ||
      stored.version > current.version
    )
      deny()
    return current
  }
  private read() {
    const record = this.files.read(() => {
        this.current()
      }),
      call = decodeCallRecord(record.body, this.expected)
    this.matches(call.binding)
    return { ...call, record }
  }
  prepare(
    input: GatewayCallAttempt,
  ): Readonly<{ requestId: string; precommitted: true }> {
    try {
      const expected = this.current(),
        canonical = callAttempt(input)
      if (callAttemptText(canonical) !== callAttemptText(this.expected)) deny()
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
      const stored = this.read(),
        result = await this.options.dispatcher.register(stored.input)
      this.matches(stored.binding)
      this.files.assertUnchanged(stored.record, () => {
        this.current()
      })
      return registrationReceipt(result, [stored.input.capability])
    } catch {
      return deny()
    }
  }
}
