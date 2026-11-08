/* oxlint-disable eslint/max-params -- Independent test fixtures vary version, renderer lane, family and full asset coverage. */
/** Test-only fixtures; never imported by runtime registration. */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { resolve, join } from "node:path"
import { showThemeRegistry } from "../../core/show-themes/registry"
import {
  showThemeDefinitionSchema,
  SHOW_THEME_LOCALES,
} from "../../core/show-themes/definition"
const publicRoot = resolve(
  import.meta.dirname,
  "../../../../packages/web/public",
)

export const picture = readFileSync(
  join(publicRoot, "tadazz-show/v4/tadazz-brand-logo.png"),
)

export const sound = readFileSync(join(publicRoot, "sounds/answersMusic.mp3"))

const sha = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex")

// Synthetic manifest exists only in tests. No second production theme is registered.
export function createInstallationFixture(
  version = "1.0.0",
  kind: "declarative" | "code-backed" = "declarative",
  themeId = "qa-independent",
  fullAssets = false,
) {
  const definition = structuredClone(showThemeRegistry.classic())
  definition.id = themeId
  for (const slot of Object.values(definition.slots)) {
    slot.defaultVariantId = slot.defaultVariantId.replace(
      "tadazz-classic.",
      `${themeId}.`,
    )
    for (const choice of slot.variants) {
      choice.id = choice.id.replace("tadazz-classic.", `${themeId}.`)
    }
  }
  for (const event of Object.values(definition.audioEvents)) {
    event.defaultVariantId = event.defaultVariantId.replace(
      "tadazz-classic.",
      `${themeId}.`,
    )
    for (const choice of event.variants) {
      choice.id = choice.id.replace("tadazz-classic.", `${themeId}.`)
    }
  }
  for (const cue of Object.values(definition.choreographyCues)) {
    cue.variantId = cue.variantId.replace("tadazz-classic.", `${themeId}.`)
  }
  definition.version = version
  definition.kind = kind
  definition.provenance =
    "Synthetic installation test fixture; never registered in production"

  if (!fullAssets) {
    definition.assets = [
      {
        id: "picture",
        url: "/media/input.png",
        kind: "image",
        sha256: sha(picture),
        bytes: picture.length,
        rights: "owner-authorized",
        provenance: "Repository fixture reused only by test",
        preload: "critical",
      },
      {
        id: "sound",
        url: "/media/input.mp3",
        kind: "audio",
        sha256: sha(sound),
        bytes: sound.length,
        rights: "owner-authorized",
        provenance: "Repository fixture reused only by test",
        preload: "slot",
      },
    ]
    definition.posterAssetId = "picture"
    definition.adapterAssets = {
      questionBackdrop: "picture",
      showBackdrop: "picture",
      brandLogo: "picture",
    }
    for (const slot of Object.values(definition.slots)) {
      for (const variant of slot.variants) {
        for (const field of ["backgroundAssetId", "logoAssetId"] as const) {
          if (variant[field]) {
            variant[field] = "picture"
          }
        }
        delete variant.mediaAssetId
        delete variant.overlayAssetId
      }
    }
    for (const event of Object.values(definition.audioEvents)) {
      for (const variant of event.variants) {
        if (variant.assetId) {
          variant.assetId = "sound"
        }
      }
    }
  } else {
    for (const asset of definition.assets) {
      asset.rights = "owner-authorized"
      asset.provenance =
        "Repository-owned source asset copied solely into the isolated QA fixture; no customer theme or redistribution approval"
    }
  }

  definition.nameKey = "extensions:themes.fixtureName"
  definition.descriptionKey = "extensions:themes.fixtureDescription"
  definition.localizations = {} as NonNullable<typeof definition.localizations>
  const names = {
    en: "Test theme",
    fr: "Thème de test",
    de: "Testthema",
    es: "Tema de prueba",
    it: "Tema di prova",
    ja: "テストテーマ",
    tr: "Test teması",
    vi: "Chủ đề thử nghiệm",
  }
  const keys = [
    ...Object.values(definition.slots),
    ...Object.values(definition.audioEvents),
  ].flatMap((group) => group.variants.map((choice) => choice.labelKey))
  for (const locale of SHOW_THEME_LOCALES) {
    const resources: unknown = JSON.parse(
      readFileSync(
        new URL(`../../locales/${locale}/extensions.json`, import.meta.url),
        "utf8",
      ),
    )
    const values: Record<string, string> = {
      [definition.nameKey]: names[locale],
      [definition.descriptionKey]: names[locale],
    }
    for (const key of keys) {
      let text: unknown = resources
      for (const part of key.split(":")[1].split(".")) {
        text =
          typeof text === "object" && text !== null
            ? (text as Record<string, unknown>)[part]
            : undefined
      }

      if (typeof text !== "string") {
        throw new Error(`Missing fixture label ${locale}/${key}`)
      }

      values[key] = text
    }
    definition.localizations[locale] = values
  }

  return showThemeDefinitionSchema.parse(definition)
}
