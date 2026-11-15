import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  getClientId,
  getRole,
  getToken,
  isExpired,
} from "@razzia/web/lib/session"
import { SESSION_ROLES } from "@razzia/common/constants"
import { Button, Card, PlatformScope } from "../../platform-ui"
import { currentAccount, type Account } from "../../site/adapters/client"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { createOAuthConsentClient, type ConsentInspection } from "./client"
import { consentText } from "./strings"
import { browserConsentLoginHandoff } from "./login-handoff"

/** Studio mounts this only after its actual authenticated native profile query.
 * The issuer path is trusted build configuration, never a request query parameter.
 */
export function OAuthConsentPage({
  account,
  issuerBasePath,
  search,
}: {
  account: Account
  issuerBasePath: string
  search: string
}) {
  const { i18n } = useTranslation()
  const language = i18n.language.split("-")[0] ?? "en"
  const locale: PreviewLocale = [
    "en",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ].includes(language)
    ? (language as PreviewLocale)
    : "en"
  const text = useMemo(() => consentText(locale), [locale])
  const client = useMemo(() => {
    try {
      return createOAuthConsentClient({
        issuerBasePath,
        getNativeToken: getToken,
      })
    } catch {
      return null
    }
  }, [issuerBasePath])
  const ticket = useMemo(() => {
    const values = new URLSearchParams(search).getAll("oauth_request")
    return values.length === 1 &&
      values[0]!.length >= 40 &&
      values[0]!.length <= 8192
      ? values[0]!
      : null
  }, [search])
  const [inspection, setInspection] = useState<ConsentInspection | null>(null)
  const [state, setState] = useState<
    | "loading"
    | "ready"
    | "pending"
    | "failed"
    | "expired"
    | "canceled"
    | "unavailable"
  >("loading")
  const proof = useRef<{
    token: string
    accountId: string
    email: string
    ticket: string
    inspection: ConsentInspection
  } | null>(null)
  const approval = useRef<AbortController | null>(null)
  const inspectionRequest = useRef<AbortController | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    inspectionRequest.current = abort
    proof.current = null
    setInspection(null)
    setState("loading")
    client?.invalidate()
    const token = getToken()
    const validSession = () =>
      Boolean(
        token &&
        getToken() === token &&
        !isExpired(0) &&
        getRole() === SESSION_ROLES.MANAGER &&
        getClientId() === account.id,
      )
    const invalidate = () => {
      browserConsentLoginHandoff().clear()
      client?.invalidate()
      proof.current = null
      setInspection(null)
      setState("expired")
      abort.abort()
      approval.current?.abort()
      approval.current = null
      inspectionRequest.current = null
    }
    if (!validSession()) {
      browserConsentLoginHandoff().clear()
      setState("expired")
      return () => abort.abort()
    }
    // Studio has already resolved the real native profile. URL ownership is now
    // established; StrictMode may remount without consuming the request twice.
    if (ticket && window.top === window.self)
      browserConsentLoginHandoff().acknowledge(ticket)
    if (!client || !ticket || window.top !== window.self) {
      setState("unavailable")
      return () => abort.abort()
    }
    // A meta frame-ancestors policy is ineffective. Require the actual mounted
    // HTML/HEAD response policy supplied by the root host before inspecting.
    void (async () => {
      const headers = await fetch("/studio/oauth-consent", {
        method: "HEAD",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: abort.signal,
      })
      if (
        !headers.ok ||
        headers.headers.get("referrer-policy")?.trim() !== "no-referrer" ||
        !/(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/iu.test(
          headers.headers.get("content-security-policy") ?? "",
        )
      )
        throw new Error("oauth-consent:page-policy-unavailable")
      const live = await currentAccount(abort.signal)
      if (
        !validSession() ||
        live.id !== account.id ||
        live.email !== account.email
      )
        throw new Error("oauth-consent:session-changed")
      const inspected = await client.inspect(ticket, abort.signal)
      if (abort.signal.aborted || !validSession()) return
      proof.current = {
        token: token!,
        accountId: live.id,
        email: live.email,
        ticket,
        inspection: inspected,
      }
      setInspection(inspected)
      if (inspectionRequest.current === abort) inspectionRequest.current = null
      setState("ready")
    })().catch(() => {
      if (!abort.signal.aborted) {
        proof.current = null
        setInspection(null)
        setState("failed")
      }
    })
    const check = () => {
      if (
        !validSession() ||
        (proof.current && proof.current.inspection.expiresAt <= Date.now())
      )
        invalidate()
    }
    const interval = window.setInterval(check, 1000)
    window.addEventListener("storage", check)
    window.addEventListener("focus", check)
    return () => {
      abort.abort()
      approval.current?.abort()
      approval.current = null
      if (inspectionRequest.current === abort) inspectionRequest.current = null
      client.invalidate()
      proof.current = null
      clearInterval(interval)
      window.removeEventListener("storage", check)
      window.removeEventListener("focus", check)
    }
  }, [account.id, account.email, client, ticket])
  const allow = async () => {
    if (approval.current) return
    const bound = proof.current
    if (
      state !== "ready" ||
      !client ||
      !ticket ||
      !bound ||
      bound.token !== getToken() ||
      bound.ticket !== ticket ||
      bound.accountId !== account.id ||
      bound.email !== account.email ||
      isExpired(0) ||
      getClientId() !== account.id ||
      bound.inspection.expiresAt <= Date.now()
    ) {
      client?.invalidate()
      proof.current = null
      setInspection(null)
      setState("expired")
      return
    }
    const abort = new AbortController()
    approval.current = abort
    setState("pending")
    try {
      const live = await currentAccount(abort.signal)
      if (
        live.id !== bound.accountId ||
        live.email !== bound.email ||
        getToken() !== bound.token
      )
        throw new Error("oauth-consent:session-changed")
      if (approval.current !== abort || abort.signal.aborted) return
      const redirectUrl = await client.approve(
        ticket,
        bound.inspection,
        abort.signal,
      )
      if (approval.current !== abort || abort.signal.aborted) return
      proof.current = null
      // Exact trusted issuer response; no client-supplied callback reconstruction.
      window.location.assign(redirectUrl)
    } catch {
      if (approval.current === abort && !abort.signal.aborted) {
        client.invalidate()
        proof.current = null
        approval.current = null
        setInspection(null)
        setState("failed")
      }
    }
  }
  const cancel = () => {
    browserConsentLoginHandoff().clear()
    inspectionRequest.current?.abort()
    inspectionRequest.current = null
    client?.invalidate()
    proof.current = null
    setInspection(null)
    setState("canceled")
    window.history.replaceState(
      window.history.state,
      "",
      "/studio/oauth-consent",
    )
  }
  return (
    <PlatformScope context="platform.studio">
      <main style={{ maxWidth: 640, margin: "40px auto", padding: 16 }}>
        <Card>
          <div style={{ display: "grid", gap: 16, padding: 24 }}>
            <h1>{text("title")}</h1>
            <p>{text("notice")}</p>
            <dl>
              <dt>{text("account")}</dt>
              <dd data-testid="oauth-native-account">
                {account.email}
                <br />
                <small>{account.id}</small>
              </dd>
            </dl>
            {inspection && (
              <>
                <dl>
                  <dt>{text("client")}</dt>
                  <dd
                    data-testid="oauth-client-id"
                    style={{ overflowWrap: "anywhere" }}
                  >
                    {inspection.clientId}
                  </dd>
                </dl>
                <section aria-label={text("scopes")}>
                  <h2>{text("scopes")}</h2>
                  <ul>
                    {inspection.scopes.map((scope) => (
                      <li key={scope} style={{ overflowWrap: "anywhere" }}>
                        {scope}
                      </li>
                    ))}
                  </ul>
                </section>
                <p>
                  {text("expires")}:{" "}
                  <time dateTime={new Date(inspection.expiresAt).toISOString()}>
                    {new Date(inspection.expiresAt).toLocaleString(locale)}
                  </time>
                </p>
              </>
            )}
            {state !== "ready" && state !== "pending" && (
              <p role={state === "loading" ? "status" : "alert"}>
                {text(state)}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                disabled={state !== "ready"}
                loading={state === "pending"}
                onClick={(event) => {
                  if (event.isTrusted) void allow()
                }}
              >
                {text("allow")}
              </Button>
              <Button
                disabled={state === "pending" || state === "canceled"}
                onClick={cancel}
              >
                {text("cancel")}
              </Button>
            </div>
            <a href="/studio" referrerPolicy="no-referrer">
              {text("back")}
            </a>
          </div>
        </Card>
      </main>
    </PlatformScope>
  )
}
