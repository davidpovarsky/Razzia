import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  createDefaultShowTheme,
  resolveShowTheme,
  savedThemeScope,
  updateScopedTheme,
  resetThemeSection,
  type ThemeOverrides,
  type ShowThemeAudioEvent,
  type ShowThemeSlotId,
  type ScopedThemeOverrides,
} from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import ConfigSection from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigSection"
import { useQuizzEditor } from "@razzia/web/features/quizz/contexts/quizz-editor-context"
import { useStudioEditor } from "./studio-editor-context"
import { ThemeAudioOptions } from "./theme-audio-options"
import { StudioSelect } from "./studio-select"
import { useInstalledThemeCatalog } from "./installed-theme-catalog"
import { showThemeText } from "@razzia/extensions/core"

function omitKeys<T extends object>(value: T, keys: readonly string[]): T {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  ) as T
}
function legacyReset(
  section: "audio" | "background" | "motion",
  scene: boolean,
  reset: boolean,
) {
  if (!reset) {
    return {}
  }

  if (section === "background") {
    return { background: undefined }
  }

  if (section === "audio") {
    return scene ? { audio: undefined } : { audioCues: undefined }
  }

  if (scene) {
    return { stageAnimations: undefined }
  }

  return {
    stageAnimations: undefined,
    questionEntrance: undefined,
    questionDecoration: undefined,
  }
}

export function ThemeScopeControls({
  section,
  kind = "question",
}: {
  section: "audio" | "background" | "motion"
  kind?: "question" | "scene"
}) {
  const { t, i18n } = useTranslation()
  const registry = useInstalledThemeCatalog()
  const { defaults, selectedTimelineItem, scenes, updateSceneConfig } =
    useStudioEditor()
  const { extras, setExtras, currentQuestionId } = useQuizzEditor()
  const [picker, setPicker] = useState(false)
  const [archiveFull, setArchiveFull] = useState(false)
  const sceneId =
    kind === "scene" &&
    selectedTimelineItem &&
    selectedTimelineItem.kind !== "question"
      ? selectedTimelineItem.sceneId
      : undefined
  const questionCard = currentQuestionId
    ? extras?.perQuestion[currentQuestionId]
    : undefined
  const card = sceneId ? scenes[sceneId] : questionCard
  const selection = defaults.showTheme ?? createDefaultShowTheme()
  const theme = resolveShowTheme({
    selection,
    scope: card?.themeOverrides,
    role: "manager",
    registry,
  })
  const compatible =
    card?.themeOverrides?.themeId === selection.id &&
    card.themeOverrides.themeVersion === selection.version
  const local = savedThemeScope(card?.themeOverrides, selection)
  const slot: ShowThemeSlotId = kind === "question" ? "question" : "interlude"
  const spec = theme.definition.slots[slot]
  const backgroundSlots: ShowThemeSlotId[] =
    kind === "question"
      ? ["question", "answerCards", "voting", "resultsReveal"]
      : ["interlude"]
  const change = (overrides: ThemeOverrides, reset = false) => {
    let themeOverrides: ScopedThemeOverrides | null = null

    try {
      themeOverrides = updateScopedTheme(
        card?.themeOverrides,
        selection,
        overrides,
      )
    } catch {
      setArchiveFull(true)

      return
    }

    const cleared = legacyReset(section, Boolean(sceneId), reset)

    if (sceneId) {
      updateSceneConfig(sceneId, { themeOverrides, ...cleared })

      return
    }

    if (!currentQuestionId) {
      return
    }

    setExtras((previous) =>
      previous
        ? {
            ...previous,
            perQuestion: {
              ...previous.perQuestion,
              [currentQuestionId]: {
                ...previous.perQuestion[currentQuestionId],
                ...cleared,
                themeOverrides,
              },
            },
          }
        : previous,
    )
  }
  const audioEvents: ShowThemeAudioEvent[] =
    kind === "question"
      ? ["showQuestion", "answersMusic", "revealResults"]
      : ["zzTransition", "revealResults", "closing"]
  const reset = () => {
    const next = resetThemeSection(local, {
      section,
      slots: backgroundSlots,
      events: audioEvents,
    })
    change(next, true)
  }

  return (
    <ConfigSection title={t(`extensions:themes.sections.${section}`)}>
      <p className="text-muted-foreground text-xs">
        {t("extensions:themes.scopeDescription")}
      </p>
      {archiveFull && (
        <p role="alert" className="text-muted-foreground text-xs">
          {t("extensions:themes.archiveFull")}
        </p>
      )}
      {card?.themeOverrides && !compatible && (
        <p role="status" className="text-muted-foreground text-xs">
          {t("extensions:themes.invalidChoice")}
        </p>
      )}
      {section === "audio" ? (
        audioEvents.map((event) => (
          <ThemeAudioOptions
            key={event}
            theme={theme}
            event={event}
            value={local.audio?.[event]}
            onChange={(choice) => {
              const audio = { ...local.audio }

              if (choice) {
                audio[event] = choice
              } else {
                change({ ...local, audio: omitKeys(audio, [event]) })

                return
              }

              change({ ...local, audio })
            }}
          />
        ))
      ) : (
        <>
          {spec.variants.length > 1 && (
            <StudioSelect
              value={local.slots?.[slot]?.variantId ?? "__inherit"}
              items={[
                { value: "__inherit", label: t("extensions:themes.inherited") },
                ...spec.variants.map((variant) => ({
                  value: variant.id,
                  label: showThemeText(
                    theme.definition,
                    variant.labelKey,
                    i18n.language,
                    (key) => t(key),
                  ),
                })),
              ]}
              onChange={(variantId) =>
                change({
                  ...local,
                  slots: {
                    ...local.slots,
                    [slot]: variantId !== "__inherit" ? { variantId } : {},
                  },
                })
              }
            />
          )}
          <p className="text-muted-foreground text-xs">
            {section === "motion"
              ? t("extensions:themes.motionOwned")
              : t("extensions:themes.inherited")}
          </p>
          {section === "background" && spec.customMedia !== "none" && (
            <Button type="button" size="sm" onClick={() => setPicker(true)}>
              {t("extensions:themes.customMedia")}
            </Button>
          )}
          {section === "background" && theme.slots[slot].mediaUrl && (
            <img
              className="h-20 w-full rounded-lg object-cover"
              src={theme.slots[slot].mediaUrl}
              alt=""
            />
          )}
        </>
      )}
      <Button
        type="button"
        size="sm"
        className="bg-accent text-accent-foreground"
        onClick={reset}
      >
        {t("extensions:themes.sectionReset")}
      </Button>
      <MediaLibrary
        open={picker}
        onOpenChange={setPicker}
        acceptType="image"
        onSelect={(item) => {
          const slots = { ...local.slots }
          for (const key of backgroundSlots) {
            slots[key] = { mediaUrl: item.url, fit: "cover" }
          }
          change({ ...local, slots })
          setPicker(false)
        }}
      />
    </ConfigSection>
  )
}
