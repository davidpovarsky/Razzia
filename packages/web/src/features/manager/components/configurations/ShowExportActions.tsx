import { FileCode, FileSpreadsheet, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { useShowFileActions } from "./use-show-file-actions"

export function ShowExportActions({
  q,
  handleExportEnhanced,
  handleExportXlsx,
  handleExportTadaJson,
}: Pick<
  ReturnType<typeof useShowFileActions>,
  "handleExportEnhanced" | "handleExportXlsx" | "handleExportTadaJson"
> & { q: { id: string; subject: string } }) {
  const { t } = useTranslation()

  return (
    <>
      {" "}
      <button
        className="text-accent-foreground hover:bg-accent-foreground/10 focus:ring-primary rounded-sm p-2 focus:ring-2 focus:outline-none"
        onClick={() => handleExportEnhanced(q.id)()}
        title={t("extensions:bundle.exportEnhanced")}
        aria-label={t("extensions:bundle.exportEnhanced")}
        data-testid={`export-enhanced-${q.id}`}
      >
        <Sparkles className="size-4 text-amber-500" />
      </button>
      <button
        className="text-accent-foreground hover:bg-accent-foreground/10 focus:ring-primary rounded-sm p-2 focus:ring-2 focus:outline-none"
        onClick={() => handleExportXlsx(q.id, q.subject)()}
        title={t("extensions:showImport.exportTadaXlsx")}
        aria-label={t("extensions:showImport.exportTadaXlsx")}
        data-testid={`export-xlsx-${q.id}`}
      >
        <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
      </button>
      <button
        className="text-accent-foreground hover:bg-accent-foreground/10 focus:ring-primary rounded-sm p-2 focus:ring-2 focus:outline-none"
        onClick={() => handleExportTadaJson(q.id, q.subject)()}
        title={t("extensions:showImport.exportTadaJson")}
        aria-label={t("extensions:showImport.exportTadaJson")}
        data-testid={`export-tada-json-${q.id}`}
      >
        <FileCode className="size-4 text-sky-500" />
      </button>
    </>
  )
}
