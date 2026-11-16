import { requireLibraryValue } from "../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Inspector targets index sparse runtime variant maps.
import { useEffect, useRef, useState } from "react"
import { z } from "zod"
import type { UploadedMedia } from "@razzia/common/types/game"
import MediaThumbnail from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary/MediaThumbnail"
import { Button, Input, Select } from "../../platform-ui"
import { siteRequest } from "../../site/adapters/client"
import type { NativeShowLibraryFamily } from "../../core/show-library/native-library"
import type {
  ThemeOverrides,
  ShowThemeSlotId,
  ShowThemeAudioEvent,
} from "../../core/show-themes/selection"
import type { BuilderTextKey } from "./strings"

const uploadedSchema = z.object({
  name: z.string().max(240),
  url: z.string().regex(/^\/media\/[A-Za-z0-9_-]+\.[a-z0-9]+$/u),
  type: z.enum(["image", "video", "audio"]),
})

/** Existing account media API and original thumbnails; selection changes a draft only. */
export function NativeMediaPanel({
  family,
  section,
  change,
  readOnly,
  text,
  label,
}: {
  family: NativeShowLibraryFamily
  section: ThemeOverrides
  change: (value: Pick<ThemeOverrides, "slots" | "audio">) => void
  readOnly: boolean
  text: (key: BuilderTextKey) => string
  label: (key: string) => string
}) {
  const [media, setMedia] = useState<UploadedMedia[]>([]),
    [target, setTarget] = useState("slot:question")
  const [failed, setFailed] = useState(false),
    [pending, setPending] = useState(false)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => {
    if (readOnly) {
      return
    }

    const controller = new AbortController()
    abort.current = controller
    void siteRequest<{ media: unknown[] }>("/api/media", {
      signal: controller.signal,
    })
      .then((value) => {
        const parsed = z.array(uploadedSchema).max(2048).safeParse(value.media)

        if (parsed.success) {
          setMedia(parsed.data)
        } else {
          setFailed(true)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setFailed(true)
        }
      })

    return () => controller.abort()
  }, [readOnly])
  const audio = target.startsWith("audio:"),
    key = target.slice(target.indexOf(":") + 1)
  const slotSpec = family.definition.slots[key as ShowThemeSlotId],
    audioSpec = family.definition.audioEvents[key as ShowThemeAudioEvent]
  const selectedAudio = section.audio?.[key as ShowThemeAudioEvent],
    selectedSlot = section.slots?.[key as ShowThemeSlotId]
  const selectedVariant = audio
    ? audioSpec?.variants.find(
        (variant) => variant.id === selectedAudio?.variantId,
      )?.assetId
    : slotSpec?.variants.find(
        (variant) => variant.id === selectedSlot?.variantId,
      )?.backgroundAssetId
  const selected =
    (audio ? selectedAudio?.mediaUrl : selectedSlot?.mediaUrl) ??
    family.definition.assets.find((asset) => asset.id === selectedVariant)?.url
  const choose = (url?: string) => {
    const builtin = family.definition.assets.find((asset) => asset.url === url)

    if (audio) {
      const values = { ...section.audio },
        event = key as ShowThemeAudioEvent
      values[event] = builtin
        ? {
            variantId: requireLibraryValue(
              audioSpec.variants.find(
                (variant) => variant.assetId === builtin.id,
              ),
            ).id,
            muted: false,
          }
        : { ...values[event], mediaUrl: url, muted: false }

      if (!url) {
        Reflect.deleteProperty(values, event)
      }

      change({ audio: values })
    } else {
      const values = { ...section.slots },
        slot = key as ShowThemeSlotId
      values[slot] = builtin
        ? {
            variantId: requireLibraryValue(
              slotSpec.variants.find(
                (variant) => variant.backgroundAssetId === builtin.id,
              ),
            ).id,
          }
        : { ...values[slot], mediaUrl: url }

      if (!url) {
        Reflect.deleteProperty(values, slot)
      }

      change({ slots: values })
    }
  }
  const builtin: UploadedMedia[] = family.definition.assets
    .filter((asset) =>
      audio
        ? asset.kind === "audio" &&
          audioSpec?.variants.some((variant) => variant.assetId === asset.id)
        : asset.kind === "image" &&
          slotSpec?.variants.some(
            (variant) => variant.backgroundAssetId === asset.id,
          ),
    )
    .map((asset) => ({
      name: asset.id.replaceAll("-", " "),
      url: asset.url,
      type: asset.kind as "image" | "audio",
    }))
  const items = [
    ...builtin,
    ...media.filter((item) => item.type === (audio ? "audio" : "image")),
  ]

  return (
    <details data-testid="builder-media-library">
      <summary>{text("assets")}</summary>
      <Select
        label={text("mediaTarget")}
        value={target}
        disabled={readOnly || pending}
        onChange={(event) => setTarget(event.target.value)}
      >
        {family.visualSlots
          .filter((slot) => slot.customMedia === "background")
          .map((slot) => (
            <option key={slot.slot} value={`slot:${slot.slot}`}>
              {label(`slots.${slot.slot}`)}
            </option>
          ))}
        {family.audioEvents
          .filter((event) => event.customMedia)
          .map((event) => (
            <option key={event.event} value={`audio:${event.event}`}>
              {label(`audio.${event.event}`)}
            </option>
          ))}
      </Select>
      <Input
        label={text("uploadMedia")}
        type="file"
        accept={audio ? "audio/*" : "image/png,image/jpeg,image/webp,image/gif"}
        disabled={readOnly || pending}
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""

          if (!file) {
            return
          }

          const body = new FormData()
          body.append("file", file)
          setPending(true)
          setFailed(false)
          void siteRequest("/api/media", {
            method: "POST",
            body,
            signal: abort.current?.signal,
          })
            .then((value) => {
              const item = uploadedSchema.parse(value)
              setMedia((previous) => [
                item,
                ...previous.filter((existing) => existing.url !== item.url),
              ])
            })
            .catch(() => {
              if (!abort.current?.signal.aborted) {
                setFailed(true)
              }
            })
            .finally(() => {
              if (!abort.current?.signal.aborted) {
                setPending(false)
              }
            })
        }}
      />
      {failed && <p role="alert">{text("unavailable")}</p>}
      <div className="theme-builder-media-gallery">
        {items.map((item) => (
          <Button
            key={item.url}
            aria-label={item.name}
            disabled={readOnly || pending}
            aria-pressed={selected === item.url}
            onClick={() => choose(item.url)}
            title={item.name}
          >
            {!audio && (
              <span className="theme-builder-media-thumb">
                <MediaThumbnail media={item} />
              </span>
            )}
            <span>{item.name}</span>
          </Button>
        ))}
      </div>
      <Button
        disabled={readOnly || pending || !selected}
        onClick={() => choose()}
      >
        {text("reset")}
      </Button>
    </details>
  )
}
