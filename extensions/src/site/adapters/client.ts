import { publicDemoCatalogue } from "../../core/show-library/public-demo-catalogue"
import {
  clearToken,
  getClientId,
  getRole,
  getToken,
} from "@razzia/web/lib/session"
import { SESSION_ROLES } from "@razzia/common/constants"
import {
  isManagedClientMode,
  managedClientHeaders,
  notifyManagedClientExpired,
} from "@razzia/web/lib/managed-client-session"

export class SiteApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string) {
    super(code)
    this.status = status
    this.code = code
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

  const managed = isManagedClientMode()
  const headers = managed
    ? managedClientHeaders(options.headers)
    : new Headers(options.headers)
  const token = managed ? null : getToken()

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

  if (response.status === 401) {
    if (managed) {
      notifyManagedClientExpired()
    } else if (getToken() === token) {
      clearToken()
    }
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
  !isManagedClientMode() &&
  getRole() === SESSION_ROLES.MANAGER &&
  Boolean(getClientId())

export const currentAccount = (signal?: AbortSignal) =>
  siteRequest<Account>("/api/accounts/me", { signal })

/** Only local, supported destinations. Reject external, auth and token-bearing URLs. */
export function safeReturnTo(value: string | null): string {
  if (!value || /[\\\r\n]/u.test(value) || !value.startsWith("/")) {
    return "/studio"
  }

  const url = new URL(value, "https://tadazz.invalid")

  if (url.origin !== "https://tadazz.invalid" || url.hash) {
    return "/studio"
  }

  const catalogueId = url.searchParams.get("game")

  // Preserve only an exact public catalogue selection across sign-in.
  // Extra parameters, duplicate keys and unknown identifiers remain rejected.
  if (
    url.pathname === "/" &&
    url.searchParams.size === 2 &&
    url.searchParams.get("view") === "product" &&
    catalogueId !== null &&
    publicDemoCatalogue.some((game) => game.id === catalogueId)
  ) {
    return `/?view=product&game=${encodeURIComponent(catalogueId)}`
  }

  if (url.search) {
    return "/studio"
  }

  if (
    /^\/studio\/package-preview\/[A-Za-z0-9_-]{1,160}\/[1-9][0-9]{0,15}\/[A-Za-z0-9._-]{1,160}$/u.test(
      url.pathname,
    ) ||
    /^\/studio\/package-save-consent\/[A-Za-z0-9_-]{1,160}$/u.test(url.pathname)
  ) {
    return url.pathname
  }

  if (
    import.meta.env.VITE_TADAZZ_NATIVE_CONSENT_ENABLED === "true" &&
    /^\/studio\/native-save-consent\/[A-Za-z0-9_-]{54}$/u.test(value)
  ) {
    return value
  }

  return /^\/(?:studio(?:\/(?:games|events|account|explore|prepare|clients|oauth-consent))?|manager\/quizz(?:\/[a-zA-Z0-9_-]+)?)\/?$/u.test(
    url.pathname,
  )
    ? url.pathname
    : "/studio"
}
