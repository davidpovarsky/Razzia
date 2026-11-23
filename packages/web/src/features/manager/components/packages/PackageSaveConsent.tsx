import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { SESSION_ROLES } from "@razzia/common/constants"
import {
  Badge,
  Button,
  Card,
  PlatformScope,
} from "@razzia/extensions/platform-ui"
import {
  getClientId,
  getRole,
  getToken,
  isExpired,
} from "@razzia/web/lib/session"
import { packageJson } from "./package-api"
import { packageSaveText } from "./package-save-strings"

interface SaveOutcome {
  uploadId: string
  revision: number
  installedGameIds: string[]
}
interface SaveInspection {
  requestId: string
  uploadId: string
  revision: number
  sourceDigest: string
  buildDigest: string | null
  title: string
  contents: Array<{
    id: string
    kind: "game" | "declarative-theme" | "sandboxed-react-theme"
  }>
  reviewed: boolean
  canInstall: boolean
  expiresAt: string
  outcome: SaveOutcome | null
}
interface SessionBinding {
  token: string
  owner: string
  requestId: string
}
type State =
  "loading" | "ready" | "failed" | "expired" | "saving" | "uncertain" | "saved"

interface ConsentState {
  identity: string
  attempt: number
  state: State
  inspection: SaveInspection | null
  read: boolean
}

function inspectionStartState(allowed: boolean, authorized: boolean): State {
  if (!allowed) {
    return "failed"
  }

  return authorized ? "loading" : "expired"
}

function invalidatedConsent(
  current: ConsentState,
  identity: string,
  attempt: number,
): ConsentState {
  if (current.identity !== identity || current.attempt !== attempt) {
    return current
  }

  const uncertain = current.state === "saving" || current.state === "uncertain"

  return {
    ...current,
    state: uncertain ? "uncertain" : "expired",
    inspection: null,
    read: false,
  }
}

const opaque = /^[A-Za-z0-9_-]{22,64}$/u
const digest = /^[a-f0-9]{64}$/u
const contentId = /^[a-z][a-z0-9-]{1,79}$/u
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const exactKeys = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key))
const positiveRevision = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value > 0 &&
  value <= 2_147_483_647

function parseOutcome(value: unknown): SaveOutcome {
  if (
    !object(value) ||
    !exactKeys(value, ["uploadId", "revision", "installedGameIds"]) ||
    typeof value.uploadId !== "string" ||
    !opaque.test(value.uploadId) ||
    !positiveRevision(value.revision) ||
    !Array.isArray(value.installedGameIds) ||
    value.installedGameIds.length > 32 ||
    !value.installedGameIds.every(
      (id: unknown): id is string =>
        typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id),
    )
  ) {
    throw new Error("PACKAGE_SAVE_RESPONSE")
  }

  return {
    uploadId: value.uploadId,
    revision: value.revision,
    installedGameIds: [...value.installedGameIds],
  }
}

function parseInspection(value: unknown, requestId: string): SaveInspection {
  if (
    !object(value) ||
    !exactKeys(value, [
      "requestId",
      "uploadId",
      "revision",
      "sourceDigest",
      "buildDigest",
      "title",
      "contents",
      "reviewed",
      "canInstall",
      "expiresAt",
      "outcome",
    ]) ||
    value.requestId !== requestId ||
    typeof value.uploadId !== "string" ||
    !opaque.test(value.uploadId) ||
    !positiveRevision(value.revision) ||
    typeof value.sourceDigest !== "string" ||
    !digest.test(value.sourceDigest) ||
    !(
      value.buildDigest === null ||
      (typeof value.buildDigest === "string" && digest.test(value.buildDigest))
    ) ||
    typeof value.title !== "string" ||
    !value.title ||
    value.title.length > 120 ||
    typeof value.reviewed !== "boolean" ||
    typeof value.canInstall !== "boolean" ||
    typeof value.expiresAt !== "string" ||
    !Number.isFinite(Date.parse(value.expiresAt)) ||
    !Array.isArray(value.contents) ||
    !value.contents.length ||
    value.contents.length > 40
  ) {
    throw new Error("PACKAGE_SAVE_RESPONSE")
  }

  const contents = value.contents.map(
    (item): SaveInspection["contents"][number] => {
      if (
        !object(item) ||
        !exactKeys(item, ["id", "kind"]) ||
        typeof item.id !== "string" ||
        !contentId.test(item.id) ||
        (item.kind !== "game" &&
          item.kind !== "declarative-theme" &&
          item.kind !== "sandboxed-react-theme")
      ) {
        throw new Error("PACKAGE_SAVE_RESPONSE")
      }

      return { id: item.id, kind: item.kind }
    },
  )

  if (new Set(contents.map((item) => item.id)).size !== contents.length) {
    throw new Error("PACKAGE_SAVE_RESPONSE")
  }

  const outcome = value.outcome === null ? null : parseOutcome(value.outcome)

  if (
    outcome &&
    (outcome.uploadId !== value.uploadId || outcome.revision !== value.revision)
  ) {
    throw new Error("PACKAGE_SAVE_RESPONSE")
  }

  return {
    requestId,
    uploadId: value.uploadId,
    revision: value.revision,
    sourceDigest: value.sourceDigest,
    buildDigest: value.buildDigest,
    title: value.title,
    contents,
    reviewed: value.reviewed,
    canInstall: value.canInstall,
    expiresAt: value.expiresAt,
    outcome,
  }
}

function sameSession(bound: SessionBinding | null, requestId: string) {
  return (
    bound?.requestId === requestId &&
    getToken() === bound.token &&
    getClientId() === bound.owner &&
    getRole() === SESSION_ROLES.MANAGER &&
    !isExpired()
  )
}

/** Compatibility page for earlier save links. Opening a link never saves. */
export function PackageSaveConsent({ requestId }: { requestId: string }) {
  const { i18n } = useTranslation()
  const language =
    (i18n.resolvedLanguage ?? i18n.language).split("-")[0] ?? "en"
  const locale = [
    "en",
    "he",
    "fr",
    "de",
    "es",
    "it",
    "ja",
    "tr",
    "vi",
  ].includes(language)
    ? language
    : "en"
  const text = packageSaveText(locale)
  const token = getToken()
  const owner = getClientId()
  const role = getRole()
  const allowed =
    opaque.test(requestId) &&
    !window.location.search &&
    !window.location.hash &&
    window.top === window.self
  const identity = JSON.stringify([requestId, token, owner, role, allowed])
  const authorized = Boolean(token && owner && role === SESSION_ROLES.MANAGER)
  const startState = inspectionStartState(allowed, authorized)
  const [consent, setConsent] = useState<ConsentState>(() => ({
    identity,
    attempt: 0,
    state: startState,
    inspection: null,
    read: startState === "loading",
  }))

  if (consent.identity !== identity) {
    // Never commit an inspection or approval control from the previous identity.
    // Losing an approval response remains uncertain until an explicit read.
    const interrupted =
      consent.state === "saving" || consent.state === "uncertain"
    setConsent({
      identity,
      attempt: consent.attempt + 1,
      state: interrupted ? "uncertain" : startState,
      inspection: null,
      read: !interrupted && startState === "loading",
    })
  }

  const { state, inspection, attempt, read } = consent
  const snapshot = useRef<SaveInspection | null>(null)
  const session = useRef<SessionBinding | null>(null)
  const approval = useRef<{
    controller: AbortController
    identity: string
    attempt: number
  } | null>(null)

  useEffect(() => {
    if (!read || !allowed || !authorized || !token) {
      return
    }

    const controller = new AbortController()
    const bound = { token, owner, requestId }
    session.current = bound
    snapshot.current = null
    const matches = (current: ConsentState) =>
      current.identity === identity && current.attempt === attempt
    const invalidate = () => {
      controller.abort()
      const operation = approval.current

      if (operation?.identity === identity && operation.attempt === attempt) {
        operation.controller.abort()
      }

      session.current = null
      snapshot.current = null
      setConsent((current) => invalidatedConsent(current, identity, attempt))
    }

    // A session can change between render and effect setup. The independent
    // monitor handles that race without issuing a read for the previous session.
    if (sameSession(bound, requestId)) {
      void packageJson<unknown>(`/save-consents/${requestId}`, {
        signal: controller.signal,
        referrerPolicy: "no-referrer",
      })
        .then((raw) => {
          if (controller.signal.aborted) {
            return
          }

          if (!sameSession(bound, requestId)) {
            invalidate()

            return
          }

          const value = parseInspection(raw, requestId)

          if (Date.parse(value.expiresAt) <= Date.now()) {
            invalidate()

            return
          }

          snapshot.current = value
          setConsent((current) =>
            matches(current)
              ? {
                  ...current,
                  inspection: value,
                  state: value.outcome ? "saved" : "ready",
                }
              : current,
          )
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setConsent((current) =>
              matches(current) ? { ...current, state: "failed" } : current,
            )
          }
        })
    }

    // A read ending does not end the identity or its uncertain approval.
    return () => controller.abort()
  }, [requestId, identity, token, owner, attempt, read, allowed, authorized])

  useEffect(() => {
    if (!allowed || !authorized || !token) {
      return
    }

    const bound = { token, owner, requestId }
    let active = true
    const invalidate = () => {
      if (!active) {
        return
      }

      active = false
      const operation = approval.current

      if (operation?.identity === identity && operation.attempt === attempt) {
        operation.controller.abort()
      }

      session.current = null
      snapshot.current = null
      setConsent((current) => invalidatedConsent(current, identity, attempt))
    }
    const check = () => {
      if (!active) {
        return
      }

      const { current } = snapshot

      if (
        !sameSession(bound, requestId) ||
        (current &&
          !current.outcome &&
          Date.parse(current.expiresAt) <= Date.now())
      ) {
        invalidate()
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === "token" || event.key === null) {
        invalidate()
      } else {
        check()
      }
    }
    const interval = window.setInterval(check, 1000)
    window.addEventListener("focus", check)
    window.addEventListener("storage", onStorage)

    return () => {
      active = false
      const operation = approval.current

      if (operation?.identity === identity && operation.attempt === attempt) {
        operation.controller.abort()
        approval.current = null
      }

      session.current = null
      snapshot.current = null
      window.clearInterval(interval)
      window.removeEventListener("focus", check)
      window.removeEventListener("storage", onStorage)
    }
  }, [requestId, identity, token, owner, attempt, allowed, authorized])

  const save = async () => {
    const current = inspection
    const bound = session.current

    if (
      approval.current ||
      consent.identity !== identity ||
      state !== "ready" ||
      !current?.canInstall ||
      current.outcome
    ) {
      return
    }

    const matches = (value: ConsentState) =>
      value.identity === identity && value.attempt === attempt

    if (
      !sameSession(bound, requestId) ||
      Date.parse(current.expiresAt) <= Date.now()
    ) {
      session.current = null
      snapshot.current = null
      setConsent((value) =>
        matches(value)
          ? { ...value, state: "expired", inspection: null, read: false }
          : value,
      )

      return
    }

    const controller = new AbortController()
    const operation = { controller, identity, attempt }
    approval.current = operation
    const onAbort = () => {
      // Aborting transport cannot establish whether the server saved the package.
      setConsent((value) =>
        matches(value)
          ? { ...value, state: "uncertain", inspection: null, read: false }
          : value,
      )
    }
    controller.signal.addEventListener("abort", onAbort, { once: true })
    setConsent((value) =>
      matches(value) ? { ...value, state: "saving" } : value,
    )

    try {
      const result = parseOutcome(
        await packageJson<unknown>(`/save-consents/${requestId}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision: "approve",
            expectedRevision: current.revision,
            sourceDigest: current.sourceDigest,
          }),
          signal: controller.signal,
          referrerPolicy: "no-referrer",
        }),
      )

      if (controller.signal.aborted || !sameSession(bound, requestId)) {
        controller.abort()

        return
      }

      if (
        result.uploadId !== current.uploadId ||
        result.revision !== current.revision
      ) {
        throw new Error("PACKAGE_SAVE_RESPONSE")
      }

      const saved = { ...current, outcome: result }
      snapshot.current = saved
      setConsent((value) =>
        matches(value)
          ? { ...value, inspection: saved, state: "saved" }
          : value,
      )
      window.dispatchEvent(new Event("tadazz:packages-changed"))
    } catch {
      // A lost response is reconciled with a read; never retry approval automatically.
      if (!controller.signal.aborted) {
        setConsent((value) =>
          matches(value)
            ? { ...value, state: "uncertain", read: false }
            : value,
        )
      }
    } finally {
      controller.signal.removeEventListener("abort", onAbort)

      if (approval.current === operation) {
        approval.current = null
      }
    }
  }

  const refresh = () => {
    setConsent((current) => ({
      identity,
      attempt: current.attempt + 1,
      state: startState,
      inspection: null,
      read: startState === "loading",
    }))
  }

  const game = inspection?.contents.find((item) => item.kind === "game")
  const previewUrl =
    inspection && game
      ? `/studio/package-preview/${inspection.uploadId}/${inspection.revision}/${game.id}`
      : null
  const readyStatus = inspection?.canInstall ? text.ready : text.notReady
  const status = state === "ready" ? readyStatus : text[state]
  const unsavedTone =
    state === "ready" && inspection?.canInstall ? "info" : "neutral"

  return (
    <PlatformScope
      context="platform.studio"
      dir={locale === "he" ? "rtl" : "ltr"}
    >
      <main
        data-testid="package-save-consent"
        style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}
      >
        <Card>
          <div style={{ display: "grid", gap: 20, padding: 24, minWidth: 0 }}>
            <header>
              <h1>{text.title}</h1>
              <p>{text.intro}</p>
            </header>
            {inspection && (
              <section
                aria-labelledby="package-save-title"
                style={{ overflowWrap: "anywhere" }}
              >
                <h2 id="package-save-title" data-testid="package-save-title">
                  {inspection.title}
                </h2>
                <p>
                  {text.revision} {inspection.revision}
                </p>
                <h3>{text.contents}</h3>
                <ul data-testid="package-save-contents">
                  {inspection.contents.map((item) => (
                    <li key={item.id}>
                      {item.kind === "game" ? text.game : text.theme}:{" "}
                      <bdi>{item.id}</bdi>
                    </li>
                  ))}
                </ul>
                <p>
                  {text.expires}{" "}
                  <time dateTime={inspection.expiresAt}>
                    {new Date(inspection.expiresAt).toLocaleString(locale)}
                  </time>
                </p>
              </section>
            )}
            <div
              role={
                state === "failed" ||
                state === "expired" ||
                state === "uncertain"
                  ? "alert"
                  : "status"
              }
              data-testid="package-save-status"
            >
              <Badge tone={state === "saved" ? "success" : unsavedTone}>
                {status}
              </Badge>
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {state !== "saved" && (
                <Button
                  variant="primary"
                  data-testid="package-save-approve"
                  disabled={state !== "ready" || !inspection?.canInstall}
                  loading={state === "saving"}
                  onClick={(event) => {
                    if (event.isTrusted) {
                      void save()
                    }
                  }}
                >
                  {state === "saving" ? text.saving : text.save}
                </Button>
              )}
              {(state === "failed" ||
                state === "uncertain" ||
                (state === "ready" && !inspection?.canInstall)) && (
                <Button data-testid="package-save-check" onClick={refresh}>
                  {text.check}
                </Button>
              )}
              {state === "saved" && (
                <a href="/studio/games" referrerPolicy="no-referrer">
                  {text.games}
                </a>
              )}
              {previewUrl && state !== "saving" && (
                <a href={previewUrl} referrerPolicy="no-referrer">
                  {text.preview}
                </a>
              )}
              <a href="/studio" referrerPolicy="no-referrer">
                {text.studio}
              </a>
            </div>
          </div>
        </Card>
      </main>
    </PlatformScope>
  )
}
