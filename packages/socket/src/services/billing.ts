import { resolve } from "node:path"
import {
  BillingError,
  BillingService,
  readBillingConfig,
  beginPhoneCall,
  endPhoneCall,
  startBillingMaintenance,
} from "@razzia/extensions/server"
import { invalidInput } from "./errors"

let service: BillingService | null = null
let stopMaintenance: (() => void) | null = null

export function getBilling(): BillingService | null {
  if (process.env.TADAZZ_BILLING_ENABLED !== "true") {
    return null
  }

  if (!service) {
    const config = readBillingConfig()
    service = new BillingService(
      config,
      resolve(process.env.CONFIG_PATH ?? "config", "tadazz-billing.sqlite"),
    )
    stopMaintenance = startBillingMaintenance(service)
  }

  return service
}

export function closeBilling() {
  stopMaintenance?.()
  stopMaintenance = null
  service?.close()
  service = null
}

export function requireBilling(): BillingService {
  const billing = getBilling()

  if (!billing) {
    throw new BillingError("disabled", 404)
  }

  return billing
}

export function reserveBilledGame(tenantId: string, gameId: string) {
  try {
    getBilling()?.entitlements.reserve(tenantId, gameId)
  } catch (error) {
    if (error instanceof BillingError) {
      throw invalidInput(error.message)
    }

    throw invalidInput("extensions:billing.errors.unavailable")
  }
}

export function startBilledGame(
  tenantId: string,
  gameId: string,
): string | null {
  try {
    getBilling()?.entitlements.start(tenantId, gameId)

    return null
  } catch (error) {
    if (error instanceof BillingError) {
      return error.message
    }

    return "extensions:billing.errors.unavailable"
  }
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function admitBilledParticipant(
  tenantId: string,
  gameId: string,
  identity: string,
  join: () => string | null,
) {
  try {
    const billing = getBilling()

    return billing
      ? billing.entitlements.admit(tenantId, gameId, identity, join)
      : join()
  } catch {
    return "extensions:billing.errors.unavailable"
  }
}

// oxlint-disable-next-line eslint/max-params -- Explicit account/game coordinates and injected dependencies form this boundary.
export function admitBilledPhone(
  tenantId: string,
  gameId: string,
  identity: string,
  callId: string,
  join: () => string | null,
): string | null {
  const billing = getBilling()

  if (!billing) {
    return join()
  }

  let created = false

  try {
    created = beginPhoneCall(billing.database, tenantId, gameId, callId)
    const error = billing.entitlements.admit(tenantId, gameId, identity, join)

    if (error && created) {
      endPhoneCall(billing.database, gameId, callId)
    }

    return error
  } catch (error) {
    if (created) {
      endPhoneCall(billing.database, gameId, callId)
    }

    return error instanceof BillingError
      ? error.message
      : "extensions:billing.errors.unavailable"
  }
}

export function finishBilledPhone(gameId: string, callId: string | undefined) {
  const billing = getBilling()

  if (billing && callId) {
    endPhoneCall(billing.database, gameId, callId)
  }
}
