import { useState } from "react"
import { useTranslation } from "react-i18next"
import {
  SHOW_THEME_AUDIO_EVENTS,
  SHOW_THEME_SLOTS,
  createDefaultShowTheme,
  isLegacyShowRollback,
  resetThemeScope,
  resolveShowTheme,
  showThemeRegistry,
  type ShowThemeSelection,
  type ThemeOverrides,
} from "@razzia/extensions/core"
import Button from "@razzia/web/components/Button"
import Card from "@razzia/web/components/Card"
import AlertDialog from "@razzia/web/components/AlertDialog"
import MediaLibrary from "@razzia/web/features/quizz/components/QuestionEditor/MediaLibrary"
import ConfigField from "@razzia/web/features/quizz/components/QuestionEditor/QuestionEditorConfig/ConfigField"
import { useStudioEditor } from "./studio-editor-context"
import { StudioSelect } from "./studio-select"
import { ThemeAudioOptions } from "./theme-audio-options"
import { ShowThemePreview } from "./show-theme-preview"

export function ShowThemeSettings() {
  const { t } = useTranslation()
  const { defaults, updateDefaults } = useStudioEditor()
  const [pending, setPending] = useState<ShowThemeSelection | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [pickingSlot, setPickingSlot] = useState<
    (typeof SHOW_THEME_SLOTS)[number] | null
  >(null)
  const [archiveFull, setArchiveFull] = useState(false)
  const selected = defaults.showTheme ?? createDefaultShowTheme()
  const theme = resolveShowTheme({ selection: selected, role: "manager" })
  const update = (overrides: ThemeOverrides) =>
    updateDefaults({ showTheme: { ...selected, overrides } })
  const choose = (next: ShowThemeSelection) => {
    const history = defaults.themeHistory ?? []
    const archived = history.filter(
      (item) =>
        (item.id !== selected.id || item.version !== selected.version) &&
        (item.id !== next.id || item.version !== next.version),
    )

    if (archived.length >= 32) {
      setArchiveFull(true)

      return
    }

    updateDefaults({
      showTheme: { ...next, legacyPolicy: "theme-defaults" },
      motionKit: undefined,
      themeHistory: defaults.showTheme
        ? [...archived, structuredClone(selected)]
        : history,
    })
    setPending(null)
  }

  return (
    <div className="w-full" data-testid="show-theme-settings">
      <Card className="flex w-full max-w-none flex-col gap-5 p-6 md:p-8">
        <h2 className="text-foreground text-lg font-bold">
          {t("extensions:themes.title")}
        </h2>
        {theme.diagnostics.length > 0 && (
          <p role="status" className="text-muted-foreground text-sm">
            {t("extensions:themes.unknownTheme")}
          </p>
        )}
        {archiveFull && (
          <p role="alert" className="text-muted-foreground text-sm">
            {t("extensions:themes.archiveFull")}
          </p>
        )}
        {showThemeRegistry.list().map((definition) => {
          const poster = definition.assets.find(
            (asset) => asset.id === definition.posterAssetId,
          )
          const active =
            !isLegacyShowRollback(defaults) &&
            selected.id === definition.id &&
            selected.version === definition.version

          return (
            <div
              key={`${definition.id}@${definition.version}`}
              className="border-accent flex flex-wrap items-center gap-4 rounded-xl border p-4"
              data-testid={`show-theme-${definition.id}`}
            >
              <img
                src={poster?.url}
                alt=""
                className="aspect-video w-36 rounded-lg object-cover"
                loading="lazy"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-foreground font-semibold">
                  {t(definition.nameKey)} · {definition.version}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t(definition.descriptionKey)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={active}
                onClick={() => {
                  const previous = defaults.themeHistory?.find(
                    (item) =>
                      item.id === definition.id &&
                      item.version === definition.version,
                  )
                  const next = previous ?? {
                    id: definition.id,
                    version: definition.version,
                    overrides: {},
                  }

                  if (
                    defaults.showTheme &&
                    (Object.keys(selected.overrides).length > 0 ||
                      selected.id !== next.id)
                  ) {
                    setPending(next)
                  } else {
                    choose(next)
                  }
                }}
              >
                {active
                  ? t("extensions:themes.active")
                  : t("extensions:themes.select")}
              </Button>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => setShowPreview((value) => !value)}
          >
            {t("extensions:themes.preview")}
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-accent text-accent-foreground"
            onClick={() =>
              updateDefaults({ showTheme: resetThemeScope(selected) })
            }
          >
            {t("extensions:themes.reset")}
          </Button>
        </div>
        {showPreview && <ShowThemePreview />}
        {!isLegacyShowRollback(defaults) && (
          <>
            <details className="border-accent rounded-lg border p-3">
              <summary className="text-foreground cursor-pointer text-sm font-semibold">
                {t("extensions:themes.sections.visuals")}
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SHOW_THEME_SLOTS.map((slot) => {
                  const spec = theme.definition.slots[slot]
                  const local = selected.overrides.slots?.[slot]

                  return (
                    <ConfigField key={slot}>
                      <ConfigField.Label
                        label={t(`extensions:themes.slots.${slot}`)}
                      />
                      {spec.variants.length > 1 ? (
                        <StudioSelect
                          value={local?.variantId ?? "__inherit"}
                          items={[
                            {
                              value: "__inherit",
                              label: t("extensions:themes.default"),
                            },
                            ...spec.variants.map((item) => ({
                              value: item.id,
                              label: t(item.labelKey),
                            })),
                          ]}
                          onChange={(variantId) =>
                            update({
                              ...selected.overrides,
                              slots: {
                                ...selected.overrides.slots,
                                [slot]:
                                  variantId !== "__inherit"
                                    ? { variantId }
                                    : {},
                              },
                            })
                          }
                        />
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          {t("extensions:themes.default")}
                        </p>
                      )}
                      {spec.customMedia !== "none" && (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => setPickingSlot(slot)}
                        >
                          {t("extensions:themes.customMedia")}
                        </Button>
                      )}
                      {local?.mediaUrl && (
                        <p className="text-muted-foreground truncate text-xs">
                          {local.mediaUrl.split("/").at(-1)}
                        </p>
                      )}
                    </ConfigField>
                  )
                })}
              </div>
            </details>
            <details className="border-accent rounded-lg border p-3">
              <summary className="text-foreground cursor-pointer text-sm font-semibold">
                {t("extensions:themes.sections.audio")}
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SHOW_THEME_AUDIO_EVENTS.map((event) => (
                  <ThemeAudioOptions
                    key={event}
                    theme={theme}
                    event={event}
                    value={selected.overrides.audio?.[event]}
                    onChange={(choice) => {
                      const audio = { ...selected.overrides.audio }

                      if (choice) {
                        audio[event] = choice
                      } else {
                        update({
                          ...selected.overrides,
                          audio: Object.fromEntries(
                            Object.entries(audio).filter(
                              ([key]) => key !== event,
                            ),
                          ),
                        })

                        return
                      }

                      update({ ...selected.overrides, audio })
                    }}
                  />
                ))}
              </div>
            </details>
          </>
        )}
        <MediaLibrary
          open={pickingSlot !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPickingSlot(null)
            }
          }}
          acceptType="image"
          onSelect={(item) => {
            if (pickingSlot) {
              update({
                ...selected.overrides,
                slots: {
                  ...selected.overrides.slots,
                  [pickingSlot]: { mediaUrl: item.url, fit: "cover" },
                },
              })
            }

            setPickingSlot(null)
          }}
        />
        <AlertDialog
          open={pending !== null}
          onOpenChange={(open) => {
            if (!open) {
              setPending(null)
            }
          }}
          title={t("extensions:themes.switchTitle")}
          description={t("extensions:themes.switchDescription")}
          confirmLabel={t("extensions:themes.select")}
          onConfirm={() => {
            if (pending) {
              choose(pending)
            }
          }}
        />
      </Card>
    </div>
  )
}
