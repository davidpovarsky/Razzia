import { SESSION_ROLES } from "@razzia/common/constants"
import { clearToken, getRole, getToken } from "@razzia/web/lib/session"
import { redirect } from "@tanstack/react-router"

export async function managerAuthBeforeLoad() {
  if (getRole() !== SESSION_ROLES.MANAGER) {
    return
  }

  const token = getToken()

  if (!token) {
    return
  }

  let isManager = false

  try {
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      cache: "no-store",
    })

    if (!response.ok) {
      return
    }

    const session = (await response.json()) as { role?: string }
    isManager = session.role === SESSION_ROLES.MANAGER

    if (!isManager) {
      clearToken()
    }
  } catch {
    return
  }

  if (isManager) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router requires its redirect response to be thrown.
    throw redirect({ to: "/manager/config", replace: true })
  }
}
