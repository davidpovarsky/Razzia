import { compareIdentityKeys, identityPreimage } from "./identity-rule"
import {
  tadaShowV1Schema,
  type TadaShowV1Output,
} from "../show-authoring-schema"
import { showThemeRegistry } from "../show-themes/registry"
import { assertBoundedJson, freeze } from "./primitives"
import { canonicalJson, sha256 } from "./digest"
import {
  previewDraftInputSchema,
  previewIdentityMapSchema,
  type PreviewIdentityMap,
} from "./preview-schemas"

function parseAuthored(json: string): TadaShowV1Output {
  if (new TextEncoder().encode(json).length > 262144) {
    throw new Error("show-library:authored-byte-budget")
  }

  const raw: unknown = JSON.parse(json)
  assertBoundedJson(raw)
  const show = tadaShowV1Schema.parse(raw)

  if (show.cards.length > 128 || show.settings.length !== 0) {
    throw new Error("show-library:preview-subset")
  }

  for (const card of show.cards) {
    if (card.key.length > 160) {
      throw new Error("show-library:card-key-budget")
    }
  }

  return show
}

function identityFor(show: TadaShowV1Output): PreviewIdentityMap {
  const cards: PreviewIdentityMap["cards"] = [],
    questions: PreviewIdentityMap["questions"] = [],
    scenes: PreviewIdentityMap["scenes"] = []
  for (const card of show.cards) {
    cards.push({
      authoredKey: card.key,
      previewId: `preview-card-${sha256(identityPreimage("card", card.key))}`,
    })

    if (card.kind === "quiz" || card.kind === "survey") {
      questions.push({
        authoredKey: card.key,
        previewId: `preview-question-${sha256(identityPreimage("question", card.key))}`,
      })
    } else {
      scenes.push({
        authoredKey: card.key,
        previewId: `preview-scene-${sha256(identityPreimage("scene", card.key))}`,
      })
    }
  }
  for (const entries of [cards, questions, scenes]) {
    entries.sort((a, b) => compareIdentityKeys(a.authoredKey, b.authoredKey))
  }

  return previewIdentityMapSchema.parse({
    identityRuleVersion: 2,
    cards,
    questions,
    scenes,
  })
}

export function getPreviewIdentityId(
  map: PreviewIdentityMap,
  kind: "cards" | "questions" | "scenes",
  authoredKey: string,
): string {
  const entry = map[kind].find((item) => item.authoredKey === authoredKey)

  if (!entry) {
    throw new Error("show-library:missing-identity")
  }

  return entry.previewId
}

export function derivePreviewIdentityMap(
  validatedAuthoredShowJson: string,
): Readonly<PreviewIdentityMap> {
  return freeze(identityFor(parseAuthored(validatedAuthoredShowJson)))
}

// Same stable identity rule for the full first-party application projection.
// This grants no portable renderer or media acceptance.
//
export function deriveAuthoredShowPreviewIdentityMap(
  input: unknown,
): Readonly<PreviewIdentityMap> {
  assertBoundedJson(input)
  const show = tadaShowV1Schema.parse(input)

  if (
    show.cards.length > 128 ||
    show.cards.some((card) => card.key.length > 160)
  ) {
    throw new Error("show-library:preview-subset")
  }

  return freeze(identityFor(show))
}

const validatedDraftBrand: unique symbol = Symbol(
  "show-library.validated-preview-draft",
)

export interface ValidatedPreviewDraft {
  readonly [validatedDraftBrand]: true
  readonly input: Readonly<ReturnType<typeof previewDraftInputSchema.parse>>
  readonly show: Readonly<TadaShowV1Output>
  readonly normalizedAuthoredShowJson: string
}

const validated = new WeakSet<object>()

export function assertValidatedPreviewDraft(
  value: ValidatedPreviewDraft,
): void {
  if (!validated.has(value)) {
    throw new Error("show-library:unvalidated-draft")
  }
}

/** Full author/controller content; never pass this object to a theme component. */
export function normalizePreviewDraft(input: unknown): ValidatedPreviewDraft {
  assertBoundedJson(input)
  const parsed = previewDraftInputSchema.parse(input),
    show = parseAuthored(parsed.authoredShowJson)
  const identityMap = identityFor(show)

  if (canonicalJson(parsed.identityMap) !== canonicalJson(identityMap)) {
    throw new Error("show-library:identity-mismatch")
  }

  const available = new Map(
    showThemeRegistry
      .list()
      .flatMap((theme) =>
        theme.assets.map(
          (asset) => [`${asset.id}/${asset.sha256}`, asset] as const,
        ),
      ),
  )
  const declared = new Map<string, string>()
  const permittedUrls = new Set<string>()
  for (const asset of parsed.assets) {
    if (declared.has(asset.assetId)) {
      throw new Error("show-library:duplicate-asset")
    }

    const existing = available.get(`${asset.assetId}/${asset.sha256}`)

    if (!existing) {
      throw new Error("show-library:asset-unavailable")
    }

    declared.set(asset.assetId, asset.sha256)
    permittedUrls.add(existing.url)
  }
  const checkUrls = (value: unknown): void => {
    if (!value || typeof value !== "object") {
      return
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        /url$/iu.test(key) &&
        typeof child === "string" &&
        child !== "" &&
        !permittedUrls.has(child)
      ) {
        throw new Error("show-library:undeclared-media")
      }

      checkUrls(child)
    }
  }
  checkUrls(show)
  const normalizedAuthoredShowJson = canonicalJson(show)
  const result: ValidatedPreviewDraft = {
    [validatedDraftBrand]: true,
    input: freeze({
      ...parsed,
      authoredShowJson: normalizedAuthoredShowJson,
      identityMap,
    }),
    show: freeze(show),
    normalizedAuthoredShowJson,
  }
  validated.add(result)

  return Object.freeze(result)
}
