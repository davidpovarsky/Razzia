import {
  MediaLibraryScopeTabs,
  MediaDeleteBanner,
  BuiltinSoundList,
  type MediaScopeTab,
} from "./extension-panels"
import { useMediaLibraryExtensions } from "./use-media-library-extensions"
import type { UploadedMedia } from "@razzia/common/types/game"
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
import { mediaListQuery } from "@razzia/web/features/quizz/queries"
import { useQuery } from "@tanstack/react-query"
import clsx from "clsx"
import { X } from "lucide-react"
import { Dialog } from "radix-ui"
import { type DragEvent, useState } from "react"
import toast from "react-hot-toast"
import { useTranslation } from "react-i18next"

interface Props {
  open: boolean
  onOpenChange: (_open: boolean) => void
  onSelect?: (_item: UploadedMedia) => void
  acceptType?: "image" | "video" | "audio" | "all"
  allowedBuiltinUrls?: readonly string[]
}

const hasFiles = (e: DragEvent) => e.dataTransfer.types.includes("Files")

const MediaLibrary = ({
  open,
  onOpenChange,
  onSelect,
  acceptType,
  allowedBuiltinUrls,
}: Props) => {
  const { currentIndex, updateQuestion } = useQuizzEditor()
  const { data, isPending } = useQuery({ ...mediaListQuery(), enabled: open })
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<MediaFilter>(
    acceptType && acceptType !== "all" ? acceptType : "all",
  )
  const [scopeTab, setScopeTab] = useState<MediaScopeTab>("all")
  const [view, setView] = useState<MediaView>("grid")
  const [isDragging, setIsDragging] = useState(false)
  const { t } = useTranslation()
  const {
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
  } = useMediaLibraryExtensions(acceptType, allowedBuiltinUrls)

  const media = data?.media ?? []
  const query = search.trim().toLowerCase()
  const effectiveFilter: MediaFilter =
    acceptType && acceptType !== "all" ? acceptType : filter
  const showBuiltInTab = acceptType === "audio" || effectiveFilter === "audio"

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

          <MediaLibraryScopeTabs
            scopeTab={scopeTab}
            setScopeTab={setScopeTab}
            showBuiltInTab={showBuiltInTab}
          />
          <MediaDeleteBanner
            pendingForceDeleteItem={pendingForceDeleteItem}
            onCancel={() => setPendingForceDeleteItem(null)}
            handleConfirmForceDelete={handleConfirmForceDelete}
          />

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
              <BuiltinSoundList
                visibleBuiltInSounds={visibleBuiltInSounds}
                playingBuiltinUrl={playingBuiltinUrl}
                toggleBuiltinPreview={toggleBuiltinPreview}
                handleSelect={handleSelect}
              />
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
