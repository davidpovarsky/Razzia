import { Button, Select } from "../../platform-ui"
import { getNativeShowLibrary } from "../../core/show-library/native-library"
import { getNativeAudioLibrary } from "../../core/show-library/native-media-library"
import { getExtensionResources } from "../../locales"
import { createInstance } from "i18next"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import type { BuilderDocument, BuilderEdit } from "./document"
import type { BuilderTextKey } from "./strings"
import type { ThemeOverrides } from "../../core/show-themes/selection"

const labels = createInstance()
void labels.init({
  initAsync: false,
  fallbackLng: false,
  defaultNS: "extensions",
  resources: getExtensionResources(),
})
export function nativeBuilderText(locale: PreviewLocale, key: string) {
  return String(labels.t(`themes.${key}`, { lng: locale }))
}

/** Exact native variants and one existing audio owner; no additional audio clock. */
export function NativeLibraryPanel({
  document,
  locale,
  role,
  scopeId,
  edit,
  readOnly,
  text,
}: {
  document: BuilderDocument
  locale: PreviewLocale
  role: "all" | "manager" | "player" | "spectator"
  scopeId?: string
  edit: (edit: BuilderEdit) => void
  readOnly: boolean
  text: (key: BuilderTextKey) => string
}) {
  const family = getNativeShowLibrary().families.find(
    (f) =>
      f.ref.id === document.content.selection.id &&
      f.ref.version === document.content.selection.version,
  )
  if (!family) return <p>{text("unavailable")}</p>
  const audioEvents = getNativeAudioLibrary().events.flatMap((entry) => {
    const specification = entry.families.find(
      (value) =>
        value.theme.id === family.ref.id &&
        value.theme.version === family.ref.version,
    )
    return specification ? [{ event: entry.event, ...specification }] : []
  })
  const local = document.content.scopes.find(
    (s) => s.scopeId === scopeId,
  )?.selection
  const overrides = scopeId
    ? local?.themeId === family.ref.id &&
      local.themeVersion === family.ref.version
      ? local.overrides
      : {}
    : document.content.selection.overrides
  const section = role === "all" ? overrides : (overrides.roles?.[role] ?? {})
  const change = (next: Pick<ThemeOverrides, "slots" | "audio">) =>
    edit({
      type: "native-overrides",
      ...(scopeId ? { scopeId } : {}),
      value:
        role === "all"
          ? { ...overrides, ...next }
          : {
              ...overrides,
              roles: { ...overrides.roles, [role]: { ...section, ...next } },
            },
    })
  return (
    <details open data-testid="native-theme-library">
      <summary>
        {text("screens")} · 15 / {text("audio")} · 16
      </summary>
      <fieldset className="theme-builder-native-group">
        <legend>{text("screens")}</legend>
        <div className="theme-builder-native-grid">
          {family.visualSlots.map((slot) => (
            <Select
              key={slot.slot}
              label={nativeBuilderText(locale, `slots.${slot.slot}`)}
              value={section.slots?.[slot.slot]?.variantId ?? "inherit"}
              disabled={readOnly}
              onChange={(event) => {
                const slots = { ...section.slots }
                if (event.target.value === "inherit") delete slots[slot.slot]
                else
                  slots[slot.slot] = {
                    ...slots[slot.slot],
                    variantId: event.target.value,
                  }
                change({ slots })
              }}
            >
              <option value="inherit">{text("inherited")}</option>
              {slot.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {String(
                    labels.t(variant.labelKey.replace(/^extensions:/u, ""), {
                      lng: locale,
                    }),
                  )}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </fieldset>
      <fieldset className="theme-builder-native-group">
        <legend>{text("audio")}</legend>
        <div className="theme-builder-native-grid">
          {audioEvents.map((audio) => (
            <Select
              key={audio.event}
              label={nativeBuilderText(locale, `audio.${audio.event}`)}
              value={
                section.audio?.[audio.event]?.muted
                  ? "mute"
                  : (section.audio?.[audio.event]?.variantId ?? "inherit")
              }
              disabled={readOnly}
              onChange={(event) => {
                const choices = { ...section.audio }
                if (event.target.value === "inherit")
                  delete choices[audio.event]
                else
                  choices[audio.event] =
                    event.target.value === "mute"
                      ? { muted: true }
                      : { variantId: event.target.value, muted: false }
                change({ audio: choices })
              }}
            >
              <option value="inherit">{text("inherited")}</option>
              <option value="mute">{text("mute")}</option>
              {audio.variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {String(
                    labels.t(variant.labelKey.replace(/^extensions:/u, ""), {
                      lng: locale,
                    }),
                  )}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </fieldset>
      <Button
        disabled={readOnly}
        onClick={() => change({ slots: {}, audio: {} })}
      >
        {text("reset")}
      </Button>
    </details>
  )
}
