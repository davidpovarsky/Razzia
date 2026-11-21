import { ensureSession } from "./session"
import {
  isManagedClientMode,
  managedClientHeaders,
  MANAGED_CLIENT_SESSION_HEADER,
} from "./managed-client-session"

/** One transport boundary for native host and package renderer requests. */
export async function requestAuthHeaders(
  initial?: HeadersInit,
): Promise<Headers> {
  if (isManagedClientMode()) {
    return managedClientHeaders(initial)
  }

  const { token } = await ensureSession()

  // A code login may finish while a normal session refresh is in flight.
  if (isManagedClientMode()) {
    return managedClientHeaders(initial)
  }

  const headers = new Headers(initial)
  headers.delete(MANAGED_CLIENT_SESSION_HEADER)
  headers.set("Authorization", `Bearer ${token}`)

  return headers
}
