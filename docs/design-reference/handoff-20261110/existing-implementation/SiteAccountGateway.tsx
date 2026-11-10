import { useEffect, useState, type SubmitEvent } from "react"
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react"
import { setToken } from "@razzia/web/lib/session"
import { ReferenceCanvas } from "./ReferenceCanvas"

type AccountStep = "login" | "register" | "verify" | "forgot" | "reset"
interface SessionReply {
  token?: string
  error?: string
}

const titles: Record<AccountStep, string> = {
  login: "Welcome back.",
  register: "Create your account.",
  verify: "Check your inbox.",
  forgot: "Reset your password.",
  reset: "Set a new password.",
}

const actions: Record<AccountStep, string> = {
  login: "Log in",
  register: "Create account",
  verify: "Verify email",
  forgot: "Send reset code",
  reset: "Reset password",
}

const noticeFor = (message: string) => {
  const map: Record<string, string> = {
    "invalid-credentials": "That email or password doesn't match.",
    "invalid-or-expired-code":
      "The verification code is incorrect or has expired.",
    "too-many-requests": "Too many attempts. Please try again later.",
    "accounts-disabled": "Account sign-in is unavailable right now.",
  }

  return map[message] ?? "Your request couldn't be completed. Please try again."
}

async function accountRequest(
  step: AccountStep,
  fields: Record<string, string>,
) {
  const result = await fetch(`/api/accounts/${step}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fields),
    credentials: "same-origin",
    cache: "no-store",
  })

  const body = (await result.json().catch(() => ({}))) as SessionReply

  if (!result.ok) {
    throw new Error(body.error ?? "request-failed")
  }

  return body
}

const accountStyle = `
:host{display:block;background:#10091e;color:#fff;font-family:inherit;min-height:100vh}
.account-page{min-height:100vh;display:flex;flex-direction:column}
.account-header{display:flex;align-items:center;justify-content:space-between;max-width:1240px;width:100%;margin:0 auto;padding:20px 26px;box-sizing:border-box}
.account-header img{width:152px;max-width:40vw;display:block}
.account-back{color:#ddd2ee;text-decoration:none;display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600}
.account-back:hover{color:#e7ff37}
.account-main{padding:30px 22px 72px;flex:1;display:grid;place-items:center}
.account-card{width:100%;max-width:520px;box-sizing:border-box;border:1px solid rgba(181,127,242,.34);border-radius:28px;padding:clamp(24px,5vw,46px);background:radial-gradient(circle at top right,#381b65 0,#211038 43%,#1a102d 100%);box-shadow:0 24px 70px rgba(0,0,0,.32)}
.account-kicker{color:#e7ff37;text-transform:uppercase;font-weight:800;letter-spacing:.1em;font-size:11px}
.account-card h1{font-size:clamp(32px,5vw,50px);font-weight:900;letter-spacing:-.05em;line-height:1.1;margin:14px 0}
.account-lead{font-size:15px;color:#cfc1db;line-height:1.6;margin:0 0 26px}
.account-fields{display:grid;gap:18px}
.account-fields label{display:grid;gap:8px;font-size:13px;font-weight:750;color:#f7ecff}
.account-fields input{border:1px solid #58456e;background:#120a24;border-radius:12px;color:#fff;font:inherit;padding:15px 16px;outline:none;width:100%;box-sizing:border-box}
.account-fields input:focus-visible{border-color:#d6ff26;box-shadow:0 0 0 2px rgba(231,255,55,.2)}
.account-button{font:inherit;font-weight:850;border:0;border-radius:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:9px;padding:15px 19px}
.account-button.primary{background:#e7ff37;color:#180d28}
.account-button.secondary{background:none;color:#e7ff37;padding:7px 0}
.account-button[disabled]{opacity:.6;cursor:wait}
.account-links{display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px 20px;margin-top:22px}
.account-error{color:#ffc5d5;font-size:13px;background:rgba(194,26,75,.2);padding:12px;border-radius:10px}
.account-notice{color:#e7ff37;font-size:13px;padding:11px 0}
.account-private{border-top:1px solid #493259;padding-top:18px;margin-top:24px;font-size:12px;color:#ab9abf}
.account-private svg{display:inline;vertical-align:-2px;margin-right:6px}
@media(max-width:480px){.account-header{padding:18px 20px}.account-header img{width:126px}.account-card{border-radius:20px;padding:26px 22px}.account-main{padding:12px 15px 48px}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important}}
`

export function SiteAccountGateway({
  initialStep = "login",
}: {
  initialStep?: AccountStep
}) {
  const [step, setStep] = useState<AccountStep>(initialStep)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [connected, setConnected] = useState<boolean | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/auth/mode", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as { accountsEnabled: boolean })
          : { accountsEnabled: false },
      )
      .then((v) => setConnected(v.accountsEnabled))
      .catch(() => {
        if (!controller.signal.aborted) {
          setConnected(false)
        }
      })

    return () => controller.abort()
  }, [])

  const switchTo = (next: AccountStep) => {
    setStep(next)
    setError("")
    setNotice("")
    setCode("")
    window.history.replaceState(
      null,
      "",
      next === "register" ? "/site/signup" : "/site/login",
    )
  }

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (busy || !connected) {
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

      const result = await accountRequest(step, fields)

      if (step === "login") {
        if (!result.token) {
          throw new Error("missing-token")
        }

        setToken(result.token)
        window.location.assign("/site/studio")
      } else if (step === "register") {
        setStep("verify")
        setNotice("We've sent a six-digit code to your email.")
      } else if (step === "verify") {
        setPassword("")
        setStep("login")
        setNotice("Email verified! You can now log in.")
      } else if (step === "forgot") {
        setStep("reset")
        setNotice("If your account exists, check your email for a reset code.")
      } else {
        setPassword("")
        setStep("login")
        setNotice("Password updated. Please log in.")
      }
    } catch (e) {
      setError(noticeFor(e instanceof Error ? e.message : "request-failed"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ReferenceCanvas variant="marketing">
      <style>{accountStyle}</style>
      <div className="account-page">
        <header className="account-header">
          <a href="/site" aria-label="TADAZZ home">
            <img
              src="/tadazz-design-reference/marketing-logo.webp"
              alt="TADAZZ!"
            />
          </a>
          <a className="account-back" href="/site">
            <ArrowLeft size={18} /> Back to website
          </a>
        </header>
        <main className="account-main">
          <section className="account-card">
            <span className="account-kicker">Your TADAZZ Studio</span>
            <h1>{titles[step]}</h1>
            <p className="account-lead">
              {step === "login" &&
                "Sign in to manage your games, prepare your shows and pick up where you left off."}
              {step === "register" &&
                "Create a personal workspace to manage your TADAZZ games."}
              {step === "verify" &&
                "Enter the six-digit code we emailed you. Keep your password in place for verification."}
              {step === "forgot" &&
                "Enter your account email and we'll help you reset your password."}
              {step === "reset" &&
                "Enter your reset code and choose a new password."}
            </p>
            <form className="account-fields" onSubmit={(e) => void submit(e)}>
              <label>
                <span>
                  <Mail size={14} /> Email address
                </span>
                <input
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {step !== "forgot" && (
                <label>
                  <span>
                    <LockKeyhole size={14} />{" "}
                    {step === "reset" ? "New password" : "Password"}
                  </span>
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={128}
                    autoComplete={
                      step === "login" ? "current-password" : "new-password"
                    }
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              )}
              {(step === "verify" || step === "reset") && (
                <label>
                  <span>Six-digit code</span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                    required
                    value={code}
                    maxLength={6}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/gu, "").slice(0, 6))
                    }
                  />
                </label>
              )}
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              {notice && (
                <p className="account-notice" role="status">
                  {notice}
                </p>
              )}
              {connected === false && (
                <p className="account-error" role="alert">
                  Account service is unavailable in this preview. Please use the
                  main TADAZZ site.
                </p>
              )}
              <button
                type="submit"
                className="account-button primary"
                disabled={busy || connected !== true}
              >
                {busy ? "Please wait…" : actions[step]} <ArrowRight size={16} />
              </button>
            </form>
            <div className="account-links">
              {step === "login" ? (
                <>
                  <button
                    className="account-button secondary"
                    type="button"
                    onClick={() => switchTo("register")}
                  >
                    Create an account
                  </button>
                  <button
                    className="account-button secondary"
                    type="button"
                    onClick={() => switchTo("forgot")}
                  >
                    Forgot password?
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="account-button secondary"
                    type="button"
                    onClick={() => switchTo("login")}
                  >
                    Back to login
                  </button>
                  {step === "verify" && (
                    <button
                      className="account-button secondary"
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const r = await fetch("/api/accounts/resend", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              email: email.trim().toLowerCase(),
                            }),
                            cache: "no-store",
                          })
                          setNotice(
                            r.ok
                              ? "A fresh code has been requested."
                              : "Unable to resend right now.",
                          )
                        } catch {
                          setNotice("Unable to resend right now.")
                        }
                      }}
                    >
                      Resend code
                    </button>
                  )}
                </>
              )}
            </div>
            <p className="account-private">
              <ShieldCheck size={14} /> Real TADAZZ accounts. The design-preview
              Studio only reads your game list; editing opens the existing
              TADAZZ editor.
            </p>
          </section>
        </main>
      </div>
    </ReferenceCanvas>
  )
}
