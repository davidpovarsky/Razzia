import type { App } from "@modelcontextprotocol/ext-apps"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { inputs } from "../contracts/tools.ts"
import {
  parseFullShowSaveOutcome,
  type FullShowSaveInput,
  type FullShowSaveOutcome,
} from "../client/full-show-save.ts"

export function FullShowSaveV3({
  app,
  draftId,
  revision,
  disabled,
}: {
  app: App
  draftId: string
  revision: number
  disabled: boolean
}) {
  const { t } = useTranslation("widget")
  const request = useRef<FullShowSaveInput | null>(null)
  const live = useRef(true)
  const inFlight = useRef(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [linkFailed, setLinkFailed] = useState(false)
  const [outcome, setOutcome] = useState<FullShowSaveOutcome | null>(null)
  const saveLabel = outcome?.kind === "consent" ? "finishSave" : "saveAction"
  const canCall = Boolean(app.getHostCapabilities()?.serverTools)
  const canOpen = Boolean(app.getHostCapabilities()?.openLinks)
  useEffect(
    () => () => {
      live.current = false
    },
    [],
  )

  async function save() {
    if (disabled || !canCall || inFlight.current || outcome?.kind === "saved") {
      return
    }

    request.current ??= inputs.save_game.parse({
      contractVersion: "0.1.0",
      draftId,
      expectedRevision: revision,
      idempotencyKey: crypto.randomUUID(),
      intent: "createNew",
    })
    const attempt = request.current
    inFlight.current = true
    setBusy(true)
    setFailed(false)

    try {
      const result = await app.callServerTool(
        { name: "save_game", arguments: attempt },
        { timeout: 15000 },
      )
      const parsed = parseFullShowSaveOutcome(
        attempt,
        result,
        document.querySelector("base")?.getAttribute("href") ?? "",
      )

      if (live.current) {
        setOutcome(parsed)
        setFailed(parsed.kind === "denied")
      }
    } catch {
      if (live.current) {
        setFailed(true)
      }
    } finally {
      inFlight.current = false

      if (live.current) {
        setBusy(false)
      }
    }
  }

  async function open(url: string) {
    if (disabled || !canOpen || busy) {
      return
    }

    setLinkFailed(false)

    try {
      const result = await app.openLink({ url }, { timeout: 10000 })

      if (live.current) {
        setLinkFailed(result.isError === true)
      }
    } catch {
      if (live.current) {
        setLinkFailed(true)
      }
    }
  }

  return (
    <section className="widget-save" aria-label={t("saveAction")}>
      {outcome?.kind !== "saved" && (
        <button
          type="button"
          data-testid="full-show-save"
          disabled={disabled || busy || !canCall}
          onClick={() => void save()}
        >
          {t(busy ? "savingAction" : saveLabel)}
        </button>
      )}
      {outcome?.kind === "consent" && (
        <>
          <p role="status" data-testid="full-show-save-consent">
            {t("consentPending")}
          </p>
          <button
            type="button"
            data-testid="full-show-review-save"
            disabled={disabled || busy || !canOpen}
            onClick={() => void open(outcome.url)}
          >
            {t("reviewSave")}
          </button>
        </>
      )}
      {outcome?.kind === "saved" && (
        <>
          <p role="status" data-testid="full-show-save-complete">
            {t("savedInTadazz", { revision: outcome.savedRevision })}
          </p>
          <button
            type="button"
            data-testid="full-show-open-saved"
            disabled={disabled || busy || !canOpen}
            onClick={() => void open(outcome.url)}
          >
            {t("openSavedGame")}
          </button>
        </>
      )}
      {!canCall && <p>{t("saveUnsupported")}</p>}
      {failed && (
        <p role="status" data-testid="full-show-save-error">
          {t("saveActionFailed")}
        </p>
      )}
      {linkFailed && <p role="status">{t("saveLinkFailed")}</p>}
      {!canOpen && outcome && outcome.kind !== "denied" && (
        <p>
          {t("openLinkUnavailable")} <code>{outcome.url}</code>
        </p>
      )}
    </section>
  )
}
