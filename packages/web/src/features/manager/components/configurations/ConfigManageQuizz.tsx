import {
  exportTadaShowWorkbook,
  generateTadaShowWorkbookBlankTemplate,
  nativeBundleToAuthoredShow,
  preflightShowImport,
  type ShowPreflightResult,
} from "@razzia/extensions/core"
import { CompositeApiClient } from "@razzia/extensions/editor"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import { SkeletonRows } from "@razzia/web/components/Skeleton"
import {
  createQuizz,
  deleteQuizz,
  quizzKeys,
  quizzListQuery,
} from "@razzia/web/features/manager/queries"
import { api, ApiError, unwrap } from "@razzia/web/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  Download,
  FileCode,
  FileDown,
  FileSpreadsheet,
  Sparkles,
  SquarePen,
  Trash2,
  Upload,
} from "lucide-react"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { ShowImportModal } from "./ShowImportModal"

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")

  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()

  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  downloadBlob(blob, filename)
}

const downloadBuffer = (
  bytes: Uint8Array,
  filename: string,
  mimeType: string,
) => {
  const blob = new Blob([bytes as any], { type: mimeType })
  downloadBlob(blob, filename)
}

const ConfigManageQuizz = () => {
  const { data, isPending } = useQuery(quizzListQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const [preflightData, setPreflightData] =
    useState<ShowPreflightResult | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: quizzKeys.all })

  const onError = (error: Error, fallback: string) => {
    toast.error(t(error instanceof ApiError ? error.key : fallback))
  }

  const { mutate: remove } = useMutation({
    mutationFn: deleteQuizz,
    onSuccess: () => {
      invalidate()
      toast.success(t("manager:quizz.deleted"))
    },
    onError: (error) => onError(error, "errors:quizz.failedToDelete"),
  })

  const { mutate: importQuizz } = useMutation({
    mutationFn: createQuizz,
    onSuccess: (res) => {
      invalidate()
      setIsImportModalOpen(false)
      setPreflightData(null)
      toast.success(t("quizz:quizzSaved"))
      if (res && typeof res === "object" && "id" in res && typeof res.id === "string") {
        navigate({
          to: "/manager/quizz/$quizzId",
          params: { quizzId: res.id },
        })
      }
    },
    onError: (error) => onError(error, "errors:quizz.failedToSave"),
  })

  const handleExportLegacy = (id: string) => async () => {
    try {
      const { id: _id, ...quizz } = await unwrap(
        api.quizz[":id"].$get({ param: { id } }),
      )

      downloadJson(quizz, `${quizz.subject}.json`)
    } catch (error) {
      onError(error as Error, "errors:quizz.notFound")
    }
  }

  const handleExportEnhanced = (id: string) => async () => {
    try {
      const client = new CompositeApiClient()
      const bundle = await client.exportQuizBundle(id)
      const subject =
        (bundle.quizz as { subject?: string } | null)?.subject ?? id

      downloadJson(bundle, `${subject}.bundle.json`)
      toast.success(t("extensions:bundle.exportEnhanced"))
    } catch (error) {
      onError(error as Error, "errors:quizz.notFound")
    }
  }

  const handleExportXlsx = (id: string, defaultSubject: string) => async () => {
    try {
      const client = new CompositeApiClient()
      const bundle = await client.exportQuizBundle(id)
      const subject =
        (bundle.quizz as { subject?: string } | null)?.subject ??
        defaultSubject ??
        id
      const xlsxBytes = exportTadaShowWorkbook(bundle)

      downloadBuffer(
        xlsxBytes,
        `${subject}.xlsx`,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      toast.success(t("extensions:showImport.exportTadaXlsx"))
    } catch (error) {
      onError(error as Error, "errors:quizz.notFound")
    }
  }

  const handleExportTadaJson = (id: string, defaultSubject: string) => async () => {
    try {
      const client = new CompositeApiClient()
      const bundle = await client.exportQuizBundle(id)
      const subject =
        (bundle.quizz as { subject?: string } | null)?.subject ??
        defaultSubject ??
        id
      const authoredShow = nativeBundleToAuthoredShow(bundle as any, {
        includePrivateRoster: false,
      })

      downloadJson(authoredShow, `${subject}.tada.json`)
      toast.success(t("extensions:showImport.exportTadaJson"))
    } catch (error) {
      onError(error as Error, "errors:quizz.notFound")
    }
  }

  const handleDownloadTemplate = () => {
    try {
      const templateBytes = generateTadaShowWorkbookBlankTemplate()
      downloadBuffer(
        templateBytes,
        "TADA_Show_Template_v1.xlsx",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
    } catch (error) {
      onError(error as Error, "errors:api.serverError")
    }
  }

  const handleImportFileSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) {
      return
    }

    try {
      const arrayBuffer = await file.arrayBuffer()
      const preflight = preflightShowImport(
        new Uint8Array(arrayBuffer),
        file.name,
      )

      setPreflightData(preflight)
      setIsImportModalOpen(true)
    } catch {
      toast.error(t("errors:invalidRequest"))
    } finally {
      e.target.value = ""
    }
  }

  const handleCommitImport = async () => {
    if (!preflightData || !preflightData.ok) {
      return
    }

    setIsImporting(true)

    try {
      if (preflightData.normalizedBundleDraft) {
        const client = new CompositeApiClient()
        const result = await client.importQuizBundle(
          preflightData.normalizedBundleDraft,
        )

        invalidate()
        setIsImportModalOpen(false)
        setPreflightData(null)
        toast.success(t("extensions:showImport.successToast"))

        if (result.quizId) {
          navigate({
            to: "/manager/quizz/$quizzId",
            params: { quizzId: result.quizId },
          })
        }

        return
      }

      if (preflightData.legacyQuizzDraft) {
        importQuizz(preflightData.legacyQuizzDraft)

        return
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("errors:quizz.failedToSave"),
      )
    } finally {
      setIsImporting(false)
    }
  }

  const quizz = data?.quizz ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-4 flex shrink-0 gap-2">
        <Button
          className="flex-1"
          onClick={() => navigate({ to: "/manager/quizz" })}
        >
          {t("manager:quizz.create")}
        </Button>

        <Button
          className="bg-accent text-accent-foreground aspect-square px-3"
          onClick={() => fileInputRef.current?.click()}
          title={t("extensions:showImport.importShowPrompt")}
          aria-label={t("extensions:showImport.importShowPrompt")}
          data-testid="import-show-button"
        >
          <Upload className="size-4" />
        </Button>

        <Button
          className="bg-accent text-accent-foreground aspect-square px-3"
          onClick={handleDownloadTemplate}
          title={t("extensions:showImport.downloadTemplate")}
          aria-label={t("extensions:showImport.downloadTemplate")}
          data-testid="download-template-xlsx"
        >
          <FileDown className="size-4" />
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.xlsx"
          className="hidden"
          onChange={handleImportFileSelect}
          data-testid="import-file-input"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-0.5">
        {isPending && <SkeletonRows className="h-12" />}

        {quizz.map((q) => (
          <div
            key={q.id}
            className="border-accent flex h-12 w-full items-center justify-between rounded-md border-2 p-3 pr-1.5"
          >
            <p className="text-foreground truncate font-medium">{q.subject}</p>
            <div className="flex gap-0.5">
              <button
                className="text-accent-foreground hover:bg-accent-foreground/10 focus:ring-primary rounded-sm p-2 focus:ring-2 focus:outline-none"
                title={t("manager:quizz.edit")}
                aria-label={t("manager:quizz.edit")}
                onClick={() =>
                  navigate({
                    to: "/manager/quizz/$quizzId",
                    params: { quizzId: q.id },
                  })
                }
              >
                <SquarePen className="size-4" />
              </button>

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

              <button
                className="text-accent-foreground hover:bg-accent-foreground/10 focus:ring-primary rounded-sm p-2 focus:ring-2 focus:outline-none"
                onClick={() => handleExportLegacy(q.id)()}
                title={t("manager:quizz.export")}
                aria-label={t("manager:quizz.export")}
                data-testid={`export-legacy-${q.id}`}
              >
                <Download className="size-4" />
              </button>

              <AlertDialog
                trigger={
                  <button
                    className="rounded-sm p-2 hover:bg-red-600/10 focus:ring-2 focus:ring-red-400 focus:outline-none"
                    title={t("manager:quizz.delete")}
                    aria-label={t("manager:quizz.delete")}
                  >
                    <Trash2 className="size-4 stroke-red-500" />
                  </button>
                }
                title={t("manager:quizz.delete")}
                description={t("manager:quizz.deleteConfirm", {
                  name: q.subject,
                })}
                confirmLabel={t("common:delete")}
                onConfirm={() => remove(q.id)}
              />
            </div>
          </div>
        ))}
        {!isPending && quizz.length === 0 && (
          <p className="text-muted-foreground my-8 text-center">
            {t("manager:quizz.none")}
          </p>
        )}
      </div>

      <ShowImportModal
        open={isImportModalOpen}
        onOpenChange={setIsImportModalOpen}
        preflight={preflightData}
        isImporting={isImporting}
        onConfirm={handleCommitImport}
      />
    </div>
  )
}

export default ConfigManageQuizz
