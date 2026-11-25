import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  createShowThemeRegistry,
  resolveShowTheme,
  showThemeDefinitionSchema,
  type ShowThemeDefinition,
  type RuntimeSnapshot,
  type ShowThemeSlotId,
} from "@razzia/extensions/core"
import { showThemeStyle } from "@razzia/extensions/presentation"
import { ClassicShowThemePreview } from "@razzia/web/features/game/components/tadazz-show/ClassicShowThemePreview"
import { packageJson } from "./package-api"

const slots: Record<RuntimeSnapshot["phase"], ShowThemeSlotId> = {
  opening: "opening",
  lobby: "lobby",
  question: "question",
  answerCards: "answerCards",
  voting: "voting",
  voteLocked: "voteLock",
  results: "resultsReveal",
  leaderboard: "leaderboard",
  interlude: "interlude",
  closing: "closing",
  personalResult: "personalResult",
}

export function PackageDeclarativePreview({
  upload,
  themeId,
  phase,
}: {
  upload: string
  themeId: string
  phase: RuntimeSnapshot["phase"]
}) {
  const { t } = useTranslation()
  const [loaded, setLoaded] = useState<{
    key: string
    definition: ShowThemeDefinition
  } | null>(null)
  const key = `${upload}/${themeId}`
  useEffect(() => {
    let alive = true
    void packageJson<{ definition: unknown }>(
      `/uploads/${upload}/preview/${themeId}`,
    )
      .then(({ definition }) => {
        if (alive) {
          setLoaded({
            key,
            definition: showThemeDefinitionSchema.parse(definition),
          })
        }
      })
      .catch(() => {
        if (alive) {
          setLoaded(null)
        }
      })

    return () => {
      alive = false
    }
  }, [upload, themeId, key])
  const definition = loaded?.key === key ? loaded.definition : null
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

  if (!theme) {
    return <p role="status">{t("extensions:themes.previewUnavailable")}</p>
  }

  return (
    <div
      className="relative h-full w-full"
      style={showThemeStyle(theme)}
      data-declarative-preview={themeId}
    >
      <ClassicShowThemePreview
        key={phase}
        theme={theme}
        slot={slots[phase]}
        reducedMotion={matchMedia("(prefers-reduced-motion: reduce)").matches}
        previewTitle={t("extensions:themes.preview")}
      />
    </div>
  )
}
