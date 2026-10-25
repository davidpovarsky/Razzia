import Button from "@razzia/web/components/Button"
import { AlertTriangle, RefreshCw, Save, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

export interface ConflictDialogProps {
  open: boolean
  serverRevision?: number
  expectedRevision?: number | null
  onReload: () => void
  onOverwrite: () => void
  onCancel: () => void
  portal?: boolean
}

/**
 * ConflictDialog provides accessible, Radix-based HTTP 409 conflict resolution.
 * - Accessible Dialog semantics (Radix UI) with focus trapping, Escape dismiss, and focus restoration
 * - Brand-aligned design token styling
 * - Explicit two-step confirmation for Force Overwrite to prevent accidental data loss
 * - Full 8-locale i18next support
 */
export const ConflictDialog = ({
  open,
  serverRevision,
  expectedRevision,
  onReload,
  onOverwrite,
  onCancel,
  portal = true,
}: ConflictDialogProps) => {
  const { t } = useTranslation()
  const [confirmingOverwrite, setConfirmingOverwrite] = useState(false)

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setConfirmingOverwrite(false)
      onCancel()
    }
  }

  const content = (
    <>
      <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
      <Dialog.Content
        aria-describedby="conflict-dialog-desc"
        className="bg-background border-border data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border p-6 shadow-2xl"
        data-testid="conflict-modal"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <Dialog.Title
                className="text-foreground text-xl font-bold"
                data-testid="conflict-title"
              >
                {t("extensions:conflict.title", "Revision Conflict (HTTP 409)")}
              </Dialog.Title>
              <Dialog.Description
                className="text-muted-foreground text-sm"
                id="conflict-dialog-desc"
              >
                {t(
                  "extensions:conflict.description",
                  "Another session modified this quiz while you were editing.",
                )}
              </Dialog.Description>
            </div>
          </div>
          <Dialog.Close
            aria-label={t("common:close", "Close")}
            className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-lg p-1 transition-colors"
          >
            <X className="size-5" />
          </Dialog.Close>
        </div>

        <div className="my-5 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm dark:border-neutral-700 dark:bg-neutral-800/60">
          <div className="flex justify-between py-1">
            <span className="text-muted-foreground">
              {t("extensions:conflict.yourRevision", "Your working revision:")}
            </span>
            <span className="font-mono font-bold">
              {expectedRevision ??
                t("extensions:conflict.unversioned", "Unversioned")}
            </span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 py-1 dark:border-neutral-700">
            <span className="text-muted-foreground">
              {t(
                "extensions:conflict.serverRevision",
                "Latest server revision:",
              )}
            </span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {serverRevision ??
                t("extensions:conflict.unknownHigher", "Unknown (Higher)")}
            </span>
          </div>
        </div>

        {confirmingOverwrite ? (
          <div className="rounded-xl border-t border-red-200 bg-red-50/50 p-3 dark:border-red-900/50 dark:bg-red-950/20">
            <p className="mb-3 text-xs font-bold text-red-600 dark:text-red-400">
              {t(
                "extensions:conflict.overwriteConfirmDesc",
                "Warning: This will overwrite changes made by another session on the server. This action cannot be undone.",
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                className="bg-accent text-accent-foreground px-3 py-1.5 text-xs font-semibold"
                onClick={() => setConfirmingOverwrite(false)}
              >
                {t("common:cancel", "Cancel")}
              </Button>
              <Button
                type="button"
                size="sm"
                className="bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                onClick={onOverwrite}
                data-testid="conflict-confirm-overwrite-button"
              >
                {t("extensions:conflict.overwrite", "Confirm Overwrite")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button
              type="button"
              className="bg-accent text-accent-foreground px-4 py-2.5 text-sm font-semibold"
              onClick={onCancel}
              data-testid="conflict-cancel-button"
            >
              {t("extensions:conflict.cancel", "Cancel")}
            </Button>

            <Button
              type="button"
              onClick={onReload}
              className="bg-primary hover:bg-primary/90 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold text-white shadow-sm"
              data-testid="conflict-reload-button"
            >
              <RefreshCw className="size-4" />
              {t("extensions:conflict.reload", "Reload Server Version")}
            </Button>

            <Button
              type="button"
              onClick={() => setConfirmingOverwrite(true)}
              className="flex items-center justify-center gap-2 border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
              data-testid="conflict-overwrite-button"
            >
              <Save className="size-4" />
              {t("extensions:conflict.overwrite", "Force Overwrite")}
            </Button>
          </div>
        )}
      </Dialog.Content>
    </>
  )

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      {portal ? <Dialog.Portal>{content}</Dialog.Portal> : content}
    </Dialog.Root>
  )
}

export default ConflictDialog
