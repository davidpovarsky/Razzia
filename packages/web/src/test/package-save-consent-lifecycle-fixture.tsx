import { flushSync } from "react-dom"
import { createRoot } from "react-dom/client"
import { SESSION_ROLES } from "@razzia/common/constants"
import { PackageSaveConsent } from "../features/manager/components/packages/PackageSaveConsent"
import { packageSaveText } from "../features/manager/components/packages/package-save-strings"

interface FixtureSession {
  token: string | null
  owner: string
  role: (typeof SESSION_ROLES)[keyof typeof SESSION_ROLES]
  expired: boolean
}

interface LifecycleFixture {
  render: (requestId: string) => void
  setSession: (
    changes: Partial<FixtureSession>,
    notification?: "none" | "focus" | "storage",
  ) => void
  labels: ReturnType<typeof packageSaveText>
}

declare global {
  interface Window {
    __packageSaveConsentLifecycleFixture: LifecycleFixture
  }
}

// Synthetic authority for the isolated browser harness, never imported by the app.
const session: FixtureSession = {
  token: "synthetic-session-a",
  owner: "synthetic-owner-a",
  role: SESSION_ROLES.MANAGER,
  expired: false,
}

export function getToken(): string | null {
  return session.token
}

export function getClientId(): string {
  return session.token ? session.owner : ""
}

export function isExpired(): boolean {
  return session.expired || !session.token
}

export function getRole(): FixtureSession["role"] {
  return isExpired() ? SESSION_ROLES.PLAYER : session.role
}

export function ensureSession() {
  const token = getToken()

  if (!token || isExpired()) {
    return Promise.reject(new Error("Synthetic lifecycle session expired"))
  }

  return Promise.resolve({
    token,
    clientId: getClientId(),
    role: getRole(),
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  })
}

const element = document.getElementById("root")

if (!element) {
  throw new Error("Lifecycle fixture root missing")
}

const root = createRoot(element)

function render(requestId: string) {
  flushSync(() => root.render(<PackageSaveConsent requestId={requestId} />))
}

function setSession(
  changes: Partial<FixtureSession>,
  notification: "none" | "focus" | "storage" = "none",
) {
  Object.assign(session, changes)

  // Deliberately do not render: the actual component must observe this change.
  if (notification === "focus") {
    window.dispatchEvent(new Event("focus"))
  } else if (notification === "storage") {
    window.dispatchEvent(new StorageEvent("storage", { key: "token" }))
  }
}

window.__packageSaveConsentLifecycleFixture = {
  render,
  setSession,
  labels: packageSaveText("en"),
}
render("a".repeat(36))
