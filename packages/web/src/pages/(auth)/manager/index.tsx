import { SESSION_ROLES } from "@razzia/common/constants"
import AccountLogin from "@razzia/web/features/manager/components/AccountLogin"
import ManagerPassword from "@razzia/web/features/manager/components/ManagerPassword"
import { managerLogin } from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import {
  clearToken,
  getRole,
  getToken,
  setToken,
} from "@razzia/web/lib/session"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type AuthMode = "loading" | "accounts" | "legacy" | "error"

const ManagerAuthPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>("loading")

  useEffect(() => {
    let alive = true
    fetch("/api/auth/mode", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not determine login mode")
        const config = (await response.json()) as { accountsEnabled?: boolean }
        if (alive) setMode(config.accountsEnabled ? "accounts" : "legacy")
      })
      .catch(() => {
        if (alive) setMode("error")
      })
    return () => {
      alive = false
    }
  }, [])

  const onAuthenticated = (token: string) => {
    queryClient.clear()
    setToken(token)
    void navigate({ to: "/manager/config" })
  }

  const { mutate, isPending } = useMutation({
    mutationFn: managerLogin,
    onSuccess: (session) => onAuthenticated(session.token),
    onError: (error) => {
      toast.error(
        t(error instanceof ApiError ? error.key : "errors:route.description"),
      )
    },
  })

  if (mode === "loading")
    return (
      <p role="status" className="text-foreground p-6">
        {t("common:loading", "Loading...")}
      </p>
    )
  if (mode === "error")
    return (
      <p role="alert" className="p-6 text-red-500">
        {t(
          "errors:auth.sessionFailed",
          "Unable to load authentication. Please retry.",
        )}
      </p>
    )
  return mode === "accounts" ? (
    <AccountLogin onAuthenticated={onAuthenticated} />
  ) : (
    <ManagerPassword onSubmit={mutate} disabled={isPending} />
  )
}

export const Route = createFileRoute("/(auth)/manager/")({
  beforeLoad: async () => {
    if (getRole() !== SESSION_ROLES.MANAGER) return
    const token = getToken()
    if (!token) return
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      })
      if (!response.ok) return
      const session = (await response.json()) as { role?: string }
      if (session.role === SESSION_ROLES.MANAGER)
        throw redirect({ to: "/manager/config" })
      clearToken()
    } catch (error) {
      if (error && typeof error === "object" && "to" in error) throw error
    }
  },
  component: ManagerAuthPage,
})
