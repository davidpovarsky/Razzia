// oxlint-disable typescript/no-unnecessary-condition -- Preserve runtime guards for sparse legacy/authored snapshots at the extension boundary.
import {
  exportTadaShowWorkbook,
  generateTadaShowWorkbookBlankTemplate,
  nativeBundleToAuthoredShow,
  preflightShowImport,
  type ShowPreflightResult,
} from "@razzia/extensions/core"
import { CompositeApiClient } from "@razzia/extensions/editor"
import { createQuizz } from "@razzia/web/features/manager/queries"
import { api, unwrap } from "@razzia/web/lib/api"
import { useMutation } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { type ChangeEvent, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

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
  const blob = new Blob([Uint8Array.from(bytes).buffer], { type: mimeType })
  downloadBlob(blob, filename)
}

export function useShowFileActions({
  invalidate,
  onError,
}: {
  invalidate: () => unknown
  onError: (error: Error, fallback: string) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [preflightData, setPreflightData] =
    useState<ShowPreflightResult | null>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  const { mutate: importQuizz } = useMutation({
    mutationFn: createQuizz,
    onSuccess: (res) => {
      invalidate()
      setIsImportModalOpen(false)
      setPreflightData(null)
      toast.success(t("quizz:quizzSaved"))

      if (
        res &&
        typeof res === "object" &&
        "id" in res &&
        typeof res.id === "string"
      ) {
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

  const handleExportTadaJson =
    (id: string, defaultSubject: string) => async () => {
      try {
        const client = new CompositeApiClient()
        const bundle = await client.exportQuizBundle(id)
        const subject =
          (bundle.quizz as { subject?: string } | null)?.subject ??
          defaultSubject ??
          id
        const authoredShow = nativeBundleToAuthoredShow(bundle, {
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
      }
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : t("errors:quizz.failedToSave"),
      )
    } finally {
      setIsImporting(false)
    }
  }

  return {
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
  }
}
