import { AlertTriangle, RefreshCw, Save } from "lucide-react"

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
 * ConflictModal provides visible 409 conflict handling per product decisions.
 * Displays when a concurrent edit has incremented the server revision.
 * Prevents accidental data loss by giving the user a clear choice to reload or overwrite.
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

  if (!open) {
    return null
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="conflict-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      data-testid="conflict-modal"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-black shadow-2xl dark:bg-neutral-900 dark:text-white">
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
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
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
              {expectedRevision ?? "Unversioned"}
            </span>
          </div>
          <div className="flex justify-between border-t border-neutral-200 py-1 dark:border-neutral-700">
            <span className="text-neutral-600 dark:text-neutral-400">
              {tr("conflict.serverRevision", "Latest server revision:")}
            </span>
            <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
              {serverRevision ?? "Unknown (Higher)"}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onReload}
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            data-testid="conflict-reload-button"
          >
            <RefreshCw className="size-4" />
            {tr("conflict.reload", "Reload Latest Version")}
          </button>

          <button
            type="button"
            onClick={onOverwrite}
            className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            data-testid="conflict-overwrite-button"
          >
            <Save className="size-4" />
            {tr("conflict.overwrite", "Overwrite Server Copy")}
          </button>
        </div>
      </div>
    </div>
  )
}
