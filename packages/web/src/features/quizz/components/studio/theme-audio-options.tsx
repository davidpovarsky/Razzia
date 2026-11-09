import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  type ResolvedShowTheme,
  type ShowThemeAudioEvent,
  type ThemeOverrides,
  showThemeText,
} from "@razzia/extensions/core"

import Button from "@razzia/web/components/Button"
import Input from "@razzia/web/components/Input"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import { StudioSelect } from "./studio-select"

type Choice = NonNullable<ThemeOverrides["audio"]>[ShowThemeAudioEvent]

export function ThemeAudioOptions({
  theme,
  event,
  value,
  onChange,
}: {
  theme: ResolvedShowTheme
  event: ShowThemeAudioEvent
  value: Choice
  onChange: (value: Choice) => void
}) {
  const { t, i18n } = useTranslation()
  const [picker, setPicker] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [error, setError] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const generation = useRef(0)
  const spec = theme.definition.audioEvents[event]
  const variant =
    spec.variants.find((item) => item.id === value?.variantId) ??
    spec.variants.find((item) => item.id === spec.defaultVariantId) ??
    spec.variants[0]
  const url =
    value?.mediaUrl ??
    theme.definition.assets.find((asset) => asset.id === variant.assetId)?.url
  const muted = value?.muted === true || (variant.silent && !value?.mediaUrl)
  const stop = () => {
    generation.current += 1
    audio.current?.pause()
    setPreviewing(false)
  }
  useEffect(
    () => () => {
      generation.current += 1
      audio.current?.pause()
      audio.current?.removeAttribute("src")
    },
    [],
  )
  useEffect(() => {
    generation.current += 1
    audio.current?.pause()
    // oxlint-disable-next-line react/set-state-in-effect -- Reflect stopping the external preview when its source changes.
    setPreviewing(false)
  }, [url, muted])
  const labels = spec.variants.map((item) => {
    let label = t(`extensions:themes.variants.${item.id.split(".").at(-1)}`)

    if (item.silent) {
      label = t("extensions:themes.silent")
    } else if (item.id.endsWith(".default")) {
      label = t("extensions:themes.default")
    }

    if (theme.definition.localizations) {
      label = showThemeText(
        theme.definition,
        item.labelKey,
        i18n.language,
        (key) => t(key),
      )
    }

    return { value: item.id, label }
  })

  return (
    <div data-testid={`theme-audio-${event}`}>
      <ConfigField>
        <ConfigField.Label label={t(`extensions:themes.audio.${event}`)} />
        {spec.variants.length > 1 && (
          <StudioSelect
            ariaLabel={t(`extensions:themes.audio.${event}`)}
            value={value?.variantId ?? "__inherit"}
            onChange={(variantId) => {
              stop()
              onChange(variantId !== "__inherit" ? { variantId } : undefined)
            }}
            items={[
              { value: "__inherit", label: t("extensions:themes.inherited") },
              ...labels,
            ]}
          />
        )}
        {spec.variants.length === 1 && (
          <p className="text-muted-foreground text-xs">
            {variant.silent
              ? t("extensions:themes.silent")
              : t("extensions:themes.default")}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={!url || muted}
            onClick={() => {
              stop()
              setError(false)
              const player = new Audio(url)
              player.volume = value?.volume ?? variant.volume
              player.onended = () => setPreviewing(false)
              audio.current = player
              const { current } = generation
              void player
                .play()
                .then(() => {
                  if (current === generation.current) {
                    setPreviewing(true)
                  } else {
                    player.pause()
                  }
                })
                .catch(() => {
                  if (current === generation.current) {
                    setError(true)
                  }
                })
            }}
          >
            {t("extensions:themes.preview")}
          </Button>
          {previewing && (
            <Button type="button" size="sm" onClick={stop}>
              {t("extensions:themes.stop")}
            </Button>
          )}
          {spec.customMedia && (
            <Button type="button" size="sm" onClick={() => setPicker(true)}>
              {t("extensions:themes.customMedia")}
            </Button>
          )}
          <Input
            type="range"
            aria-label={t("extensions:audio.volume")}
            min="0"
            max="1"
            step="0.05"
            value={value?.volume ?? variant.volume}
            onChange={(changeEvent) =>
              onChange({ ...value, volume: Number(changeEvent.target.value) })
            }
            className="max-w-32"
          />
        </div>
        {value?.mediaUrl && (
          <p className="text-muted-foreground truncate text-xs">
            {value.mediaUrl.split("/").at(-1)}
          </p>
        )}
        {error && (
          <p role="status" className="text-muted-foreground text-xs">
            {t("extensions:themes.previewUnavailable")}
          </p>
        )}
        <MediaLibrary
          open={picker}
          onOpenChange={setPicker}
          acceptType="audio"
          allowedBuiltinUrls={spec.variants.flatMap((item) =>
            theme.definition.assets
              .filter((asset) => asset.id === item.assetId)
              .map((asset) => asset.url),
          )}
          onSelect={(item) => {
            const approved = spec.variants.find((choice) =>
              theme.definition.assets.some(
                (asset) =>
                  asset.id === choice.assetId && asset.url === item.url,
              ),
            )
            onChange({
              ...(approved
                ? { variantId: approved.id }
                : { mediaUrl: item.url }),
              volume: value?.volume ?? variant.volume,
            })
            setPicker(false)
          }}
        />
      </ConfigField>
    </div>
  )
}
