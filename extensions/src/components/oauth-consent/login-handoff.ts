// Same-tab transport of an issuer's sealed request, never consent authority.
// Do not store a native token, proof, grant, state or callback in this record.
// The issuer remains responsible for ticket authenticity and its real expiry.
//
export const CONSENT_PATH = "/studio/oauth-consent"

export const CONSENT_HANDOFF_KEY = "tadazz.oauth.pending-ticket.v1"

export const CONSENT_HANDOFF_TTL_MS = 5 * 60 * 1000

interface Location {
  pathname: string
  searchStr: string
  hash?: string
}
type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">
const opaqueTicket = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9_-]{40,8192}$/u.test(value)

export function consentTicketFromSearch(search: string): string | null {
  const values = new URLSearchParams(search).getAll("oauth_request")

  return values.length === 1 && opaqueTicket(values[0]) ? values[0] : null
}

export function createConsentLoginHandoff(
  storage: Storage,
  now: () => number = Date.now,
) {
  const clear = () => {
    try {
      storage.removeItem(CONSENT_HANDOFF_KEY)
    } catch {
      /* Fail closed */
    }
  }
  const read = (): { ticket: string; expiresAt: number } | null => {
    try {
      const raw = storage.getItem(CONSENT_HANDOFF_KEY)

      if (!raw) {
        return null
      }

      if (raw.length > 8300) {
        throw new Error("oversized-handoff")
      }

      const record: unknown = JSON.parse(raw)

      if (!record || typeof record !== "object") {
        throw new Error("invalid-handoff")
      }

      const value = record as Record<string, unknown>
      const time = now()

      if (
        Object.keys(value).sort().join(",") !== "expiresAt,ticket" ||
        !opaqueTicket(value.ticket) ||
        !Number.isSafeInteger(value.expiresAt) ||
        (value.expiresAt as number) <= time ||
        (value.expiresAt as number) > time + CONSENT_HANDOFF_TTL_MS
      ) {
        throw new Error("invalid-handoff")
      }

      return { ticket: value.ticket, expiresAt: value.expiresAt as number }
    } catch {
      clear()

      return null
    }
  }

  return {
    // Call only at the actual unauthenticated consent guard, before /login.
    // Repeated guards/StrictMode do not extend the deadline. A new request replaces
    // the old one. A malformed explicit request clears the previous request.
    //
    capture(location: Location): boolean {
      if (location.pathname !== CONSENT_PATH) {
        return false
      }

      const query = new URLSearchParams(location.searchStr)
      const ticket = consentTicketFromSearch(location.searchStr)

      if (
        location.hash ||
        [...query.keys()].some((key) => key !== "oauth_request") ||
        !ticket
      ) {
        clear()

        return false
      }

      const previous = read()

      if (previous?.ticket === ticket) {
        return true
      }

      try {
        storage.setItem(
          CONSENT_HANDOFF_KEY,
          JSON.stringify({
            ticket,
            expiresAt: now() + CONSENT_HANDOFF_TTL_MS,
          }),
        )

        return read()?.ticket === ticket
      } catch {
        clear()

        return false
      }
    },
    // After native login, only the exact query-free consent pathname may resume.
    // Non-destructive until the actual authenticated consent page acknowledges it:
    // repeated route guards cannot consume each other's ticket.
    //
    resume(location: Location): { oauth_request: string } | null {
      if (
        location.pathname !== CONSENT_PATH ||
        location.searchStr ||
        location.hash
      ) {
        return null
      }

      const record = read()

      return record ? { oauth_request: record.ticket } : null
    },
    // Call after the real native profile is validated and this ticket is in URL.
    // An older mounted page cannot erase a newer replacement request.
    //
    acknowledge(ticket: string) {
      if (read()?.ticket === ticket) {
        clear()
      }
    },
    /** Explicit cancel/logout/unexpected session replacement or abandoned login. */
    clear,
  }
}

/** Lazy access also handles browsers where sessionStorage access itself throws. */
export function browserConsentLoginHandoff() {
  const storage: Storage = {
    getItem: (key) => window.sessionStorage.getItem(key),
    setItem: (key, value) => window.sessionStorage.setItem(key, value),
    removeItem: (key) => window.sessionStorage.removeItem(key),
  }

  return createConsentLoginHandoff(storage)
}
