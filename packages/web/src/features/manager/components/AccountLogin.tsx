import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Input from "@razzia/web/components/Input"
import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"

type Step = "login" | "register" | "verify" | "forgot" | "reset"
type AuthSession = { token: string }

interface Props {
  onAuthenticated: (token: string) => void
}

async function requestAccount(
  action: string,
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/accounts/${action}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
  })
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok)
    throw new Error(String(body.error ?? "Unable to complete request"))
  return body
}

export default function AccountLogin({ onAuthenticated }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<Step>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")

  const label = (key: string, fallback: string) =>
    t(`extensions:accounts.${key}`, fallback)
  const changeStep = (next: Step) => {
    setStep(next)
    setError("")
    setNotice("")
    setCode("")
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const fields = { email: email.trim().toLowerCase(), password }
      if (step === "login") {
        const session = (await requestAccount(
          "login",
          fields,
        )) as unknown as AuthSession
        onAuthenticated(session.token)
      } else if (step === "register") {
        await requestAccount("register", fields)
        setStep("verify")
        setNotice(
          label(
            "checkEmail",
            "Check your email for the six-digit verification code.",
          ),
        )
      } else if (step === "verify") {
        await requestAccount("verify", { email, code, password })
        setPassword("")
        changeStep("login")
        setNotice(label("verified", "Email verified. You can now sign in."))
      } else if (step === "forgot") {
        await requestAccount("forgot", { email })
        setStep("reset")
        setNotice(
          label(
            "checkEmail",
            "Check your email for the six-digit verification code.",
          ),
        )
      } else if (step === "reset") {
        await requestAccount("reset", { email, code, password })
        setPassword("")
        changeStep("login")
        setNotice(
          label(
            "resetSuccess",
            "Your password has been changed. Please sign in.",
          ),
        )
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : label("failed", "Request failed. Please try again."),
      )
    } finally {
      setBusy(false)
    }
  }

  const heading: Record<Step, string> = {
    login: label("login", "Log in"),
    register: label("register", "Create an account"),
    verify: label("verify", "Verify your email"),
    forgot: label("forgot", "Forgot password"),
    reset: label("reset", "Reset password"),
  }
  return (
    <Card>
      <div
        className="w-full max-w-md space-y-4"
        data-testid="tadazz-account-auth"
      >
        <h1 className="text-foreground text-center text-2xl font-bold">
          {heading[step]}
        </h1>
        <form onSubmit={submit} className="space-y-3">
          <label className="text-foreground block text-sm font-medium">
            {label("email", "Email")}
            <Input
              type="email"
              autoComplete="email"
              name="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full"
            />
          </label>
          {(step === "login" ||
            step === "register" ||
            step === "reset" ||
            step === "verify") && (
            <label className="text-foreground block text-sm font-medium">
              {step === "reset"
                ? label("newPassword", "New password")
                : label("password", "Password")}
              <Input
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={
                  step === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          )}
          {(step === "verify" || step === "reset") && (
            <label className="text-foreground block text-sm font-medium">
              {label("code", "Six-digit code")}
              <Input
                type="text"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/gu, "").slice(0, 6))
                }
                className="mt-1 w-full"
              />
            </label>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-foreground text-sm">
              {notice}
            </p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? label("working", "Working...") : heading[step]}
          </Button>
        </form>
        <div className="flex flex-wrap justify-center gap-4 text-sm">
          {step !== "login" && (
            <button
              type="button"
              className="text-primary underline"
              onClick={() => changeStep("login")}
            >
              {label("backToLogin", "Back to login")}
            </button>
          )}
          {step === "login" && (
            <>
              <button
                type="button"
                className="text-primary underline"
                onClick={() => changeStep("register")}
              >
                {label("register", "Create an account")}
              </button>
              <button
                type="button"
                className="text-primary underline"
                onClick={() => changeStep("forgot")}
              >
                {label("forgot", "Forgot password?")}
              </button>
            </>
          )}
          {step === "verify" && (
            <button
              type="button"
              className="text-primary underline"
              disabled={busy}
              onClick={async () => {
                try {
                  await requestAccount("resend", { email })
                  setNotice(label("checkEmail", "Check your email."))
                } catch {
                  setError(label("failed", "Unable to resend code"))
                }
              }}
            >
              {label("resend", "Resend code")}
            </button>
          )}
        </div>
      </div>
    </Card>
  )
}
