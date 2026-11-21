import type {
  ManagedClientGamesResponse,
  ManagedClientLaunchResponse,
  ManagedClientSessionResponse,
} from "@razzia/common/types/managed-clients"
import { managedClientHeaders } from "@razzia/web/lib/managed-client-session"
import { SiteApiError } from "./client"

export class ManagedClientApiError extends SiteApiError {
  readonly retryAfterSeconds: number

  constructor(status: number, code: string, retryAfterSeconds = 0) {
    super(status, code)
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export const isManagedClientCode = (value: string): boolean =>
  /^[0-9]{6}$/u.test(value)

/** Dedicated cookie transport never reads, refreshes or sends an owner token. */
async function clientRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = managedClientHeaders(options.headers)

  if (typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(`/api/client-access${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    const retryAfter = Number(response.headers.get("Retry-After"))

    throw new ManagedClientApiError(
      response.status,
      body.error ?? "request-failed",
      Number.isFinite(retryAfter) ? Math.max(0, Math.min(3600, retryAfter)) : 0,
    )
  }

  return (await response.json()) as T
}

export const readManagedClientSession = (signal?: AbortSignal) =>
  clientRequest<ManagedClientSessionResponse>("/session", { signal })

export function openManagedClientSession(code: string, signal?: AbortSignal) {
  if (!isManagedClientCode(code)) {
    return Promise.reject(new ManagedClientApiError(400, "invalid-client-code"))
  }

  return clientRequest<ManagedClientSessionResponse>("/session", {
    method: "POST",
    body: JSON.stringify({ code }),
    signal,
  })
}

export const closeManagedClientSession = () =>
  clientRequest<{ status: "signed-out" }>("/session", { method: "DELETE" })

export const readManagedClientGames = (signal?: AbortSignal) =>
  clientRequest<ManagedClientGamesResponse>("/games", { signal })

export const launchManagedClientGame = (
  quizId: string,
  requestId: string,
  signal?: AbortSignal,
) =>
  clientRequest<ManagedClientLaunchResponse>(
    `/games/${encodeURIComponent(quizId)}/launch`,
    { method: "POST", body: JSON.stringify({ requestId }), signal },
  )
