import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useReducedMotion } from "motion/react"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_SLOTS,
  createShowThemeRegistry,
  resolveShowTheme,
  showThemeDefinitionSchema,
  showThemeText,
  type ShowThemeDefinition,
  type ShowThemeSlotId,
} from "@razzia/extensions/core"
import { showThemeStyle } from "@razzia/extensions/presentation"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import Loader from "@razzia/web/components/Loader"
import { ensureSession, getClientId } from "@razzia/web/lib/session"
import { SHOW_THEME_PREVIEW_ADAPTERS } from "@razzia/web/features/game/components/tadazz-show/show-theme-adapters"

/** Authenticated native preview. It has no game connection or publication controls. */
export function ThemeInstallationPreview({
  tenantId,
  artifactId,
}: {
  tenantId: string
  artifactId: string
}) {
  const { t, i18n } = useTranslation()
  const reducedMotion = useReducedMotion() ?? false
  const key = `${getClientId()}/${tenantId}/${artifactId}`
  const [loaded, setLoaded] = useState<{
    key: string
    definition: ShowThemeDefinition | null
  } | null>(null)
  const [slot, setSlot] = useState<ShowThemeSlotId>("question")
  const [playing, setPlaying] = useState<string | null>(null)
  const [audioError, setAudioError] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    let alive = true
    void ensureSession()
      .then(async ({ token }) => {
        const response = await fetch(
          `/api/themes/workspaces/${encodeURIComponent(tenantId)}/drafts/${encodeURIComponent(artifactId)}/preview`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            credentials: "same-origin",
            signal: AbortSignal.timeout(15_000),
          },
        )

        if (!response.ok) {
          throw new Error("Preview unavailable")
        }

        const body = (await response.json()) as { definition: unknown }
        const definition = showThemeDefinitionSchema.parse(body.definition)
        const registry = createShowThemeRegistry([definition])

        return registry.get(definition.id, definition.version) ?? null
      })
      .then((definition) => {
        if (alive) {
          setLoaded({ key, definition })
        }
      })
      .catch(() => {
        if (alive) {
          setLoaded({ key, definition: null })
        }
      })

    return () => {
      alive = false
      audio.current?.pause()
      audio.current = null
    }
  }, [key, tenantId, artifactId])
  const definition = loaded?.key === key ? loaded.definition : undefined
  const theme = useMemo(
    () =>
      definition
        ? resolveShowTheme({
            selection: {
              id: definition.id,
              version: definition.version,
              overrides: {},
            },
            role: "manager",
            registry: createShowThemeRegistry([definition]),
          })
        : null,
    [definition],
  )

  if (definition === undefined) {
    return <Loader />
  }

  if (!theme) {
    return (
      <p role="alert" className="p-8">
        {t("extensions:themes.previewUnavailable")}
      </p>
    )
  }

  const Preview = SHOW_THEME_PREVIEW_ADAPTERS[theme.definition.rendererId]

  return (
    <main
      className="bg-background text-foreground flex min-h-svh flex-col gap-4 p-4"
      data-testid="theme-installation-preview"
      data-audio-playing={playing ?? ""}
    >
      <Card className="flex flex-col gap-2 p-4">
        <h1 className="text-xl font-bold">
          {showThemeText(
            theme.definition,
            theme.definition.nameKey,
            i18n.language,
            (labelKey) => t(labelKey),
          )}{" "}
          · {theme.definition.version}
        </h1>
        <p className="text-muted-foreground text-sm">
          {t("extensions:themes.installationPreview")}
        </p>
        <div className="flex flex-wrap gap-2">
          {SHOW_THEME_SLOTS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              disabled={slot === value}
              onClick={() => setSlot(value)}
              data-testid={`theme-preview-slot-${value}`}
            >
              {t(`extensions:themes.slots.${value}`)}
            </Button>
          ))}
        </div>
      </Card>
      <section
        className="relative aspect-video w-full overflow-hidden rounded-lg"
        style={showThemeStyle(theme)}
        data-preview-theme={theme.definition.id}
        data-preview-slot={slot}
      >
        <Preview
          key={`${key}/${slot}`}
          theme={theme}
          slot={slot}
          reducedMotion={reducedMotion}
          previewTitle={t("extensions:themes.preview")}
        />
      </section>
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {SHOW_THEME_AUDIO_EVENTS.map((event) => {
            const choice = theme.audio[event]

            return (
              <Button
                key={event}
                type="button"
                size="sm"
                disabled={!choice.url || choice.silent}
                data-testid={`theme-preview-audio-${event}`}
                onClick={() => {
                  audio.current?.pause()
                  audio.current = null
                  setPlaying(null)
                  setAudioError(false)

                  if (!choice.url) {
                    return
                  }

                  const element = new Audio(choice.url)
                  audio.current = element
                  element.volume = choice.volume
                  element.loop = choice.loop
                  element.onended = () => {
                    if (audio.current === element) {
                      setPlaying(null)
                    }
                  }
                  void element
                    .play()
                    .then(() => {
                      if (audio.current === element) {
                        setPlaying(event)
                      } else {
                        element.pause()
                      }
                    })
                    .catch(() => {
                      if (audio.current === element) {
                        setAudioError(true)
                      }
                    })
                }}
              >
                {t(`extensions:themes.audio.${event}`)}
              </Button>
            )
          })}
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            audio.current?.pause()
            audio.current = null
            setPlaying(null)
          }}
        >
          {t("extensions:themes.stop")}
        </Button>
        {audioError && (
          <p role="status">{t("extensions:themes.previewUnavailable")}</p>
        )}
      </Card>
    </main>
  )
}
