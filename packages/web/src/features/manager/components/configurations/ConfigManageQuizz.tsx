import { ShowExportActions } from "./ShowExportActions"
import { useShowFileActions } from "./use-show-file-actions"
import AlertDialog from "@razzia/web/components/AlertDialog"
import Button from "@razzia/web/components/Button"
import { SkeletonRows } from "@razzia/web/components/Skeleton"
import {
  deleteQuizz,
  quizzKeys,
  quizzListQuery,
} from "@razzia/web/features/manager/queries"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Download, FileDown, SquarePen, Trash2, Upload } from "lucide-react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"
import { ShowImportModal } from "./ShowImportModal"

const ConfigManageQuizz = () => {
  const { data, isPending } = useQuery(quizzListQuery())
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { t } = useTranslation()

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

  const {
    fileInputRef,
    preflightData,
    isImportModalOpen,
    setIsImportModalOpen,
    isImporting,
    handleExportLegacy,
    handleExportEnhanced,
    handleExportXlsx,
    handleExportTadaJson,
    handleDownloadTemplate,
    handleImportFileSelect,
    handleCommitImport,
  } = useShowFileActions({ invalidate, onError })

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

              <ShowExportActions
                q={q}
                handleExportEnhanced={handleExportEnhanced}
                handleExportXlsx={handleExportXlsx}
                handleExportTadaJson={handleExportTadaJson}
              />

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
