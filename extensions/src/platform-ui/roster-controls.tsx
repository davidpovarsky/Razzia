import { Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { AlertDialog } from "./alert-dialog"
import { IconButton } from "./button"
import { Switch } from "./fields"

/** The roster broadcast is the authoritative current phone policy. */
export function hostRules<
  Settings extends { phoneInviteOnly?: boolean },
>(snapshot: {
  settings: Settings
  hostPresence?: { phoneInviteOnly: boolean } | null
}): Settings {
  return {
    ...snapshot.settings,
    phoneInviteOnly:
      snapshot.hostPresence?.phoneInviteOnly ??
      snapshot.settings.phoneInviteOnly,
  }
}

/** Saves through the original owner's handler, never optimistically reports success. */
export function HostRosterPolicy({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => Promise<unknown>
}) {
  const { t } = useTranslation()
  const pendingRef = useRef(false)
  const [status, setStatus] = useState<"idle" | "pending" | "saved" | "error">(
    "idle",
  )
  const save = async (next: boolean) => {
    if (disabled || pendingRef.current) return
    pendingRef.current = true
    setStatus("pending")
    try {
      await onChange(next)
      setStatus("saved")
    } catch {
      setStatus("error")
    } finally {
      pendingRef.current = false
    }
  }
  return (
    <section className="tds-roster-policy" aria-busy={status === "pending"}>
      <Switch
        label={t("extensions:roster.phoneInviteOnly")}
        checked={checked}
        disabled={disabled || status === "pending"}
        onCheckedChange={(next) => void save(next)}
        aria-describedby="tds-roster-policy-description"
        data-testid="host-modal-invite-only-toggle"
      />
      <p id="tds-roster-policy-description" className="tds-description">
        {t("extensions:roster.phoneInviteOnlyDesc")}
      </p>
      {status === "saved" && (
        <span role="status" data-platform-motion="feedback">
          {t("extensions:roster.saved")}
        </span>
      )}
      {status === "pending" && (
        <span role="status" data-platform-motion="feedback">
          {t("extensions:roster.saving")}
        </span>
      )}
      {status === "error" && (
        <span
          role="alert"
          className="tds-field-error"
          data-platform-motion="feedback"
        >
          {t("errors:route.description")}
        </span>
      )}
    </section>
  )
}

export function HostRosterRemove({
  name,
  participantId,
  disabled,
  onConfirm,
}: {
  name: string
  participantId: string
  disabled?: boolean
  onConfirm: () => Promise<unknown>
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog
      title={t("extensions:roster.removeTitle", { name })}
      description={t("extensions:roster.removeDescription", { name })}
      errorLabel={t("extensions:roster.removeError", { name })}
      confirmLabel={t("extensions:roster.remove")}
      confirmTestId="host-roster-remove-confirm"
      returnFocusTo='[data-testid="host-modal-search-input"]'
      onConfirm={onConfirm}
      trigger={
        <IconButton
          label={t("extensions:roster.removeTitle", { name })}
          disabled={disabled}
          variant="ghost"
          data-testid={`host-player-remove-${participantId}`}
        >
          <Trash2 width={18} height={18} />
        </IconButton>
      }
    />
  )
}
