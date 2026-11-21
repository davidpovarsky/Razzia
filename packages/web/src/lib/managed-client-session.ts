const MODE_KEY = "tadazz:managed-client-mode"

export const MANAGED_CLIENT_SESSION_HEADER = "X-Tadazz-Session"

export const MANAGED_CLIENT_EXPIRED_EVENT = "tadazz:managed-client-expired"

export const isManagedClientRoomPath = (pathname: string): boolean =>
  /^\/(?:party\/manager|display)\//u.test(pathname)

// This is a navigation hint, never a credential. The server authenticates the
// separate HttpOnly cookie and checks the exact assigned game on every request.
let memoryMode = false

export function isManagedClientMode(): boolean {
  try {
    return memoryMode || sessionStorage.getItem(MODE_KEY) === "active"
  } catch {
    return memoryMode
  }
}

export function enterManagedClientMode(): void {
  memoryMode = true

  try {
    sessionStorage.setItem(MODE_KEY, "active")
  } catch {
    // The current page still uses managed mode when browser storage is blocked.
  }
}

/** Only an explicit successful owner login leaves the isolated client context. */
export function leaveManagedClientMode(): void {
  memoryMode = false

  try {
    sessionStorage.removeItem(MODE_KEY)
  } catch {
    // No account credential is stored here.
  }
}

export function managedClientHeaders(initial?: HeadersInit): Headers {
  const headers = new Headers(initial)
  headers.delete("Authorization")
  headers.set(MANAGED_CLIENT_SESSION_HEADER, "managed-client")

  return headers
}

export function notifyManagedClientExpired(): void {
  window.dispatchEvent(new Event(MANAGED_CLIENT_EXPIRED_EVENT))

  if (isManagedClientRoomPath(window.location.pathname)) {
    window.location.replace("/client?expired=1")
  }
}

/** The URL contains only a mode hint. A copied link still requires the cookie. */
export function managedClientHostUrl(gameId: string, hostUrl: string): string {
  const expected = `/party/manager/${encodeURIComponent(gameId)}`

  if (!gameId || hostUrl !== expected) {
    throw new Error("Invalid managed client room destination")
  }

  return `${expected}?client=1`
}
