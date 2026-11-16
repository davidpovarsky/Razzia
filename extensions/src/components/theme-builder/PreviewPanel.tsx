import type { PreviewPhase } from "../../core/show-library/primitives"
import { Card } from "../../platform-ui"
import { PreviewStageHost } from "../../presentation/show-library-preview/PreviewStageHost"
import { previewText } from "../../presentation/show-library-preview/ui-strings"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { PreviewControls } from "./PreviewControls"
import { useMemo } from "react"
import { GamePreviewSurface } from "../../site/components/game-preview/game-preview-surface"
import type { BuilderDocument } from "./document"
import { SHOW_THEME_AUDIO_EVENTS } from "../../core/show-themes/selection"
import { nativeBuilderText } from "./NativeLibraryPanel"
import { builderText } from "./strings"

export function PreviewPanel({
  locale,
  document,
  quizId,
  initialAuthoredKey,
  phase,
  screenId,
  role = "spectator",
  viewport = "stage-16-9",
}: {
  locale: PreviewLocale
  document?: BuilderDocument
  quizId?: string
  initialAuthoredKey?: string
  phase?: PreviewPhase
  screenId?: string
  role?: "manager" | "player" | "spectator"
  viewport?: string
}) {
  const t = previewText(locale)
  const text = builderText(locale)
  const audioAudition = useMemo(
    () => ({
      label: text("audio"),
      listen: text("listen"),
      stop: text("stopAudio"),
      events: SHOW_THEME_AUDIO_EVENTS.map((id) => ({
        id,
        label: nativeBuilderText(locale, `audio.${id}`),
      })),
    }),
    [locale],
  )
  const appearance = useMemo(
    () =>
      document
        ? { registry: document.registry, document: document.content }
        : undefined,
    [document],
  )

  return (
    <Card aria-label={t("title")}>
      <h2>{t("title")}</h2>
      <p>{t("demo")}</p>
      {quizId ? (
        <div className="theme-builder-live-canvas" data-layout={viewport}>
          <GamePreviewSurface
            selection={{ kind: "account-owned", quizId }}
            label={t("title")}
            appearance={appearance}
            previewRole={role}
            initialAuthoredKey={initialAuthoredKey}
            initialPhase={phase}
            initialScreenId={screenId}
            audioAudition={audioAudition}
            dismissOnOutside={false}
          >
            <div className="theme-builder-preview-poster">{t("title")}</div>
          </GamePreviewSurface>
        </div>
      ) : (
        <>
          <PreviewStageHost unavailable={t("unavailable")} />
          <PreviewControls locale={locale} />
        </>
      )}
    </Card>
  )
}
