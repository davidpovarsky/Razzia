import { REVIEWED_BUILTIN_ASSETS } from "../../mcp-app/native-host/reviewed-builtin-assets"
import type { TadaShowV1 } from "../show-authoring-schema"
import { createDefaultShowTheme } from "../show-themes/selection"

type Purpose = "background" | "answer-image" | "audio"
interface Theme {
  readonly id: string
  readonly version: string
}

export interface ReviewedPreviewReference {
  readonly url: string
  readonly assetId: string
  readonly sha256: string
  readonly bytes: number
  readonly purpose: Purpose
  readonly theme: Theme
}

export interface PreviewAssetBinding {
  readonly url: string
  readonly sha256: string
  readonly bytes: number
}

// A copied, immutable view of the same reviewed deployment table. This is only
// syntax/content validation; the account server separately verifies live bytes.
const reviewed = Object.freeze(
  REVIEWED_BUILTIN_ASSETS.map((entry) =>
    Object.freeze({
      ...entry,
      families: Object.freeze([...entry.families]),
      publicUrl: `https://tadazz.com${entry.url}`,
    }),
  ),
)

export function isReviewedPreviewAssetUrl(url: string): boolean {
  return reviewed.some((entry) => entry.publicUrl === url)
}

/** Only the exact native fields supported by the bounded semantic edit port. */
export function readReviewedPreviewReferences(
  show: TadaShowV1,
): readonly ReviewedPreviewReference[] {
  const selected = show.defaults?.showTheme ?? createDefaultShowTheme()
  const theme = Object.freeze({ id: selected.id, version: selected.version })
  const paths = new Set<string>()
  const references = new Map<string, ReviewedPreviewReference>()
  const admit = (
    route: readonly string[],
    url: string | undefined,
    purpose: Purpose,
  ) => {
    if (!url || !/^https?:/iu.test(url)) {
      return
    }

    const entry = reviewed.find(
      (item) =>
        item.publicUrl === url &&
        item.purpose === purpose &&
        theme.version === "1.0.0" &&
        item.families.some((family) => family === theme.id),
    )

    if (!entry) {
      throw new Error("Unreviewed public preview asset")
    }

    paths.add(route.join("/"))
    references.set(
      url,
      Object.freeze({
        url,
        assetId: entry.assetId,
        sha256: entry.sha256,
        bytes: entry.bytes,
        purpose,
        theme,
      }),
    )
  }
  admit(
    ["defaults", "tadazzBackground", "staticUrl"],
    show.defaults?.tadazzBackground?.staticUrl,
    "background",
  )
  admit(
    ["defaults", "showTheme", "overrides", "audio", "answersMusic", "mediaUrl"],
    show.defaults?.showTheme?.overrides?.audio?.answersMusic?.mediaUrl,
    "audio",
  )
  for (const [cardIndex, card] of show.cards.entries()) {
    if (card.kind !== "quiz" && card.kind !== "survey") {
      continue
    }

    for (const [answerIndex, answer] of card.answers.entries()) {
      admit(
        [
          "cards",
          String(cardIndex),
          "answers",
          String(answerIndex),
          "imageUrl",
        ],
        answer.imageUrl,
        "answer-image",
      )
    }
  }
  const visit = (value: unknown, route: readonly string[] = []) => {
    if (
      typeof value === "string" &&
      /url$/iu.test(route.at(-1) ?? "") &&
      /^https?:/iu.test(value) &&
      !paths.has(route.join("/"))
    ) {
      throw new Error("Unbound public preview asset field")
    }

    if (Array.isArray(value)) {
      value.forEach((item: unknown, index) => {
        visit(item, [...route, String(index)])
      })
    } else if (value && typeof value === "object") {
      for (const [name, item] of Object.entries(value)) {
        visit(item, [...route, name])
      }
    }
  }
  visit(show)

  return Object.freeze([...references.values()])
}

/** No URL prefix, caller-provided digest, or unused public binding grants access. */
export function assertReviewedPreviewBindings(
  show: TadaShowV1,
  bindings: readonly PreviewAssetBinding[],
): void {
  const references = readReviewedPreviewReferences(show)
  for (const binding of bindings) {
    if (binding.url.startsWith("/media/")) {
      continue
    }

    const reference = references.find((item) => item.url === binding.url)

    if (
      !reference ||
      binding.sha256 !== reference.sha256 ||
      binding.bytes !== reference.bytes
    ) {
      throw new Error("Unbound public preview asset bytes")
    }
  }
  for (const reference of references) {
    if (!bindings.some((binding) => binding.url === reference.url)) {
      throw new Error("Missing public preview asset bytes")
    }
  }
}
