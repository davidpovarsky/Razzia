import type {
  Action,
  OperationInput,
  Receipt,
  RegistrationInput,
} from "../../../server/phone-lifecycle-v2/contracts"
import type { ControlReceipt } from "../../../server/phone-lifecycle-v2/auth/contracts"
import type {
  GatewayCustodyOptions,
  GatewayDelivery,
  GatewayDeliveryAck,
  GatewayLeaseView,
  GatewayRegistrationAuthorityPort,
  GatewayRegistrationDispatcher,
  GatewayCallAuthorityPort,
  GatewayOperationDispatcher,
} from "./contracts"
import { bindingText, delivery, deny, id, lease, target } from "./codec"
import { PrivateGatewayCustody } from "./private-custody"

// Unmounted host adapter. All authority is an injected trusted server port; no
// callback fields, ciphertext header, local flag or cache grants a permission.
export class PrivateGatewayAdapter {
  private readonly files: PrivateGatewayCustody
  private readonly scope: ReturnType<typeof target>
  constructor(private readonly options: GatewayCustodyOptions) {
    this.scope = target(options.target)
    this.files = new PrivateGatewayCustody(options)
  }
  private current(): GatewayLeaseView {
    return lease(this.options.authority.current(), this.scope)
  }
  initializeEmpty(): void {
    try {
      const current = this.current()
      this.files.initialize(current.binding, () => {
        if (
          bindingText(this.current().binding) !== bindingText(current.binding)
        )
          deny()
      })
    } catch {
      deny()
    }
  }
  async acceptDelivery(input: GatewayDelivery): Promise<GatewayDeliveryAck> {
    try {
      const value = delivery(input)
      const check = () => {
        if (bindingText(this.current().binding) !== bindingText(value.binding))
          deny()
        if (
          (this.options.authority.assertCredential(
            value.binding,
            value.credential,
          ) as unknown) !== undefined
        )
          deny()
      }
      check() // Live host proof BEFORE key or private file access.
      return this.files.accept(
        value.binding,
        value.credential,
        value.expectedStoredVersion,
        value.deliveryId,
        check,
      )
    } catch {
      return deny()
    }
  }
  inspect(): GatewayDeliveryAck {
    return this.authorize()
  }
  // Private typed host port: no raw service credential getter or generic work callback.
  registrationDispatcher(): GatewayRegistrationDispatcher {
    const authority = this.options.authority as GatewayRegistrationAuthorityPort
    if (typeof authority.register !== "function") deny()
    const current = () => {
      const before = this.current()
      this.authorize("register")
      const after = this.current()
      if (
        bindingText(before.binding) !== bindingText(after.binding) ||
        after.state !== "ACTIVE" ||
        !after.allowedActions.includes("register")
      )
        deny()
      return after.binding
    }
    return Object.freeze({
      current,
      register: async (input: RegistrationInput): Promise<Receipt> => {
        try {
          const request = Object.freeze({ ...input })
          const expected = current(),
            sealed = this.files.read(expected)
          if (sealed.credential === null) deny()
          this.options.authority.assertCredential(
            expected,
            sealed.credential,
            "register",
          )
          const result = await authority.register(
            expected,
            sealed.credential,
            request,
          )
          this.options.authority.assertCredential(
            expected,
            sealed.credential,
            "register",
          )
          if (bindingText(current()) !== bindingText(expected)) deny()
          this.files.assertUnchanged(sealed)
          return registrationReceipt(result, [
            sealed.credential,
            request.capability,
          ])
        } catch {
          return deny()
        }
      },
    })
  }
  authorization(action: Action): GatewayDeliveryAck {
    return this.authorize(action)
  }
  operationDispatcher(): GatewayOperationDispatcher {
    const authority = this.options.authority as GatewayCallAuthorityPort
    if (typeof authority.operate !== "function") deny()
    const current = (action: OperationInput["action"]) => {
      if (!["poll", "answer", "hangup"].includes(action)) deny()
      const before = this.current()
      this.authorize(action)
      const after = this.current()
      if (
        bindingText(before.binding) !== bindingText(after.binding) ||
        after.state !== "ACTIVE" ||
        !after.allowedActions.includes(action)
      )
        deny()
      return after.binding
    }
    return Object.freeze({
      current,
      operate: async (input: OperationInput): Promise<Receipt> => {
        try {
          const request = Object.freeze({ ...input }),
            expected = current(request.action),
            sealed = this.files.read(expected)
          if (sealed.credential === null) deny()
          this.options.authority.assertCredential(
            expected,
            sealed.credential,
            request.action,
          )
          const receipt = await authority.operate(
            expected,
            sealed.credential,
            request,
          )
          this.options.authority.assertCredential(
            expected,
            sealed.credential,
            request.action,
          )
          if (bindingText(current(request.action)) !== bindingText(expected))
            deny()
          this.files.assertUnchanged(sealed)
          return operationReceipt(receipt, [
            sealed.credential,
            request.capability,
          ])
        } catch {
          return deny()
        }
      },
    })
  }
  private authorize(action?: Action): GatewayDeliveryAck {
    try {
      const current = this.current()
      if (
        action !== undefined &&
        (current.state !== "ACTIVE" || !current.allowedActions.includes(action))
      )
        deny()
      const sealed = this.files.read(current.binding)
      if (sealed.credential === null) deny()
      if (
        (this.options.authority.assertCredential(
          sealed.binding,
          sealed.credential,
          action,
        ) as unknown) !== undefined
      )
        deny()
      if (bindingText(this.current().binding) !== bindingText(sealed.binding))
        deny()
      this.files.assertUnchanged(sealed)
      return this.files.ack(sealed)
    } catch {
      return deny()
    }
  }
  async activate(requestId: string): Promise<ControlReceipt> {
    try {
      id(requestId)
      const current = this.current(),
        sealed = this.files.read(current.binding)
      if (sealed.credential === null) deny()
      if (
        (this.options.authority.assertCredential(
          sealed.binding,
          sealed.credential,
        ) as unknown) !== undefined
      )
        deny()
      const receipt = await this.options.authority.activate(
        sealed.binding,
        sealed.credential,
        requestId,
      )
      if (
        (this.options.authority.assertCredential(
          sealed.binding,
          sealed.credential,
        ) as unknown) !== undefined
      )
        deny()
      if (bindingText(this.current().binding) !== bindingText(sealed.binding))
        deny()
      this.files.assertUnchanged(sealed)
      // Explicit allowlist: a host response cannot smuggle secret-bearing fields.
      if (
        !receipt ||
        receipt.ok !== true ||
        receipt.service !== sealed.binding.service ||
        receipt.version !== sealed.binding.version ||
        receipt.state !== "ACTIVE" ||
        receipt.status !== "active"
      )
        deny()
      return Object.freeze({
        ok: true,
        status: "active",
        service: receipt.service,
        version: receipt.version,
        state: "ACTIVE",
        expiresAt: sealed.binding.expiresAt,
      })
    } catch {
      return deny()
    }
  }
}

export function registrationReceipt(
  input: Receipt,
  secrets: readonly string[] = [],
): Receipt {
  const keys = [
    "ok",
    "status",
    "registrationId",
    "generation",
    "rosterPlayerId",
    "clientId",
  ]
  if (
    !input ||
    typeof input !== "object" ||
    "then" in input ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    typeof input.ok !== "boolean" ||
    typeof input.status !== "string" ||
    !/^[a-z][a-z_]{0,63}$/u.test(input.status)
  )
    deny()
  const result: Receipt = { ok: input.ok, status: input.status }
  for (const key of ["registrationId", "rosterPlayerId", "clientId"] as const) {
    if (input[key] !== undefined) {
      id(input[key])
      result[key] = input[key]
    }
  }
  if (input.generation !== undefined) {
    if (!Number.isSafeInteger(input.generation) || input.generation < 1) deny()
    result.generation = input.generation
  }
  if (
    result.ok &&
    (!result.registrationId ||
      !result.rosterPlayerId ||
      !result.clientId ||
      !result.generation)
  )
    deny()
  if (
    Object.values(result).some(
      (value) =>
        typeof value === "string" &&
        secrets.some((secret) => value.includes(secret)),
    )
  )
    deny()
  return Object.freeze(result)
}

export function operationReceipt(
  input: Receipt,
  secrets: readonly string[] = [],
): Receipt {
  const keys = ["ok", "status", "accepted", "epoch", "points", "answered"]
  if (
    !input ||
    typeof input !== "object" ||
    "then" in input ||
    Object.keys(input).some((key) => !keys.includes(key)) ||
    typeof input.ok !== "boolean" ||
    typeof input.status !== "string" ||
    !/^[a-z][a-z_]{0,63}$/u.test(input.status) ||
    secrets.some((secret) => input.status.includes(secret))
  )
    deny()
  const result: Receipt = { ok: input.ok, status: input.status }
  for (const key of ["accepted", "answered"] as const) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "boolean") deny()
      result[key] = input[key]
    }
  }
  if (input.epoch !== undefined) {
    if (!Number.isSafeInteger(input.epoch) || input.epoch < 0) deny()
    result.epoch = input.epoch
  }
  if (input.points !== undefined) {
    if (
      !Number.isFinite(input.points) ||
      Math.abs(input.points) > Number.MAX_SAFE_INTEGER
    )
      deny()
    result.points = input.points
  }
  return Object.freeze(result)
}
