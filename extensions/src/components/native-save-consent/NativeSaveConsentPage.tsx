import "./csp-admission"
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
import {
  createNativeSaveConsentClient,
  nativeSaveRequestIdFromPath,
  type NativeSaveInspection,
} from "./client"
import { nativeSaveConsentText } from "./strings"

type State =
  | "loading"
  | "ready"
  | "approving"
  | "failed"
  | "expired"
  | "canceled"
  | "unavailable"
  | "approved"
  | "publishing"
  | "saved"

/** A separate first-party exact-revision review. Studio supplies its real native
 * profile; the opaque pathname is not authority. This component never saves.
 */
export function NativeSaveConsentPage({
  account,
  issuerBasePath,
  pathname,
  search,
  hash,
}: {
  account: Account
  issuerBasePath: string
  pathname: string
  search: string
  hash: string
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
  const text = useMemo(() => nativeSaveConsentText(locale), [locale])
  const requestId = useMemo(
    () => nativeSaveRequestIdFromPath(pathname, search, hash),
    [pathname, search, hash],
  )
  const client = useMemo(() => {
    try {
      return createNativeSaveConsentClient({
        issuerBasePath,
        accountId: account.id,
        getNativeToken: getToken,
      })
    } catch {
      return null
    }
  }, [account.id, issuerBasePath])
  const [inspection, setInspection] = useState<NativeSaveInspection | null>(
    null,
  )
  const [state, setState] = useState<State>("loading")
  const proof = useRef<{
    token: string
    accountId: string
    email: string
    requestId: string
    inspection: NativeSaveInspection
  } | null>(null)
  const snapshot = useRef<NativeSaveInspection | null>(null)
  const inspectionRequest = useRef<AbortController | null>(null)
  const approval = useRef<AbortController | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    inspectionRequest.current = abort
    proof.current = null
    snapshot.current = null
    setInspection(null)
    setState("loading")
    client?.invalidate()
    const token = getToken()
    const validSession = () =>
      Boolean(
        account.verified &&
        token &&
        getToken() === token &&
        !isExpired(0) &&
        getRole() === SESSION_ROLES.MANAGER &&
        getClientId() === account.id,
      )
    const invalidate = () => {
      client?.invalidate()
      proof.current = null
      snapshot.current = null
      setInspection(null)
      setState("expired")
      abort.abort()
      approval.current?.abort()
      approval.current = null
      if (inspectionRequest.current === abort) inspectionRequest.current = null
    }
    if (!client || !requestId || window.top !== window.self) {
      setState("unavailable")
      return () => abort.abort()
    }
    if (!validSession()) {
      setState("expired")
      return () => abort.abort()
    }
    void (async () => {
      const policy = await fetch(pathname, {
        method: "HEAD",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: abort.signal,
      })
      if (
        !policy.ok ||
        policy.headers.get("referrer-policy")?.trim() !== "no-referrer" ||
        !/(?:^|,)\s*no-store\s*(?:,|$)/iu.test(
          policy.headers.get("cache-control") ?? "",
        ) ||
        !/(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/iu.test(
          policy.headers.get("content-security-policy") ?? "",
        )
      )
        throw new Error("native-save-consent:page-policy-unavailable")
      const live = await currentAccount(abort.signal)
      if (
        !validSession() ||
        !live.verified ||
        live.id !== account.id ||
        live.email !== account.email
      )
        throw new Error("native-save-consent:session-changed")
      const inspected = await client.inspect(requestId, abort.signal)
      if (abort.signal.aborted) return
      if (!validSession()) {
        invalidate()
        return
      }
      snapshot.current = inspected
      setInspection(inspected)
      if (inspected.state === "pending") {
        proof.current = {
          token: token!,
          accountId: live.id,
          email: live.email,
          requestId,
          inspection: inspected,
        }
        setState("ready")
      } else setState(inspected.state)
      if (inspectionRequest.current === abort) inspectionRequest.current = null
    })().catch(() => {
      if (!abort.signal.aborted) {
        proof.current = null
        snapshot.current = null
        setInspection(null)
        setState("failed")
      }
    })
    const check = () => {
      if (abort.signal.aborted) return
      const value = snapshot.current
      if (
        !validSession() ||
        (value &&
          (value.state === "pending" || value.state === "approved") &&
          value.expiresAt <= Date.now())
      )
        invalidate()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "token" || event.key === null) invalidate()
      else check()
    }
    const interval = window.setInterval(check, 1000)
    window.addEventListener("storage", onStorage)
    window.addEventListener("focus", check)
    return () => {
      abort.abort()
      approval.current?.abort()
      approval.current = null
      if (inspectionRequest.current === abort) inspectionRequest.current = null
      client.invalidate()
      proof.current = null
      snapshot.current = null
      clearInterval(interval)
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("focus", check)
    }
  }, [account.id, account.email, account.verified, client, requestId, pathname])

  const allow = async () => {
    if (approval.current) return
    const bound = proof.current
    const valid = () =>
      Boolean(
        account.verified &&
        bound &&
        getToken() === bound.token &&
        !isExpired(0) &&
        getRole() === SESSION_ROLES.MANAGER &&
        getClientId() === bound.accountId &&
        bound.accountId === account.id &&
        bound.email === account.email &&
        bound.requestId === requestId &&
        bound.inspection.expiresAt > Date.now(),
      )
    if (state !== "ready" || !client || !requestId || !bound || !valid()) {
      client?.invalidate()
      proof.current = null
      snapshot.current = null
      setInspection(null)
      setState("expired")
      return
    }
    const abort = new AbortController()
    approval.current = abort
    setState("approving")
    try {
      const live = await currentAccount(abort.signal)
      if (
        !valid() ||
        !live.verified ||
        live.id !== bound.accountId ||
        live.email !== bound.email
      )
        throw new Error("native-save-consent:session-changed")
      await client.approve(requestId, bound.inspection, abort.signal)
      if (abort.signal.aborted || !valid()) return
      proof.current = null
      setState("approved")
    } catch {
      if (!abort.signal.aborted && approval.current === abort) {
        client.invalidate()
        proof.current = null
        if (!valid()) {
          snapshot.current = null
          setInspection(null)
          setState("expired")
        } else setState("failed")
      }
    } finally {
      if (approval.current === abort) approval.current = null
    }
  }
  const cancel = () => {
    inspectionRequest.current?.abort()
    inspectionRequest.current = null
    client?.invalidate()
    proof.current = null
    snapshot.current = null
    setInspection(null)
    setState("canceled")
  }
  const processed =
    state === "approved" || state === "publishing" || state === "saved"
  return (
    <PlatformScope context="platform.studio">
      <main style={{ maxWidth: 960, margin: "40px auto", padding: 16 }}>
        <Card>
          <div style={{ display: "grid", gap: 16, padding: 24, minWidth: 0 }}>
            <h1>{text("title")}</h1>
            <p>{text("notice")}</p>
            <dl style={{ overflowWrap: "anywhere" }}>
              <dt>{text("account")}</dt>
              <dd data-testid="native-save-account">
                {account.email}
                <br />
                <small>{account.id}</small>
              </dd>
              {inspection && (
                <>
                  <dt>{text("client")}</dt>
                  <dd data-testid="native-save-client">
                    {inspection.clientId}
                  </dd>
                  <dt>{text("draft")}</dt>
                  <dd>{inspection.draftId}</dd>
                  <dt>{text("revision")}</dt>
                  <dd data-testid="native-save-revision">
                    {inspection.revision}
                  </dd>
                  <dt>{text("digest")}</dt>
                  <dd data-testid="native-save-digest">
                    {inspection.authoredDigest}
                  </dd>
                  <dt>{text("expires")}</dt>
                  <dd>
                    <time
                      dateTime={new Date(inspection.expiresAt).toISOString()}
                    >
                      {new Date(inspection.expiresAt).toLocaleString(locale)}
                    </time>
                  </dd>
                  <dt>{text("status")}</dt>
                  <dd>{text(processed ? state : inspection.state)}</dd>
                </>
              )}
            </dl>
            {inspection && (
              <>
                <section aria-labelledby="native-save-summary-heading">
                  <h2 id="native-save-summary-heading">{text("summary")}</h2>
                  <pre
                    data-testid="native-save-summary"
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(inspection.summary, null, 2)}
                  </pre>
                </section>
                <section aria-labelledby="native-save-snapshot-heading">
                  <h2 id="native-save-snapshot-heading">{text("snapshot")}</h2>
                  <pre
                    data-testid="native-save-snapshot"
                    tabIndex={0}
                    style={{
                      maxHeight: 360,
                      overflow: "auto",
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {inspection.authoredShowJson}
                  </pre>
                </section>
              </>
            )}
            {state !== "ready" && (
              <p
                role={
                  state === "failed" ||
                  state === "expired" ||
                  state === "unavailable"
                    ? "alert"
                    : "status"
                }
              >
                {text(state)}
              </p>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Button
                variant="primary"
                disabled={state !== "ready"}
                loading={state === "approving"}
                onClick={(event) => {
                  if (event.isTrusted) void allow()
                }}
              >
                {text("allow")}
              </Button>
              <Button
                disabled={
                  state === "approving" || state === "canceled" || processed
                }
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
