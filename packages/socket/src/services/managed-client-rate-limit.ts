import { isIP } from "node:net"

const loopback = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"])

function singleCanonicalHeader(
  rawHeaders: unknown,
  canonicalHeader: string | undefined,
): boolean {
  if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
    return false
  }

  let count = 0

  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name: unknown = rawHeaders[index]
    const value: unknown = rawHeaders[index + 1]

    if (typeof name !== "string" || typeof value !== "string") {
      return false
    }

    if (name.toLowerCase() === "x-tadazz-client-ip") {
      if (value !== canonicalHeader) {
        return false
      }

      count += 1
    }
  }

  return count === 1
}

function address(value: string | undefined): string | undefined {
  if (!value || value.length > 45 || value.includes("%") || !isIP(value)) {
    return undefined
  }

  const normalized = value.toLowerCase()

  return normalized.startsWith("::ffff:") && isIP(normalized.slice(7)) === 4
    ? normalized.slice(7)
    : normalized
}

// Opt-in requires a pinned public host whose ingress OVERWRITES the dedicated
// header with the actual peer and an unpublished Node listener behind its proxy.
// Standard forwarding headers never influence the login budget.
export function managedClientRateAddress(input: {
  peerAddress?: string
  canonicalHeader?: string
  rawHeaders?: unknown
  requestHost?: string
  canonicalHost?: string
  trustLoopback?: boolean
}): string {
  if (
    input.trustLoopback &&
    loopback.has(input.peerAddress?.toLowerCase() ?? "") &&
    input.canonicalHost &&
    input.requestHost?.toLowerCase() === input.canonicalHost.toLowerCase() &&
    singleCanonicalHeader(input.rawHeaders, input.canonicalHeader)
  ) {
    const forwarded = address(input.canonicalHeader)

    if (forwarded) {
      return forwarded
    }
  }

  return address(input.peerAddress) ?? "unknown"
}
