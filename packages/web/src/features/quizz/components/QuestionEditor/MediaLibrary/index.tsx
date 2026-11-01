import type { UploadedMedia } from "@razzia/common/types/game"
import { BUILT_IN_SOUNDS_LIST, isQuizExtrasV2 } from "@razzia/extensions/core"
import Loader from "@razzia/web/components/Loader"
import MediaCard from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaCard"
import MediaDropOverlay from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaDropOverlay"
import MediaRow from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaRow"
import MediaLibraryEmpty from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaLibraryEmpty"
import MediaLibraryToolbar, {
  type MediaFilter,
  type MediaView,
} from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaLibraryToolbar"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useUploadMedia } from "@razzia/web/features/quizz/hooks/useUploadMedia"
import {
  deleteMedia,
  mediaKeys,
  mediaListQuery,
} from "@razzia/web/features/quizz/queries"
import { ApiError } from "@razzia/web/lib/api"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import clsx from "clsx"
import { AlertTriangle, Music, Volume2, X } from "lucide-react"
import { Dialog } from "radix-ui"
import { type DragEvent, useMemo, useRef, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  open: boolean
  onOpenChange: (_open: boolean) => void
  onSelect?: (_item: UploadedMedia) => void
  acceptType?: "image" | "video" | "audio" | "all"
}

type MediaScopeTab = "all" | "show" | "builtin"

const BUILT_IN_SOUNDS: Array<UploadedMedia & { label: string }> = BUILT_IN_SOUNDS_LIST

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files")

const MediaLibrary = ({ open, onOpenChange, onSelect, acceptType }: Props) => {
  const {
    quizzId,
    questions,
    updateQuestion,
    currentIndex,
    extras,
    setExtras,
  } = useQuizzEditor()
  const { data, isPending } = useQuery({ ...mediaListQuery(), enabled: open })
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<MediaFilter>(
    acceptType && acceptType !== "all" ? acceptType : "all",
  )
  const [scopeTab, setScopeTab] = useState<MediaScopeTab>("all")
  const [view, setView] = useState<MediaView>("grid")
  const [isDragging, setIsDragging] = useState(false)
  const [pendingForceDeleteItem, setPendingForceDeleteItem] =
    useState<UploadedMedia | null>(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [playingBuiltinUrl, setPlayingBuiltinUrl] = useState<string | null>(
    null,
  )
  const queryClient = useQueryClient()
  const { t } = useTranslation()

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

    // 2. Reconcile extras sidecar to avoid dangling broken media references
    if (extras) {
      let hasChanges = false
      const updatedPerQuestion = { ...extras.perQuestion }

      for (const [qId, qItem] of Object.entries(updatedPerQuestion)) {
        const updatedItem = { ...qItem }
        let itemChanged = false

        if (updatedItem.answerVisuals?.some((v) => v.url === item.url)) {
          itemChanged = true
          updatedItem.answerVisuals = updatedItem.answerVisuals.map((v) =>
            v.url === item.url
              ? { ...v, url: undefined, display: "text" as const }
              : v,
          )
        }

        if (updatedItem.interlude?.url === item.url) {
          itemChanged = true
          updatedItem.interlude = {
            ...updatedItem.interlude,
            url: undefined,
          }
        }

        if (updatedItem.background?.url === item.url) {
          itemChanged = true
          delete updatedItem.background
        }

        if (updatedItem.audioCues) {
          const nextCues = { ...updatedItem.audioCues }
          for (const key of [
            "showQuestion",
            "answersMusic",
            "revealResults",
          ] as const) {
            if (nextCues[key]?.url === item.url) {
              itemChanged = true
              nextCues[key] = {
                mode: "inherit",
                volume: nextCues[key]?.volume ?? 0.8,
              }
            }
          }
          updatedItem.audioCues = nextCues
        }

        if (itemChanged) {
          hasChanges = true
          updatedPerQuestion[qId] = updatedItem
        }
      }

      const updatedAudio = { ...extras.audio }
      let audioChanged = false
      for (const [cueId, cueSetting] of Object.entries(updatedAudio.cues)) {
        if (cueSetting.url === item.url) {
          audioChanged = true
          updatedAudio.cues = {
            ...updatedAudio.cues,
            [cueId as keyof typeof updatedAudio.cues]: {
              ...cueSetting,
              source: "default",
              url: undefined,
            },
          }
        }
      }

      let updatedScenes = isQuizExtrasV2(extras)
        ? { ...extras.scenes }
        : undefined
      let scenesChanged = false
      if (updatedScenes) {
        for (const [sId, scene] of Object.entries(updatedScenes)) {
          const nextScene = { ...scene }
          let sChanged = false
          if ("mediaUrl" in nextScene && nextScene.mediaUrl === item.url) {
            if (nextScene.kind === "media") {
              nextScene.mediaUrl = ""
            } else {
              delete (nextScene as { mediaUrl?: string }).mediaUrl
            }
            sChanged = true
          }
          if (nextScene.background?.url === item.url) {
            delete nextScene.background
            sChanged = true
          }
          if (nextScene.audio?.url === item.url) {
            delete nextScene.audio
            sChanged = true
          }
          if (sChanged) {
            scenesChanged = true
            updatedScenes[sId] = nextScene
          }
        }
      }

      const updatedCatalog = extras.mediaCatalog?.filter(
        (c) => c.url !== item.url && c.name !== item.name,
      )
      const catalogChanged =
        (updatedCatalog?.length ?? 0) !== (extras.mediaCatalog?.length ?? 0)

      if (hasChanges || audioChanged || scenesChanged || catalogChanged) {
        setExtras({
          ...extras,
          perQuestion: updatedPerQuestion,
          audio: updatedAudio,
          ...(isQuizExtrasV2(extras) && updatedScenes
            ? { scenes: updatedScenes }
            : {}),
          ...(updatedCatalog ? { mediaCatalog: updatedCatalog } : {}),
        })
      }
    }
  }

  const { mutate: remove } = useMutation({
    mutationFn: ({
      item,
      detach,
    }: {
      item: UploadedMedia
      detach?: boolean
    }) => deleteMedia(item.name, { detach }),
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

  const usedUrlsInShow = useMemo(() => {
    const urls = new Set<string>()
    for (const q of questions) {
      if (q.media?.url) {
        urls.add(q.media.url)
      }
    }
    if (extras) {
      for (const pq of Object.values(extras.perQuestion ?? {})) {
        if (!pq) continue
        if (pq.background?.url) urls.add(pq.background.url)
        if (pq.interlude?.url) urls.add(pq.interlude.url)
        for (const av of pq.answerVisuals ?? []) {
          if (av.url) urls.add(av.url)
        }
        if (pq.audioCues?.showQuestion?.url)
          urls.add(pq.audioCues.showQuestion.url)
        if (pq.audioCues?.answersMusic?.url)
          urls.add(pq.audioCues.answersMusic.url)
        if (pq.audioCues?.revealResults?.url)
          urls.add(pq.audioCues.revealResults.url)
      }
      if (isQuizExtrasV2(extras)) {
        for (const scene of Object.values(extras.scenes ?? {})) {
          if (!scene) continue
          if ("mediaUrl" in scene && typeof scene.mediaUrl === "string") {
            urls.add(scene.mediaUrl)
          }
          if (scene.background?.url) urls.add(scene.background.url)
          if (scene.audio?.url) urls.add(scene.audio.url)
        }
      }
      for (const cue of Object.values(extras.audio?.cues ?? {})) {
        if (cue?.url) urls.add(cue.url)
      }
      for (const cat of extras.mediaCatalog ?? []) {
        if (cat.url) urls.add(cat.url)
      }
    }
    return urls
  }, [questions, extras])

  const media = data?.media ?? []
  const query = search.trim().toLowerCase()
  const effectiveFilter: MediaFilter =
    acceptType && acceptType !== "all" ? acceptType : filter
  const showBuiltInTab =
    acceptType === "audio" || effectiveFilter === "audio"

  const visibleMedia = media.filter((item) => {
    const matchesType =
      effectiveFilter === "all" || item.type === effectiveFilter
    const matchesQuery = item.name.toLowerCase().includes(query)
    const matchesScope =
      scopeTab === "show" ? usedUrlsInShow.has(item.url) : true

    return matchesType && matchesQuery && matchesScope
  })

  const visibleBuiltInSounds = BUILT_IN_SOUNDS.filter(
    (item) =>
      item.name.toLowerCase().includes(query) ||
      item.label.toLowerCase().includes(query),
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

  const handleSelect = (item: UploadedMedia) => () => {
    if (acceptType && acceptType !== "all" && item.type !== acceptType) {
      toast.error(
        t("extensions:errors.invalidMediaType", {
          expected: acceptType,
          defaultValue: `Only ${acceptType} files are allowed here`,
        }),
      )

      return
    }

    stopPreviewAudio()
    handleUploadedItem(item)

    if (onSelect) {
      onSelect(item)
    } else {
      updateQuestion(currentIndex, {
        media: { type: item.type, url: item.url },
      })
    }

    onOpenChange(false)
  }

  const handleDelete = (item: UploadedMedia) => () => {
    remove({ item, detach: false })
  }

  const handleConfirmForceDelete = () => {
    if (!pendingForceDeleteItem) return
    remove({ item: pendingForceDeleteItem, detach: true })
  }

  const handleDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) {
      return
    }

    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDragging(false)
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    upload(Array.from(e.dataTransfer.files))
  }

  const isEmpty =
    scopeTab !== "builtin" &&
    !isPending &&
    media.length === 0 &&
    pendingCount === 0
  const hasNoResults =
    scopeTab !== "builtin" &&
    !isPending &&
    !isEmpty &&
    pendingCount === 0 &&
    visibleMedia.length === 0

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      stopPreviewAudio()
      setSearch("")
      setPendingForceDeleteItem(null)
      setScopeTab("all")
      setFilter(acceptType && acceptType !== "all" ? acceptType : "all")
    }

    onOpenChange(nextOpen)
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="data-[state=open]:animate-fade fixed inset-0 z-50 bg-black/40" />

        <Dialog.Content
          aria-describedby={undefined}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="bg-background data-[state=open]:animate-fade fixed top-1/2 left-1/2 z-50 flex h-[85dvh] w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl p-4 shadow-xl sm:p-6"
        >
          <div className="flex items-center justify-between gap-4">
            <Dialog.Title className="text-foreground text-lg font-semibold">
              {t("quizz:media.library")}
            </Dialog.Title>

            <Dialog.Close
              aria-label={t("common:close")}
              className="hover:bg-muted text-muted-foreground hover:text-foreground rounded-md p-1"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>

          <div
            data-testid="media-library-scope-tabs"
            className="flex flex-wrap items-center gap-1.5"
          >
            <button
              type="button"
              data-testid="media-scope-all"
              onClick={() => setScopeTab("all")}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                scopeTab === "all"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t("extensions:mediaLibrary.allUploaded", {
                defaultValue: "All Uploaded",
              })}
            </button>
            <button
              type="button"
              data-testid="media-scope-show"
              data-tab="in-show"
              onClick={() => setScopeTab("show")}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                scopeTab === "show"
                  ? "bg-primary text-white shadow-xs"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t("extensions:mediaLibrary.inThisShow", {
                defaultValue: "In This Show",
              })}
            </button>
            {showBuiltInTab && (
              <button
                type="button"
                data-testid="media-scope-builtin"
                data-tab="builtin-sounds"
                onClick={() => setScopeTab("builtin")}
                className={clsx(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
                  scopeTab === "builtin"
                    ? "bg-primary text-white shadow-xs"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                {t("extensions:mediaLibrary.builtInSounds", {
                  defaultValue: "Built-in Sounds",
                })}
              </button>
            )}
          </div>

          {pendingForceDeleteItem && (
            <div
              data-testid="media-delete-in-use-banner"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs"
            >
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                <span className="font-medium">
                  {t("extensions:mediaLibrary.inUseWarning", {
                    name: pendingForceDeleteItem.name,
                    defaultValue: `"${pendingForceDeleteItem.name}" is currently used by one or more cards or shows. Detach it from all cards and delete permanently?`,
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingForceDeleteItem(null)}
                  className="bg-muted text-foreground hover:bg-muted/80 rounded-md px-2.5 py-1 font-semibold"
                >
                  {t("common:cancel", { defaultValue: "Cancel" })}
                </button>
                <button
                  type="button"
                  data-testid="media-confirm-force-delete"
                  onClick={handleConfirmForceDelete}
                  className="rounded-md bg-red-600 px-2.5 py-1 font-semibold text-white hover:bg-red-700"
                >
                  {t("extensions:mediaLibrary.detachAndDelete", {
                    defaultValue: "Detach & Delete",
                  })}
                </button>
              </div>
            </div>
          )}

          <MediaLibraryToolbar
            search={search}
            onSearchChange={setSearch}
            filter={effectiveFilter}
            onFilterChange={setFilter}
            view={view}
            onViewChange={setView}
            onUpload={upload}
            acceptType={acceptType}
          />

          <div className="relative min-h-0 flex-1">
            {scopeTab === "builtin" ? (
              <div className="grid h-full auto-rows-min grid-cols-1 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
                {visibleBuiltInSounds.map((sound) => (
                  <div
                    key={sound.url}
                    data-testid={`builtin-sound-${sound.name}`}
                    className="border-accent bg-muted/40 flex items-center justify-between gap-2 rounded-xl border p-3"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <button
                        type="button"
                        data-testid={`builtin-sound-preview-${sound.name}`}
                        onClick={() => toggleBuiltinPreview(sound.url)}
                        aria-label={`Preview ${sound.label}`}
                        className="bg-primary/15 text-primary hover:bg-primary/25 flex size-9 shrink-0 items-center justify-center rounded-lg transition"
                      >
                        {playingBuiltinUrl === sound.url ? (
                          <Volume2 className="size-4 animate-pulse" />
                        ) : (
                          <Music className="size-4" />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className="text-foreground truncate text-sm font-semibold">
                          {sound.label}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {sound.name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      data-testid={`builtin-sound-select-${sound.name}`}
                      onClick={handleSelect(sound)}
                      className="bg-primary shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white hover:brightness-105"
                    >
                      {t("quizz:media.use")}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {isPending && (
                  <div className="flex h-full items-center justify-center">
                    <Loader className="text-primary size-12" />
                  </div>
                )}

                {isEmpty && <MediaLibraryEmpty />}

                {hasNoResults && (
                  <p className="text-muted-foreground py-12 text-center">
                    {t("quizz:media.noResults")}
                  </p>
                )}

                {(visibleMedia.length > 0 || pendingCount > 0) && (
                  <div
                    className={clsx(
                      "h-full overflow-y-auto p-0.5",
                      view === "grid"
                        ? "grid auto-rows-min grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3"
                        : "flex flex-col gap-1",
                    )}
                  >
                    {Array.from({ length: pendingCount }, (_, index) => (
                      <div
                        key={`pending-${index}`}
                        className={clsx(
                          "bg-accent/60 flex animate-pulse items-center justify-center",
                          view === "grid"
                            ? "aspect-square rounded-xl"
                            : "h-15 rounded-lg",
                        )}
                      >
                        <Loader className="text-primary size-8" />
                      </div>
                    ))}

                    {visibleMedia.map((item) =>
                      view === "grid" ? (
                        <MediaCard
                          key={item.name}
                          media={item}
                          onSelect={handleSelect(item)}
                          onDelete={handleDelete(item)}
                        />
                      ) : (
                        <MediaRow
                          key={item.name}
                          media={item}
                          onSelect={handleSelect(item)}
                          onDelete={handleDelete(item)}
                        />
                      ),
                    )}
                  </div>
                )}
              </>
            )}

            {isDragging && <MediaDropOverlay />}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default MediaLibrary
