import { Input } from "@razzia/extensions/platform-ui"
import { SiteLink } from "../shared/SiteLink"
import { useManagerStore } from "@razzia/web/features/game/stores/manager"
import { SiteButton } from "../shared/SiteButton"
import { useEffect, useState, type SubmitEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react"
import { setToken } from "@razzia/web/lib/session"
import { socketClient } from "@razzia/web/features/game/contexts/socket-context"
import { ReferenceCanvas } from "../shared/ReferenceCanvas"
import { accountStyle } from "../../themes/account"
import { safeReturnTo, SiteApiError } from "../../adapters/client"
import { useSiteText } from "../../locales"
import {
  browserConsentLoginHandoff,
  CONSENT_PATH,
} from "../../../components/oauth-consent/login-handoff"

type Step = "login" | "register" | "verify" | "forgot" | "reset"
const routeStep = (): Step => {
  const part = window.location.pathname.split("/").at(-1)

  return (() => {
    if (part === "signup") {
      return "register"
    }

    if (part === "verify" || part === "forgot" || part === "reset") {
      return part
    }

    return "login"
  })()
}
const titles: Record<Step, string> = {
  login: "Welcome back.",
  register: "Create your account.",
  verify: "Check your inbox.",
  forgot: "Reset your password.",
  reset: "Set a new password.",
}
const actions: Record<Step, string> = {
  login: "Log in",
  register: "Create account",
  verify: "Verify email",
  forgot: "Send reset code",
  reset: "Reset password",
}
const descriptions: Record<Step, string> = {
  login: "Sign in to manage your games and prepare your shows.",
  register: "Create a personal workspace for your TADAZZ games.",
  verify:
    "Enter your email, registration password and the six-digit code from your inbox.",
  forgot: "Enter your email to request a password reset code.",
  reset: "Enter your reset code and choose a new password.",
}
const errorCopy: Record<string, string> = {
  "invalid-credentials":
    "That email or password does not match a verified account.",
  "invalid-or-expired-code": "The code is incorrect or has expired.",
  "too-many-requests": "Too many attempts. Please try again later.",
  "accounts-disabled": "Account service is unavailable.",
}

export function AccountGateway() {
  const t = useSiteText()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(routeStep)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [available, setAvailable] = useState<boolean | null>(null)
  const returnTo = safeReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
  )

  useEffect(() => {
    const handoff = browserConsentLoginHandoff()

    if (returnTo !== CONSENT_PATH) {
      handoff.clear()
    }

    const onSessionChange = (event: StorageEvent) => {
      if (
        event.storageArea === window.localStorage &&
        (!event.key || event.key === "token")
      ) {
        handoff.clear()
      }
    }
    window.addEventListener("storage", onSessionChange)
    const controller = new AbortController()
    void fetch("/api/auth/mode", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(
        async (response) =>
          response.ok &&
          ((await response.json()) as { accountsEnabled: boolean })
            .accountsEnabled,
      )
      .then(setAvailable)
      .catch(() => {
        if (!controller.signal.aborted) {
          setAvailable(false)
        }
      })
    const onBack = () => {
      setStep(routeStep())
      setError("")
      setNotice("")
      setPassword("")
      setCode("")
    }
    window.addEventListener("popstate", onBack)

    return () => {
      controller.abort()
      window.removeEventListener("popstate", onBack)
      window.removeEventListener("storage", onSessionChange)
    }
  }, [])

  const switchTo = (next: Step, message = "") => {
    setStep(next)
    setError("")
    setNotice(message)
    setCode("")
    window.history.pushState(
      null,
      "",
      `/${next === "register" ? "signup" : next}?returnTo=${encodeURIComponent(returnTo)}`,
    )
  }
  const request = async (
    action: Step | "resend",
    fields: Record<string, string>,
  ) => {
    const response = await fetch(`/api/accounts/${action}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    })
    const body = (await response.json().catch(() => ({}))) as {
      token?: string
      error?: string
    }

    if (!response.ok) {
      throw new SiteApiError(response.status, body.error ?? "request-failed")
    }

    return body
  }
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (busy || !available) {
      return
    }

    setBusy(true)
    setError("")
    setNotice("")

    try {
      const fields: Record<string, string> = {
        email: email.trim().toLowerCase(),
      }

      if (step !== "forgot") {
        fields.password = password
      }

      if (step === "verify" || step === "reset") {
        fields.code = code
      }

      const result = await request(step, fields)

      if (step === "login") {
        if (!result.token) {
          throw new Error("missing-token")
        }

        await queryClient.cancelQueries()
        queryClient.clear()
        socketClient.disconnect()
        useManagerStore.getState().resetManager()
        setToken(result.token)
        const pending = browserConsentLoginHandoff().resume({
          pathname: returnTo,
          searchStr: "",
        })
        window.location.assign(
          pending ? `${returnTo}?${new URLSearchParams(pending)}` : returnTo,
        )
      } else if (step === "register") {
        switchTo("verify", "Check your email for a six-digit code.")
      } else if (step === "verify") {
        setPassword("")
        switchTo("login", "Email verified. You can now log in.")
      } else if (step === "forgot") {
        switchTo(
          "reset",
          "If your account exists, check your email for a reset code.",
        )
      } else {
        setPassword("")
        switchTo("login", "Password updated. Please log in.")
      }
    } catch (failure) {
      setError(
        errorCopy[failure instanceof Error ? failure.message : ""] ??
          "Your request could not be completed. Please try again.",
      )
    } finally {
      setBusy(false)
    }
  }
  const resend = async () => {
    if (busy || !email.trim() || !available) {
      return
    }

    setBusy(true)
    setError("")

    try {
      await request("resend", { email: email.trim().toLowerCase() })
      setNotice(
        "If your account needs verification, a new code has been requested.",
      )
    } catch {
      setError("Unable to resend right now.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReferenceCanvas variant="marketing">
      <style>{accountStyle}</style>
      <div className="account-page">
        <header className="account-header">
          <SiteLink href="/" aria-label={t("Home")}>
            <img
              src="/tadazz-design-reference/marketing-logo.webp"
              alt="Tadazz"
            />
          </SiteLink>
          <SiteLink className="account-back" href="/">
            <ArrowLeft size={18} />
            {t("Back to website")}
          </SiteLink>
        </header>
        <main className="account-main">
          <section className="account-card">
            <span className="account-kicker">{t("Your TADAZZ Studio")}</span>
            <h1>{t(titles[step])}</h1>
            <p className="account-lead">{t(descriptions[step])}</p>
            <form
              className="account-fields"
              onSubmit={(event) => void submit(event)}
            >
              <Input
                label={t("Email address")}
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
              {step !== "forgot" && (
                <Input
                  label={t(step === "reset" ? "New password" : "Password")}
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete={
                    step === "login" || step === "verify"
                      ? "current-password"
                      : "new-password"
                  }
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
              {(step === "verify" || step === "reset") && (
                <Input
                  label={t("Six-digit code")}
                  required
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  value={code}
                  disabled={busy}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))
                  }
                />
              )}
              {error && (
                <p className="account-error" role="alert">
                  {t(error)}
                </p>
              )}
              {notice && (
                <p className="account-notice" role="status">
                  {t(notice)}
                </p>
              )}
              {available === false && (
                <p className="account-error" role="alert">
                  {t("Account service is unavailable.")}
                </p>
              )}
              <SiteButton
                type="submit"
                variant="primary"
                className="account-submit"
                disabled={busy || available !== true}
              >
                {t(busy ? "Please wait…" : actions[step])}
                <ArrowRight size={16} />
              </SiteButton>
            </form>
            <div className="account-links">
              {step === "login" ? (
                <>
                  <SiteButton
                    disabled={busy}
                    variant="ghost"
                    className="account-link"
                    onClick={() => switchTo("register")}
                  >
                    {t("Create account")}
                  </SiteButton>
                  <SiteButton
                    disabled={busy}
                    variant="ghost"
                    className="account-link"
                    onClick={() => switchTo("forgot")}
                  >
                    {t("Forgot password?")}
                  </SiteButton>
                  <SiteButton
                    disabled={busy}
                    variant="ghost"
                    className="account-link"
                    onClick={() => switchTo("verify")}
                  >
                    {t("Verify email")}
                  </SiteButton>
                </>
              ) : (
                <>
                  <SiteButton
                    disabled={busy}
                    variant="ghost"
                    className="account-link"
                    onClick={() => switchTo("login")}
                  >
                    {t("Back to login")}
                  </SiteButton>
                  {step === "verify" && (
                    <SiteButton
                      disabled={busy || !email.trim()}
                      variant="ghost"
                      className="account-link"
                      onClick={() => void resend()}
                    >
                      {t("Resend code")}
                    </SiteButton>
                  )}
                </>
              )}
            </div>
            <p className="account-private">
              <ShieldCheck size={14} />
              {t("One account for your games and live shows.")}
            </p>
          </section>
        </main>
      </div>
    </ReferenceCanvas>
  )
}
