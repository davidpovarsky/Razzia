import {
  clearToken,
  getClientId,
  getRole,
  getToken,
} from "@razzia/web/lib/session"
import { SESSION_ROLES } from "@razzia/common/constants"

export class SiteApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code)
  }
}

export interface Account {
  id: string
  email: string
  verified: boolean
}

export const siteKey = (account: string, ...parts: string[]) =>
  ["tadazz-site", account, ...parts] as const

/** Preserve the existing session architecture; never renew a manager as a guest. */
export async function siteRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!path.startsWith("/api/") || path.startsWith("//")) {
    throw new Error("Invalid API path")
  }

  const headers = new Headers(options.headers)
  const token = getToken()

  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  if (typeof options.body === "string") {
    headers.set("Content-Type", "application/json")
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  })

  if (response.status === 401 && getToken() === token) {
    clearToken()
  }

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string
    }
    throw new SiteApiError(response.status, error.error ?? "request-failed")
  }

  return (response.status === 204 ? undefined : await response.json()) as T
}

export const hasManagerSession = () =>
  getRole() === SESSION_ROLES.MANAGER && Boolean(getClientId())

export const currentAccount = (signal?: AbortSignal) =>
  siteRequest<Account>("/api/accounts/me", { signal })

/** Only local, supported destinations. Reject external, auth and token-bearing URLs. */
export function safeReturnTo(value: string | null): string {
  if (!value || /[\\\r\n]/u.test(value) || !value.startsWith("/")) {
    return "/studio"
  }

  const url = new URL(value, "https://tadazz.invalid")

  if (url.origin !== "https://tadazz.invalid" || url.search || url.hash) {
    return "/studio"
  }

  return /^\/(?:studio(?:\/(?:games|events|account|explore|prepare))?|manager\/quizz(?:\/[a-zA-Z0-9_-]+)?)\/?$/u.test(
    url.pathname,
  )
    ? url.pathname
    : "/studio"
}
