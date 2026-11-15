import type { Action } from "../../../server/phone-lifecycle-v2/contracts"
import type { ControlReceipt } from "../../../server/phone-lifecycle-v2/auth/contracts"
import type {
  GatewayCustodyOptions,
  GatewayDelivery,
  GatewayDeliveryAck,
  GatewayLeaseView,
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
  authorization(action: Action): GatewayDeliveryAck {
    return this.authorize(action)
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
