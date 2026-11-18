import { REVIEWED_BUILTIN_ASSETS } from "./reviewed-builtin-assets.ts"
import type {
  ResolvedSemanticAsset,
  SemanticAssetChoice,
  SemanticAssetContext,
  SemanticAssetRef,
  SemanticAssetResolver,
  SemanticLocale,
} from "../contracts/semantic-edit.ts"

export interface BuiltinPublicAssetPin {
  readonly path: string
  readonly sha256: string
  readonly bytes: number
}

export interface BuiltinAssetPolicyOptions {
  readonly origin: string
  /** From the exact backend-pinned full-show build manifest. */
  readonly publicAssets: readonly BuiltinPublicAssetPin[]
  /** Revalidates actual deployment bytes/identity; must fail on changed files. */
  readonly verifyCurrentAsset: (asset: BuiltinPublicAssetPin) => boolean
}

type ReviewedAsset = (typeof REVIEWED_BUILTIN_ASSETS)[number]
type LabelKey = ReviewedAsset["label"]
type Labels = Readonly<Record<LabelKey, string>>
const labels: Readonly<Record<SemanticLocale, Labels>> = {
  en: {
    background: "Native background",
    audio: "Native audio",
    purple: "Purple background",
    dog: "Dog",
    lamplighter: "Lamplighter",
    pirate: "Pirate",
    shadchan: "Matchmaker",
    therapist: "Therapist",
  },
  fr: {
    background: "Fond d’origine",
    audio: "Audio d’origine",
    purple: "Fond violet",
    dog: "Chien",
    lamplighter: "Allumeur de réverbères",
    pirate: "Pirate",
    shadchan: "Entremetteur",
    therapist: "Thérapeute",
  },
  de: {
    background: "Originalhintergrund",
    audio: "Originalton",
    purple: "Violetter Hintergrund",
    dog: "Hund",
    lamplighter: "Laternenanzünder",
    pirate: "Pirat",
    shadchan: "Heiratsvermittler",
    therapist: "Therapeut",
  },
  es: {
    background: "Fondo original",
    audio: "Audio original",
    purple: "Fondo morado",
    dog: "Perro",
    lamplighter: "Farolero",
    pirate: "Pirata",
    shadchan: "Casamentero",
    therapist: "Terapeuta",
  },
  it: {
    background: "Sfondo originale",
    audio: "Audio originale",
    purple: "Sfondo viola",
    dog: "Cane",
    lamplighter: "Lampionaio",
    pirate: "Pirata",
    shadchan: "Sensale di matrimoni",
    therapist: "Terapeuta",
  },
  ja: {
    background: "標準の背景",
    audio: "標準の音声",
    purple: "紫の背景",
    dog: "犬",
    lamplighter: "点灯夫",
    pirate: "海賊",
    shadchan: "仲人",
    therapist: "セラピスト",
  },
  tr: {
    background: "Yerleşik arka plan",
    audio: "Yerleşik ses",
    purple: "Mor arka plan",
    dog: "Köpek",
    lamplighter: "Fenerci",
    pirate: "Korsan",
    shadchan: "Çöpçatan",
    therapist: "Terapist",
  },
  vi: {
    background: "Nền có sẵn",
    audio: "Âm thanh có sẵn",
    purple: "Nền tím",
    dog: "Chó",
    lamplighter: "Người thắp đèn",
    pirate: "Cướp biển",
    shadchan: "Người mai mối",
    therapist: "Nhà trị liệu",
  },
}

function boundedAssetPins(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.length <= 10000
}

function currentContext(context: SemanticAssetContext): boolean {
  return (
    (context.operation === "store" ||
      context.operation === "preview" ||
      context.operation === "json-reference-export") &&
    context.theme.version === "1.0.0" &&
    (context.theme.id === "tadazz-classic" ||
      context.theme.id === "razzia-original")
  )
}

function fits(asset: ReviewedAsset, context: SemanticAssetContext): boolean {
  return (
    currentContext(context) &&
    asset.purpose === context.purpose &&
    asset.families.some((family) => family === context.theme.id)
  )
}

function resolved(
  asset: ReviewedAsset,
  context: SemanticAssetContext,
): ResolvedSemanticAsset {
  return Object.freeze({
    ref: Object.freeze({
      assetId: asset.assetId,
      sha256: asset.sha256,
      theme: Object.freeze({ ...context.theme }),
    }),
    publicUrl: `https://tadazz.com${asset.url}`,
  })
}

/**
 * Explicit public built-in media policy. This does not replace current issuer,
 * account/grant or draft CAS checks at the transaction and frame boundaries.
 * Generic media/SVG input remains denied by the existing media readers.
 */
export function createBuiltinAssetResolver(
  options: BuiltinAssetPolicyOptions,
): SemanticAssetResolver {
  if (
    options.origin !== "https://tadazz.com" ||
    typeof options.verifyCurrentAsset !== "function" ||
    !boundedAssetPins(options.publicAssets)
  ) {
    throw new Error("MCP built-in asset policy rejected")
  }

  const pins = new Map<string, BuiltinPublicAssetPin>()
  const { verifyCurrentAsset } = options
  for (const entry of options.publicAssets) {
    if (
      !/^packages\/web\/public\/[A-Za-z0-9_@./-]+$/u.test(entry.path) ||
      entry.path
        .split("/")
        .some((part) => !part || part === "." || part === "..") ||
      !/^[a-f0-9]{64}$/u.test(entry.sha256) ||
      !Number.isSafeInteger(entry.bytes) ||
      entry.bytes <= 0 ||
      entry.bytes > 100_000_000 ||
      pins.has(entry.path)
    ) {
      throw new Error("MCP built-in asset policy rejected")
    }

    pins.set(entry.path, Object.freeze({ ...entry }))
  }

  function admitted(asset: ReviewedAsset, context: SemanticAssetContext) {
    if (!fits(asset, context)) {
      return false
    }

    const pin = pins.get(`packages/web/public${asset.url}`)

    if (!pin || pin.sha256 !== asset.sha256 || pin.bytes !== asset.bytes) {
      return false
    }

    try {
      const decision: unknown = verifyCurrentAsset(pin)

      return decision === true
    } catch {
      return false
    }
  }

  return Object.freeze({
    resolveAsset(ref: SemanticAssetRef, context: SemanticAssetContext) {
      if (
        ref.theme.id !== context.theme.id ||
        ref.theme.version !== context.theme.version
      ) {
        return undefined
      }

      const asset = REVIEWED_BUILTIN_ASSETS.find(
        (entry) =>
          entry.assetId === ref.assetId &&
          entry.sha256 === ref.sha256 &&
          admitted(entry, context),
      )

      return asset ? resolved(asset, context) : undefined
    },
    resolveStoredUrl(url: string, context: SemanticAssetContext) {
      const asset = REVIEWED_BUILTIN_ASSETS.find(
        (entry) =>
          url === `https://tadazz.com${entry.url}` && admitted(entry, context),
      )

      return asset ? resolved(asset, context) : undefined
    },
    listAssets(context: SemanticAssetContext, locale: SemanticLocale) {
      const translations = labels[locale]
      const choices: SemanticAssetChoice[] = []
      const seen = new Set<string>()
      for (const entry of REVIEWED_BUILTIN_ASSETS) {
        if (seen.has(entry.url) || !admitted(entry, context)) {
          continue
        }

        seen.add(entry.url)
        const label =
          entry.label === "audio" || entry.label === "background"
            ? `${translations[entry.label]} · ${entry.assetId}`
            : translations[entry.label]
        choices.push(
          Object.freeze({
            ...resolved(entry, context),
            mime: entry.mime,
            label,
            ...(entry.purpose === "answer-image" ? { alt: label } : {}),
          }),
        )
      }

      if (choices.length > 64) {
        throw new Error("MCP built-in catalog limit exceeded")
      }

      return Object.freeze(choices)
    },
  })
}
