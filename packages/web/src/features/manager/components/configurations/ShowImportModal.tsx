import Button from "@razzia/web/components/Button"
import { type ShowPreflightResult } from "@razzia/extensions/core"
import {
  AlertTriangle,
  FileSpreadsheet,
  FileText,
  Sparkles,
  XCircle,
} from "lucide-react"
import { AlertDialog as RadixAlertDialog } from "radix-ui"
import { useTranslation } from "react-i18next"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  preflight: ShowPreflightResult | null
  isImporting: boolean
  onConfirm: () => void
}

export const ShowImportModal = ({
  open,
  onOpenChange,
  preflight,
  isImporting,
  onConfirm,
}: Props) => {
  const { t } = useTranslation()

  if (!preflight) {
    return null
  }

  const { ok, format, summary, issues } = preflight
  const errors = issues.filter((i) => i.severity === "error")
  const warnings = issues.filter((i) => i.severity === "warning")
  const hasErrors = !ok || errors.length > 0

  const getFormatLabel = () => {
    switch (format) {
      case "tada-xlsx":
        return t("extensions:showImport.formatTadaXlsx")

      case "tada-json":
        return t("extensions:showImport.formatTadaJson")

      case "enhanced-bundle":
        return t("extensions:showImport.formatEnhancedBundle")

      case "legacy-json":
        return t("extensions:showImport.formatLegacyJson")

      default:
        return ""
    }
  }

  return (
    <RadixAlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixAlertDialog.Portal>
        <RadixAlertDialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />

        <RadixAlertDialog.Content
          onClick={(e) => e.stopPropagation()}
          className="bg-background border-accent fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border-2 p-6 shadow-xl"
          data-testid="show-import-dialog"
        >
          {/* Header */}
          <div className="border-accent flex shrink-0 items-start justify-between gap-4 border-b pb-4">
            <div>
              <RadixAlertDialog.Title className="text-foreground flex items-center gap-2 text-xl font-bold">
                {(() => {
                  if (format === "tada-xlsx") {
                    return (
                      <FileSpreadsheet className="size-5 text-emerald-500" />
                    )
                  }

                  if (format === "enhanced-bundle") {
                    return <Sparkles className="size-5 text-amber-500" />
                  }

                  return <FileText className="text-primary size-5" />
                })()}
                {t("extensions:showImport.dialogTitle")}
              </RadixAlertDialog.Title>

              <RadixAlertDialog.Description className="text-muted-foreground mt-1 text-sm">
                {t("extensions:showImport.dialogDescription")}
              </RadixAlertDialog.Description>
            </div>

            <span className="bg-accent text-accent-foreground shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
              {getFormatLabel()}
            </span>
          </div>

          {/* Scrollable Content Body */}
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4">
            {summary && (
              <>
                {/* Show Title & Overview */}
                <div className="bg-accent/40 rounded-lg p-3">
                  <div className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    {t("extensions:showImport.showTitle")}
                  </div>
                  <div className="text-foreground mt-0.5 truncate text-base font-bold">
                    {summary.title || "—"}
                  </div>
                </div>

                {/* Stat Counters */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="border-accent rounded-lg border p-2.5 text-center">
                    <div className="text-muted-foreground text-xs">
                      {t("extensions:showImport.totalCards")}
                    </div>
                    <div className="text-foreground text-lg font-bold">
                      {summary.totalCards}
                    </div>
                  </div>

                  <div className="border-accent rounded-lg border p-2.5 text-center">
                    <div className="text-muted-foreground text-xs">
                      {t("extensions:showImport.questions")}
                    </div>
                    <div className="text-foreground text-lg font-bold">
                      {summary.questionCount}
                      <span className="text-muted-foreground ml-1 text-xs font-normal">
                        ({summary.quizCount}Q / {summary.surveyCount}S)
                      </span>
                    </div>
                  </div>

                  <div className="border-accent rounded-lg border p-2.5 text-center">
                    <div className="text-muted-foreground text-xs">
                      {t("extensions:showImport.scenes")}
                    </div>
                    <div className="text-foreground text-lg font-bold">
                      {summary.sceneCount}
                    </div>
                  </div>

                  <div className="border-accent rounded-lg border p-2.5 text-center">
                    <div className="text-muted-foreground text-xs">
                      {t("extensions:showImport.mediaAssets")}
                    </div>
                    <div className="text-foreground text-lg font-bold">
                      {summary.mediaCount}
                      {summary.answerImageCount > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                          (+{summary.answerImageCount} img)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ordered Timeline Preview */}
                <div>
                  <h4 className="text-foreground mb-2 text-sm font-semibold">
                    {t("extensions:showImport.timelineHeading")}
                  </h4>
                  <div className="border-accent max-h-48 overflow-y-auto rounded-lg border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-accent/60 text-muted-foreground sticky top-0 font-semibold">
                        <tr>
                          <th className="w-8 p-2 text-center">#</th>
                          <th className="w-24 p-2">
                            {t("extensions:showImport.colKind")}
                          </th>
                          <th className="w-20 p-2">
                            {t("extensions:showImport.colKey")}
                          </th>
                          <th className="p-2">
                            {t("extensions:showImport.colTitle")}
                          </th>
                          <th className="w-16 p-2 text-center">
                            {t("extensions:showImport.colAdvance")}
                          </th>
                          <th className="w-16 p-2 text-center">
                            {t("extensions:showImport.colMedia")}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-accent divide-y">
                        {summary.timelinePreview.map((item) => (
                          <tr
                            key={`${item.order}-${item.key}`}
                            className="hover:bg-accent/20"
                          >
                            <td className="text-muted-foreground p-2 text-center">
                              {item.order}
                            </td>
                            <td className="p-2">
                              <span className="bg-accent text-accent-foreground rounded px-1.5 py-0.5 font-medium">
                                {item.kind}
                              </span>
                            </td>
                            <td className="text-muted-foreground max-w-[80px] truncate p-2 font-mono">
                              {item.key}
                            </td>
                            <td className="max-w-[220px] truncate p-2">
                              {item.title ?? item.questionText ?? "—"}
                            </td>
                            <td className="text-muted-foreground p-2 text-center">
                              {item.advance === "manual"
                                ? t("extensions:showImport.advanceManual")
                                : t("extensions:showImport.advanceAuto")}
                            </td>
                            <td className="p-2 text-center">
                              {item.hasMedia ||
                              (item.answerImageCount &&
                                item.answerImageCount > 0) ? (
                                <span className="font-bold text-emerald-500">
                                  ✓
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* Error Messages */}
            {errors.length > 0 && (
              <div
                className="space-y-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400"
                data-testid="show-import-errors"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <XCircle className="size-4 shrink-0 stroke-red-500" />
                  {t("extensions:showImport.errorsHeading")}
                </div>
                <ul className="list-disc space-y-1 pl-5">
                  {errors.map((err, idx) => (
                    <li key={idx}>
                      {err.path ? (
                        <strong className="font-mono">[{err.path}]: </strong>
                      ) : null}
                      {t(err.messageKey) || err.messageKey}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div
                className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400"
                data-testid="show-import-warnings"
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="size-4 shrink-0 stroke-amber-500" />
                  {t("extensions:showImport.warningsHeading")}
                </div>
                <ul className="list-disc space-y-1 pl-5">
                  {warnings.map((warn, idx) => (
                    <li key={idx}>
                      {warn.cardKey ? (
                        <strong className="font-mono">
                          [{warn.cardKey}]:{" "}
                        </strong>
                      ) : null}
                      {t(warn.messageKey) || warn.messageKey}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="border-accent flex shrink-0 justify-end gap-2 border-t pt-4">
            <RadixAlertDialog.Cancel asChild>
              <Button
                className="bg-accent text-accent-foreground px-4 py-2 text-sm font-semibold"
                onClick={() => onOpenChange(false)}
                data-testid="show-import-cancel"
              >
                {t("extensions:showImport.cancelButton")}
              </Button>
            </RadixAlertDialog.Cancel>

            <Button
              className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50"
              onClick={onConfirm}
              disabled={hasErrors || isImporting}
              data-testid="show-import-commit"
            >
              {isImporting
                ? t("extensions:showImport.importing")
                : t("extensions:showImport.commitButton")}
            </Button>
          </div>
        </RadixAlertDialog.Content>
      </RadixAlertDialog.Portal>
    </RadixAlertDialog.Root>
  )
}
