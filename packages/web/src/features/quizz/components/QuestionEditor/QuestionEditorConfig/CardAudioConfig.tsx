import type { UploadedMedia } from "@razzia/common/types/game"
import type {
  CardAudioCueOverride,
  CardAudioMode,
  CardAudioOverrides,
  QuestionAudioCueKey,
  SceneAudio,
} from "@razzia/extensions/core"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import clsx from "clsx"
import { Music, Play, Square, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

interface CardAudioConfigProps {
  kind?: "question" | "scene"
  sceneAudio?: SceneAudio
  onSceneAudioChange?: (next: SceneAudio | undefined) => void
}

const QUESTION_SLOTS: Array<{
  key: QuestionAudioCueKey
  labelKey: string
  fallback: string
  defaultLoop: boolean
}> = [
  {
    key: "showQuestion",
    labelKey: "extensions:audio.cueShowQuestion",
    fallback: "Show Question",
    defaultLoop: false,
  },
  {
    key: "answersMusic",
    labelKey: "extensions:audio.cueAnswersMusic",
    fallback: "Answering Music (Loop)",
    defaultLoop: true,
  },
  {
    key: "revealResults",
    labelKey: "extensions:audio.cueRevealResults",
    fallback: "Reveal Results",
    defaultLoop: false,
  },
]

const CardAudioConfig = ({
  kind = "question",
  sceneAudio,
  onSceneAudioChange,
}: CardAudioConfigProps = {}) => {
  const { currentQuestionId, extras, setExtras } = useQuizzEditor()
  const { t } = useTranslation()
  const [pickingSlot, setPickingSlot] = useState<
    QuestionAudioCueKey | "scene" | null
  >(null)
  const previewAudioRef = useRef<HTMLAudioElement | null>(null)
  const [playingSlot, setPlayingSlot] = useState<string | null>(null)

  useEffect(
    () => () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause()
        previewAudioRef.current = null
      }
    },
    [currentQuestionId],
  )

  const stopPreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause()
      previewAudioRef.current.currentTime = 0
      previewAudioRef.current = null
    }

    setPlayingSlot(null)
  }

  const togglePreview = (slotKey: string, url?: string, volume = 0.8) => {
    if (playingSlot === slotKey) {
      stopPreview()

      return
    }

    stopPreview()

    if (!url) {
      return
    }
    try {
      const audio = new Audio(url)
      audio.volume = Math.max(0, Math.min(1, volume))
      previewAudioRef.current = audio
      setPlayingSlot(slotKey)
      audio.onended = () => setPlayingSlot(null)
      audio.play().catch(() => setPlayingSlot(null))
    } catch {
      setPlayingSlot(null)
    }
  }

  const currentPerQ =
    currentQuestionId && extras?.perQuestion
      ? extras.perQuestion[currentQuestionId]
      : undefined
  const activeCues: CardAudioOverrides = currentPerQ?.audioCues ?? {}

  const updateQuestionSlot = (
    slot: QuestionAudioCueKey,
    next: CardAudioCueOverride | undefined,
  ) => {
    if (!currentQuestionId) {
      return
    }
    setExtras((prev) => {
      if (!prev) {
        return prev
      }
      const existingPerQ = prev.perQuestion ?? {}
      const existingItem = { ...(existingPerQ[currentQuestionId] ?? {}) }
      const nextCues: CardAudioOverrides = { ...(existingItem.audioCues ?? {}) }

      if (!next || next.mode === "inherit") {
        delete nextCues[slot]
      } else {
        nextCues[slot] = next
      }

      if (Object.keys(nextCues).length === 0) {
        delete existingItem.audioCues
      } else {
        existingItem.audioCues = nextCues
      }

      return {
        ...prev,
        perQuestion: {
          ...existingPerQ,
          [currentQuestionId]: existingItem,
        },
      }
    })
  }

  const handleSelectAudio = (item: UploadedMedia) => {
    if (!pickingSlot) {
      return
    }
    if (pickingSlot === "scene") {
      onSceneAudioChange?.({
        mode: "custom",
        url: item.url,
        volume: sceneAudio?.volume ?? 0.8,
        loop: sceneAudio?.loop ?? false,
      })
    } else {
      const slotMeta = QUESTION_SLOTS.find((s) => s.key === pickingSlot)
      const prev = activeCues[pickingSlot]
      updateQuestionSlot(pickingSlot, {
        mode: "custom",
        url: item.url,
        volume: prev?.volume ?? 0.8,
        loop: prev?.loop ?? slotMeta?.defaultLoop ?? false,
      })
    }

    setPickingSlot(null)
  }

  const renderSlotRow = (
    slotId: QuestionAudioCueKey | "scene",
    label: string,
    override:
      | {
          mode?: CardAudioMode
          url?: string
          volume?: number
          loop?: boolean
        }
      | undefined,
    defaultLoop: boolean,
    onChange: (next: CardAudioCueOverride | undefined) => void,
  ) => {
    const mode: CardAudioMode =
      override?.mode ?? (override?.url ? "custom" : "inherit")
    const url = override?.url
    const volume = override?.volume ?? 0.8
    const loop = override?.loop ?? defaultLoop

    return (
      <div
        key={slotId}
        data-testid={`card-audio-slot-${slotId}`}
        className="border-accent/60 bg-muted/30 flex flex-col gap-2 rounded-xl border p-2.5"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-foreground truncate text-xs font-bold">
            {label}
          </span>
          <div
            data-testid={`card-audio-mode-${slotId}`}
            className="bg-muted flex items-center gap-0.5 rounded-lg p-0.5"
          >
            {(["inherit", "mute", "custom"] as const).map((m) => (
              <button
                key={m}
                type="button"
                data-testid={`card-audio-mode-${slotId}-${m}`}
                onClick={() => {
                  stopPreview()

                  if (m === "inherit") {
                    onChange(undefined)
                  } else if (m === "mute") {
                    onChange({ mode: "mute", volume: 0, loop: false })
                  } else if (url) {
                    onChange({ mode: "custom", url, volume, loop })
                  } else {
                    setPickingSlot(slotId)
                  }
                }}
                className={clsx(
                  "rounded-md px-2 py-0.5 text-[11px] font-semibold transition",
                  mode === m
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "inherit" &&
                  t("extensions:cardAudio.modeInherit", "Inherit")}
                {m === "mute" && t("extensions:cardAudio.modeMute", "Mute")}
                {m === "custom" &&
                  t("extensions:cardAudio.modeCustom", "Custom")}
              </button>
            ))}
          </div>
        </div>

        {mode === "custom" && (
          <div className="border-border/40 flex flex-col gap-2 border-t pt-2">
            <div className="flex items-center justify-between gap-1.5">
              <button
                type="button"
                data-testid={`card-audio-choose-${slotId}`}
                onClick={() => setPickingSlot(slotId)}
                className="bg-accent text-accent-foreground flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold"
              >
                <Music className="text-primary size-3.5 shrink-0" />
                <span className="truncate">
                  {url
                    ? url.split("/").pop()
                    : t("extensions:cardAudio.chooseAudio", "Choose Sound")}
                </span>
              </button>
              {url && (
                <>
                  <button
                    type="button"
                    data-testid={`card-audio-preview-${slotId}`}
                    onClick={() => togglePreview(slotId, url, volume)}
                    title={
                      playingSlot === slotId
                        ? t("extensions:cardAudio.previewStop", "Stop")
                        : t("extensions:cardAudio.previewPlay", "Play")
                    }
                    className="bg-primary/15 text-primary hover:bg-primary/25 flex size-7 shrink-0 items-center justify-center rounded-lg"
                  >
                    {playingSlot === slotId ? (
                      <Square className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    data-testid={`card-audio-remove-${slotId}`}
                    onClick={() => {
                      stopPreview()
                      onChange(undefined)
                    }}
                    title={t(
                      "extensions:cardAudio.removeFromCard",
                      "Remove from Card",
                    )}
                    className="bg-accent text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-lg hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>

            {url && (
              <div className="flex items-center justify-between gap-3 text-[11px]">
                <label className="text-muted-foreground flex items-center gap-1.5 font-semibold">
                  <input
                    type="checkbox"
                    data-testid={`card-audio-loop-${slotId}`}
                    checked={loop}
                    onChange={(e) =>
                      onChange({
                        mode: "custom",
                        url,
                        volume,
                        loop: e.target.checked,
                      })
                    }
                    className="accent-primary rounded"
                  />
                  {t("extensions:cardAudio.loop", "Loop")}
                </label>
                <div className="flex flex-1 items-center gap-1.5">
                  <span className="text-muted-foreground shrink-0 font-semibold">
                    {Math.round(volume * 100)}%
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    data-testid={`card-audio-volume-${slotId}`}
                    value={volume}
                    onChange={(e) =>
                      onChange({
                        mode: "custom",
                        url,
                        volume: Number(e.target.value),
                        loop,
                      })
                    }
                    className="accent-primary w-full cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <ConfigSection
      title={
        kind === "scene"
          ? t("extensions:cardAudio.sceneTitle", "Card Audio")
          : t("extensions:cardAudio.title", "Card Audio Cues")
      }
    >
      <div data-testid="card-audio-section" className="flex flex-col gap-2.5">
        {kind === "scene"
          ? renderSlotRow(
              "scene",
              t("extensions:cardAudio.sceneTitle", "Card Audio"),
              sceneAudio,
              false,
              (next) =>
                onSceneAudioChange?.(
                  next
                    ? {
                        mode: next.mode,
                        url: next.url,
                        volume: next.volume,
                        loop: next.loop ?? false,
                      }
                    : undefined,
                ),
            )
          : QUESTION_SLOTS.map((slot) =>
              renderSlotRow(
                slot.key,
                t(slot.labelKey, slot.fallback),
                activeCues[slot.key],
                slot.defaultLoop,
                (next) => updateQuestionSlot(slot.key, next),
              ),
            )}
      </div>

      <MediaLibrary
        open={pickingSlot !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setPickingSlot(null)
          }
        }}
        onSelect={handleSelectAudio}
        acceptType="audio"
      />
    </ConfigSection>
  )
}

export default CardAudioConfig
