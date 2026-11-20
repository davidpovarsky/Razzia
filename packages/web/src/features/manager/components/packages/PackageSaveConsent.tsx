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
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(id),
    )
  ) {
    throw new Error("PACKAGE_SAVE_RESPONSE")
  }

  return {
    uploadId: value.uploadId,
    revision: value.revision,
    installedGameIds: [...value.installedGameIds] as string[],
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
  return Boolean(
    bound &&
    bound.requestId === requestId &&
    getToken() === bound.token &&
    getClientId() === bound.owner &&
    getRole() === SESSION_ROLES.MANAGER &&
    !isExpired(),
  )
}

/** First-party review and explicit save. Loading or previewing never approves. */
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
  const [state, setState] = useState<State>("loading")
  const [inspection, setInspection] = useState<SaveInspection | null>(null)
  const [refresh, setRefresh] = useState(0)
  const snapshot = useRef<SaveInspection | null>(null)
  const session = useRef<SessionBinding | null>(null)
  const approval = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const token = getToken()
    const owner = getClientId()
    const bound = token && owner ? { token, owner, requestId } : null
    session.current = bound
    snapshot.current = null
    setInspection(null)
    setState("loading")

    const invalidate = () => {
      const saving = Boolean(approval.current)
      controller.abort()
      approval.current?.abort()
      session.current = null
      snapshot.current = null
      setInspection(null)
      setState(saving ? "uncertain" : "expired")
    }
    if (
      !opaque.test(requestId) ||
      window.location.search ||
      window.location.hash ||
      window.top !== window.self
    ) {
      setState("failed")

      return () => controller.abort()
    }
    if (!sameSession(bound, requestId)) {
      setState("expired")

      return () => controller.abort()
    }

    void packageJson<unknown>(`/save-consents/${requestId}`, {
      signal: controller.signal,
      referrerPolicy: "no-referrer",
    })
      .then((raw) => {
        if (controller.signal.aborted) return
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
        setInspection(value)
        setState(value.outcome ? "saved" : "ready")
      })
      .catch(() => {
        if (!controller.signal.aborted) setState("failed")
      })
    const check = () => {
      if (controller.signal.aborted) return
      const current = snapshot.current
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
      if (event.key === "token" || event.key === null) invalidate()
      else check()
    }
    const interval = window.setInterval(check, 1000)
    window.addEventListener("focus", check)
    window.addEventListener("storage", onStorage)

    return () => {
      controller.abort()
      approval.current?.abort()
      approval.current = null
      session.current = null
      snapshot.current = null
      window.clearInterval(interval)
      window.removeEventListener("focus", check)
      window.removeEventListener("storage", onStorage)
    }
  }, [requestId, refresh])

  const save = async () => {
    const current = snapshot.current
    const bound = session.current
    if (
      approval.current ||
      state !== "ready" ||
      !current?.canInstall ||
      current.outcome
    )
      return
    if (
      !sameSession(bound, requestId) ||
      Date.parse(current.expiresAt) <= Date.now()
    ) {
      setState("expired")

      return
    }
    const controller = new AbortController()
    approval.current = controller
    setState("saving")
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
      if (controller.signal.aborted || !sameSession(bound, requestId)) return
      if (
        result.uploadId !== current.uploadId ||
        result.revision !== current.revision
      ) {
        throw new Error("PACKAGE_SAVE_RESPONSE")
      }
      const saved = { ...current, outcome: result }
      snapshot.current = saved
      setInspection(saved)
      setState("saved")
    } catch {
      // A lost response is reconciled with a read; never retry approval automatically.
      if (!controller.signal.aborted) setState("uncertain")
    } finally {
      if (approval.current === controller) approval.current = null
    }
  }

  const game = inspection?.contents.find((item) => item.kind === "game")
  const previewUrl =
    inspection && game
      ? `/studio/package-preview/${inspection.uploadId}/${inspection.revision}/${game.id}`
      : null
  const reviewPending =
    inspection &&
    !inspection.reviewed &&
    inspection.contents.some((item) => item.kind !== "game")
  const status =
    state === "ready"
      ? inspection?.canInstall
        ? text.ready
        : reviewPending
          ? text.reviewPending
          : text.notReady
      : text[state]

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
              <Badge
                tone={
                  state === "saved"
                    ? "success"
                    : state === "ready" && inspection?.canInstall
                      ? "info"
                      : "neutral"
                }
              >
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
                    if (event.isTrusted) void save()
                  }}
                >
                  {state === "saving" ? text.saving : text.save}
                </Button>
              )}
              {(state === "failed" ||
                state === "uncertain" ||
                (state === "ready" && !inspection?.canInstall)) && (
                <Button
                  data-testid="package-save-check"
                  onClick={() => setRefresh((value) => value + 1)}
                >
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
