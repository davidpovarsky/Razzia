import Card from "@razzia/web/components/Card"
import AccountLogin from "@razzia/web/features/manager/components/AccountLogin"
import ManagerPassword from "@razzia/web/features/manager/components/ManagerPassword"
import { managerLogin } from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { setToken } from "@razzia/web/lib/session"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

type AuthMode = "loading" | "accounts" | "legacy" | "error"

export const ManagerAuthPage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const [mode, setMode] = useState<AuthMode>("loading")

  useEffect(() => {
    let alive = true
    fetch("/api/auth/mode", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Could not determine login mode")
        }

        const config = (await response.json()) as { accountsEnabled?: boolean }

        if (alive) {
          setMode(config.accountsEnabled ? "accounts" : "legacy")
        }
      })
      .catch(() => {
        if (alive) {
          setMode("error")
        }
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

  if (mode === "loading") {
    return (
      <Card className="max-w-md p-6 shadow-xl sm:p-8">
        <p role="status" className="text-foreground text-center">
          {t("common:loading", "Loading...")}
        </p>
      </Card>
    )
  }

  if (mode === "error") {
    return (
      <Card className="max-w-md p-6 shadow-xl sm:p-8">
        <p role="alert" className="text-center text-red-500">
          {t(
            "errors:auth.sessionFailed",
            "Unable to load authentication. Please retry.",
          )}
        </p>
      </Card>
    )
  }

  return mode === "accounts" ? (
    <AccountLogin onAuthenticated={onAuthenticated} />
  ) : (
    <ManagerPassword onSubmit={mutate} disabled={isPending} />
  )
}
