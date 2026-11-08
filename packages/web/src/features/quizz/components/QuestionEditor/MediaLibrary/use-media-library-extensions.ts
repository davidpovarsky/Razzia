import type { UploadedMedia } from "@razzia/common/types/game"
import {
  BUILT_IN_SOUNDS_LIST,
  isLegacyShowRollback,
  resolveShowTheme,
} from "@razzia/extensions/core"
import {
  reconcileDeletedEditorMedia,
  collectEditorMediaUrls,
} from "@razzia/extensions/editor"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useUploadMedia } from "@razzia/web/features/quizz/hooks/useUploadMedia"
import { deleteMedia, mediaKeys } from "@razzia/web/features/quizz/queries"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

const LEGACY_BUILT_IN_SOUNDS: Array<UploadedMedia & { label: string }> =
  BUILT_IN_SOUNDS_LIST

export function useMediaLibraryExtensions(
  acceptType?: "image" | "video" | "audio" | "all",
  allowedBuiltinUrls?: readonly string[],
) {
  const { quizzId, questions, updateQuestion, extras, setExtras } =
    useQuizzEditor()
  const [pendingForceDeleteItem, setPendingForceDeleteItem] =
    useState<UploadedMedia | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [playingBuiltinUrl, setPlayingBuiltinUrl] = useState<string | null>(
    null,
  )
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  useEffect(
    () => () => {
      previewAudioRef.current?.pause()
      previewAudioRef.current = null
    },
    [],
  )
  const themeDefaults =
    extras && "defaults" in extras ? extras.defaults : undefined
  const BUILT_IN_SOUNDS = useMemo(() => {
    const theme = resolveShowTheme({
      selection: themeDefaults?.showTheme,
      role: "manager",
    })
    const eventsByAsset = new Map<string, string>()
    for (const [event, spec] of Object.entries(theme.definition.audioEvents)) {
      for (const variant of spec.variants) {
        if (variant.assetId && !eventsByAsset.has(variant.assetId)) {
          eventsByAsset.set(variant.assetId, event)
        }
      }
    }
    const sounds = isLegacyShowRollback(themeDefaults)
      ? LEGACY_BUILT_IN_SOUNDS
      : theme.definition.assets.flatMap((asset) => {
          const event = eventsByAsset.get(asset.id)

          return asset.kind === "audio" && event
            ? [
                {
                  name: asset.id,
                  url: asset.url,
                  type: "audio" as const,
                  label: t(`extensions:themes.audio.${event}`),
                },
              ]
            : []
        })

    return allowedBuiltinUrls
      ? sounds.filter((sound) => allowedBuiltinUrls.includes(sound.url))
      : sounds
  }, [themeDefaults, allowedBuiltinUrls, t])

  const handleUploadedItem = (uploaded: UploadedMedia) => {
    setExtras((prev) => {
      if (!prev) {
        return prev
      }

      const currentCatalog = prev.mediaCatalog ? [...prev.mediaCatalog] : []

      if (
        !currentCatalog.some(
          (c) => c.url === uploaded.url || c.name === uploaded.name,
        )
      ) {
        currentCatalog.unshift({
          name: uploaded.name,
          url: uploaded.url,
          type: uploaded.type,
          addedAt: Date.now(),
        })
      }

      return {
        ...prev,
        mediaCatalog: currentCatalog,
      }
    })

    if (quizzId) {
      const token = localStorage.getItem("token")
      fetch("/api/extensions/media/associate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          quizId: quizzId,
          item: {
            name: uploaded.name,
            url: uploaded.url,
            type: uploaded.type,
            addedAt: Date.now(),
          },
        }),
      }).catch(() => undefined)
    }
  }

  const { upload, pendingCount } = useUploadMedia(
    handleUploadedItem,
    acceptType,
  )

  const reconcileDeletedMediaInEditor = (item: UploadedMedia) => {
    // 1. Clear matching base question media
    questions.forEach((question, index) => {
      if (question.media?.url === item.url) {
        updateQuestion(index, { media: undefined })
      }
    })

    const reconciled = reconcileDeletedEditorMedia(extras, item)

    if (reconciled !== extras) {
      setExtras(reconciled)
    }
  }

  const { mutate: remove } = useMutation({
    mutationFn: ({ item, detach }: { item: UploadedMedia; detach?: boolean }) =>
      deleteMedia(item.name, { detach }),
    onSuccess: (_, { item }) => {
      setPendingForceDeleteItem(null)
      reconcileDeletedMediaInEditor(item)
      queryClient.invalidateQueries({ queryKey: mediaKeys.all })
    },
    onError: (error, { item }) => {
      if (
        error instanceof ApiError &&
        (error.key === "extensions:mediaLibrary.deleteBlockedDesc" ||
          error.key.includes("deleteBlocked"))
      ) {
        setPendingForceDeleteItem(item)

        return
      }

      toast.error(
        t(error instanceof ApiError ? error.key : "errors:media.notFound"),
      )
    },
  })

  const usedUrlsInShow = useMemo(
    () => collectEditorMediaUrls(questions, extras),
    [questions, extras],
  )

  const stopPreviewAudio = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.currentTime = 0
      previewAudioRef.current = null
    }

    setPlayingBuiltinUrl(null)
  }

  const toggleBuiltinPreview = (url: string) => {
    if (playingBuiltinUrl === url) {
      stopPreviewAudio()

      return
    }

    stopPreviewAudio()

    try {
      const audio = new Audio(url)
      previewAudioRef.current = audio
      setPlayingBuiltinUrl(url)
      audio.onended = () => setPlayingBuiltinUrl(null)
      audio.play().catch(() => setPlayingBuiltinUrl(null))
    } catch {
      setPlayingBuiltinUrl(null)
    }
  }

  const handleDelete = (item: UploadedMedia) => () => {
    remove({ item, detach: false })
  }

  const handleConfirmForceDelete = () => {
    if (!pendingForceDeleteItem) {
      return
    }

    remove({ item: pendingForceDeleteItem, detach: true })
  }

  return {
    BUILT_IN_SOUNDS,
    upload,
    pendingCount,
    usedUrlsInShow,
    pendingForceDeleteItem,
    setPendingForceDeleteItem,
    playingBuiltinUrl,
    stopPreviewAudio,
    toggleBuiltinPreview,
    handleUploadedItem,
    handleDelete,
    handleConfirmForceDelete,
  }
}
