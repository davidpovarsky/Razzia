import { useRef, useState, type ReactElement, type MouseEvent } from "react"
import { AlertDialog as RadixAlert } from "radix-ui"
import { useTranslation } from "react-i18next"
import { Button } from "./button"
import { AlertPortal } from "./portal"
import { usePlatformContext } from "./scope"
import { NativeDialog, useDialogState } from "./dialog"

export interface AlertDialogProps {
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmTestId?: string
  errorLabel?: string
  onConfirm: () => void | Promise<unknown>
}
export function AlertDialog({
  title,
  description,
  trigger,
  confirmLabel,
  cancelLabel,
  confirmTestId,
  errorLabel,
  onConfirm,
  ...props
}: AlertDialogProps) {
  const { t } = useTranslation()
  const context = usePlatformContext()
  const state = useDialogState({ ...props, trigger })
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const [failed, setFailed] = useState(false)
  const confirm = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    if (pendingRef.current) return
    pendingRef.current = true
    setPending(true)
    setFailed(false)
    try {
      await onConfirm()
      state.change(false)
    } catch {
      setFailed(true)
    } finally {
      pendingRef.current = false
      setPending(false)
    }
  }
  const confirmButton = (
    <Button
      variant="destructive"
      loading={pending}
      onClick={(event) => void confirm(event)}
      data-testid={confirmTestId}
    >
      {confirmLabel ?? t("common:confirm")}
    </Button>
  )
  const error = failed && (
    <p className="tds-field-error" role="alert">
      {errorLabel ?? t("errors:route.description")}
    </p>
  )
  if (context !== "platform.host")
    return (
      <NativeDialog
        title={title}
        description={description}
        trigger={trigger}
        open={state.open}
        onOpenChange={state.change}
        hideClose
        role="alertdialog"
        dismissible={!pending}
        dismissOnOutside={false}
      >
        {error}
        <div className="tds-dialog-actions">
          <Button disabled={pending} onClick={() => state.change(false)}>
            {cancelLabel ?? t("common:cancel")}
          </Button>
          {confirmButton}
        </div>
      </NativeDialog>
    )
  return (
    <RadixAlert.Root open={state.open} onOpenChange={state.change}>
      {trigger && <RadixAlert.Trigger asChild>{trigger}</RadixAlert.Trigger>}
      <AlertPortal>
        <RadixAlert.Overlay className="tds-overlay" />
        <RadixAlert.Content
          className="tds-dialog-surface"
          aria-busy={pending || undefined}
          onEscapeKeyDown={(event) => {
            if (pending) event.preventDefault()
          }}
        >
          <RadixAlert.Title className="tds-dialog-title">
            {title}
          </RadixAlert.Title>
          <RadixAlert.Description className="tds-dialog-description">
            {description}
          </RadixAlert.Description>
          {error}
          <div className="tds-dialog-actions">
            <RadixAlert.Cancel asChild>
              <Button disabled={pending}>
                {cancelLabel ?? t("common:cancel")}
              </Button>
            </RadixAlert.Cancel>
            <RadixAlert.Action asChild>{confirmButton}</RadixAlert.Action>
          </div>
        </RadixAlert.Content>
      </AlertPortal>
    </RadixAlert.Root>
  )
}
