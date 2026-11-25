import { PlatformButton } from "../presentation/platform-controls"
import { AlertTriangle, RefreshCw, Save } from "lucide-react"
import { useEffect, useRef } from "react"

export interface ConflictModalProps {
  open: boolean
  serverRevision?: number
  expectedRevision?: number | null
  onReload: () => void
  onOverwrite: () => void
  onCancel: () => void
  t?: (_key: string, _fallback?: string) => string
}

/**
 * ConflictModal provides accessible 409 conflict handling per product decisions.
 * Displays when a concurrent edit has incremented the server revision.
 * - Accessible dialog semantics: focus trap, Escape key handling, focus restoration
 * - Brand-aligned token styling
 * - Clear choices (Reload / Overwrite / Cancel) preserving user edits until explicit decision
 */
export const ConflictModal = ({
  open,
  serverRevision,
  expectedRevision,
  onReload,
  onOverwrite,
  onCancel,
  t,
}: ConflictModalProps) => {
  const tr = (key: string, fallback: string): string =>
    t ? t(`extensions:${key}`, fallback) : fallback

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)

  // Focus trap and focus restoration
  useEffect(() => {
    if (!open) {
      if (previousActiveElementRef.current) {
        previousActiveElementRef.current.focus()
        previousActiveElementRef.current = null
      }

      return
    }

    if (typeof document !== "undefined") {
      previousActiveElementRef.current =
        document.activeElement as HTMLElement | null
    }

    // Auto-focus first interactive element
    const timer = setTimeout(() => {
      if (dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )

        if (focusables.length > 0) {
          focusables[0].focus()
        }
      }
    }, 20)

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onCancel()

        return
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => !el.hasAttribute("disabled"))

        if (focusables.length === 0) {
          return
        }

        const [first] = focusables
        const last = focusables[focusables.length - 1]

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      clearTimeout(timer)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open, onCancel])

  if (!open) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      aria-describedby="conflict-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      data-testid="conflict-modal"
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-white p-6 text-black shadow-2xl dark:bg-neutral-900 dark:text-white"
      >
        <div className="flex items-center gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-800">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
            <AlertTriangle className="size-6" />
          </div>
          <div>
            <h2
              id="conflict-dialog-title"
              className="text-xl font-bold"
              data-testid="conflict-title"
            >
              {tr("conflict.title", "Revision Conflict (HTTP 409)")}
            </h2>
            <p
              id="conflict-dialog-desc"
              className="text-sm text-neutral-500 dark:text-neutral-400"
            >
              {tr(
                "conflict.description",
                "Another session modified this quiz while you were editing.",
              )}
            </p>
          </div>
        </div>

        <div className="my-5 rounded-xl bg-neutral-100 p-4 text-sm dark:bg-neutral-800/60">
          <div className="flex justify-between py-1">
            <span className="text-neutral-600 dark:text-neutral-400">
              {tr("conflict.yourRevision", "Your working revision:")}
            </span>
            <span className="font-mono font-bold">
              {expectedRevision ?? tr("conflict.unversioned", "Unversioned")}
            </span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 py-1 dark:border-neutral-700">
            <span className="text-neutral-600 dark:text-neutral-400">
              {tr("conflict.serverRevision", "Latest server revision:")}
            </span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {serverRevision ??
                tr("conflict.unknownHigher", "Unknown (Higher)")}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <PlatformButton
            size="sm"
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 focus:ring-2 focus:ring-neutral-400 focus:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            data-testid="conflict-cancel-button"
          >
            {tr("conflict.cancel", "Cancel")}
          </PlatformButton>

          <PlatformButton
            size="sm"
            type="button"
            onClick={onReload}
            className="bg-primary focus:ring-primary flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:brightness-105 focus:ring-2 focus:outline-none active:scale-[0.98]"
            data-testid="conflict-reload-button"
          >
            <RefreshCw className="size-4" />
            {tr("conflict.reload", "Reload Latest Version")}
          </PlatformButton>

          <PlatformButton
            size="sm"
            type="button"
            onClick={onOverwrite}
            className="flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100 focus:ring-2 focus:ring-red-400 focus:outline-none dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
            data-testid="conflict-overwrite-button"
          >
            <Save className="size-4" />
            {tr("conflict.overwrite", "Force Overwrite")}
          </PlatformButton>
        </div>
      </div>
    </div>
  )
}
