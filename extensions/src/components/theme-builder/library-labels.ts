import { createInstance } from "i18next"
import { getExtensionResources } from "../../locales"
import type { PreviewLocale } from "../../presentation/show-library-preview/i18n"
import { nativeBuilderText } from "./NativeLibraryPanel"
import { builderText } from "./strings"

const labels = createInstance()
void labels.init({
  initAsync: false,
  fallbackLng: false,
  defaultNS: "extensions",
  resources: getExtensionResources(),
})

/** Stable references remain in storage; the authoring surface displays names. */
export function applicationLibraryLabel(locale: PreviewLocale, id: string) {
  const text = builderText(locale)

  if (id === "native.stage") {
    return text("stageComponent")
  }

  if (id === "native.original-stage") {
    return text("originalLayout")
  }

  if (id === "native.cinematic-stage") {
    return text("cinematicLayout")
  }

  if (id === "native.show-title") {
    return text("showTitleComponent")
  }

  if (id === "native.brand") {
    return text("brandComponent")
  }

  if (id.startsWith("native.motion.")) {
    const key = id
      .slice("native.motion.".length)
      .replace(/-([a-z])/gu, (_match, char: string) => char.toUpperCase())

    return labels.t(`entrance.${key}`, { lng: locale })
  }

  const template =
    /^native\.([a-zA-Z]+)\.(flow|grid|original|cinematic)$/u.exec(id)

  if (template) {
    const phase =
      (
        { results: "resultsReveal", voteLocked: "voteLock" } as Record<
          string,
          string
        >
      )[template[1]] ?? template[1]

    const layout = (
      {
        original: "originalLayout",
        cinematic: "cinematicLayout",
        flow: "flow",
        grid: "grid",
      } as const
    )[template[2] as "original" | "cinematic" | "flow" | "grid"]

    return `${nativeBuilderText(locale, `slots.${phase}`)} · ${text(layout)}`
  }

  return id
}
