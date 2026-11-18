import { MEDIA_TYPES } from "@razzia/common/constants"
import type { UploadedMediaType } from "@razzia/common/types/game"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import ToggleGroup from "@razzia/web/components/ToggleGroup"
import { getMediaUploadAccept as getUploadAccept } from "@razzia/extensions/core"
import { LayoutGrid, List, Search, Upload } from "lucide-react"
import type { ChangeEvent } from "react"
import { useTranslation } from "react-i18next"

export type MediaFilter = "all" | UploadedMediaType

export type MediaView = "grid" | "list"

const VIEWS = [
  { value: "grid", icon: LayoutGrid, labelKey: "quizz:media.view.grid" },
  { value: "list", icon: List, labelKey: "quizz:media.view.list" },
] as const

const FILTERS: Array<{ value: MediaFilter; labelKey: string }> = [
  { value: "all", labelKey: "quizz:media.filter.all" },
  { value: MEDIA_TYPES.IMAGE, labelKey: "quizz:question.media.image" },
  { value: MEDIA_TYPES.AUDIO, labelKey: "quizz:question.media.audio" },
  { value: MEDIA_TYPES.VIDEO, labelKey: "quizz:question.media.video" },
]

interface Props {
  search: string
  onSearchChange: (_search: string) => void
  filter: MediaFilter
  onFilterChange: (_filter: MediaFilter) => void
  view: MediaView
  onViewChange: (_view: MediaView) => void
  onUpload: (_files: File[]) => void
  acceptType?: "image" | "video" | "audio" | "all"
}

const MediaLibraryToolbar = ({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  view,
  onViewChange,
  onUpload,
  acceptType,
}: Props) => {
  const { t } = useTranslation()

  const isTypeLocked = Boolean(acceptType && acceptType !== "all")

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    onSearchChange(e.target.value)
  }

  const handleFilterChange = (value: string) => {
    if (isTypeLocked) {
      return
    }

    onFilterChange(value as MediaFilter)
  }

  const handleUpload = (e: ChangeEvent<HTMLInputElement>) => {
    onUpload(Array.from(e.target.files ?? []))
    e.target.value = ""
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <Search className="text-muted-foreground pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2" />
        <input
          type="search"
          dir="auto"
          aria-label={t("quizz:media.search")}
          value={search}
          onChange={handleSearchChange}
          placeholder={t("quizz:media.search")}
          className="focus:border-primary border-accent text-foreground h-10 w-full rounded-lg border-2 ps-9 pe-3 text-sm font-semibold focus:outline-none"
        />
      </div>

      {!isTypeLocked && (
        <Select value={filter} onValueChange={handleFilterChange}>
          <SelectTrigger
            aria-label={t("quizz:media.filterByType")}
            className="h-10 w-40"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map(({ value, labelKey }) => (
              <SelectItem key={value} value={value}>
                {t(labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <ToggleGroup
        iconOnly
        value={view}
        onChange={onViewChange}
        items={VIEWS.map(({ value, icon, labelKey }) => ({
          value,
          icon,
          label: t(labelKey),
        }))}
      />

      <label className="bg-primary focus-within:ring-primary flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-offset-2 hover:brightness-[1.05] active:brightness-[0.95]">
        <Upload className="size-4" />
        {t("quizz:media.upload")}
        <input
          type="file"
          multiple
          accept={getUploadAccept(acceptType)}
          className="sr-only"
          aria-label={t("quizz:media.upload")}
          onChange={handleUpload}
        />
      </label>
    </div>
  )
}

export default MediaLibraryToolbar
