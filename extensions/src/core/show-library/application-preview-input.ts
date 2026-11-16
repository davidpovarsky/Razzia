import { z } from "zod"
import { tadaShowV1Schema } from "../show-authoring-schema"
import { showThemeRegistry } from "../show-themes/registry"
import { deriveAuthoredShowPreviewIdentityMap } from "./identity"
import { assertBoundedJson, freeze } from "./primitives"
import { canonicalJson } from "./digest"

const sourceSchema = z.strictObject({
  source: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("account-owned"),
      quizId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u),
      immutableRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
    z.strictObject({
      kind: z.literal("published-demo"),
      catalogueId: z.string().regex(/^[A-Za-z0-9_-]{1,160}$/u),
      immutableRevision: z.string().regex(/^[a-f0-9]{64}$/u),
    }),
  ]),
  show: tadaShowV1Schema,
  assets: z
    .array(
      z.strictObject({
        url: z.string().regex(/^\/media\/[A-Za-z0-9_-]+\.[a-z0-9]+$/u),
        bytes: z.number().int().positive().max(100_000_000),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      }),
    )
    .max(256),
})
const preferencesSchema = z.strictObject({
  locale: z.enum(["en", "fr", "de", "es", "it", "ja", "tr", "vi"]),
  reducedMotion: z.boolean(),
  role: z.enum(["manager", "spectator"]),
})
const validated = new WeakSet<object>()

export interface ApplicationPreviewDraft {
  readonly show: z.infer<typeof tadaShowV1Schema>
  readonly source: z.infer<typeof sourceSchema>["source"]
  readonly assets: z.infer<typeof sourceSchema>["assets"]
  readonly identityMap: ReturnType<typeof deriveAuthoredShowPreviewIdentityMap>
  readonly context: z.infer<typeof preferencesSchema>
}

// Account HTTP authorization is owned by the provider, not by this pure parser.
// Exact account asset URLs/digests are bound separately from portable manifests.
//
export function normalizeApplicationPreviewDraft(
  sourceInput: unknown,
  contextInput: unknown,
): Readonly<ApplicationPreviewDraft> {
  assertBoundedJson(sourceInput)
  assertBoundedJson(contextInput)
  const source = sourceSchema.parse(sourceInput),
    context = preferencesSchema.parse(contextInput)

  if (
    source.source.kind === "published-demo" &&
    (context.role !== "spectator" ||
      source.assets.length ||
      source.show.note ||
      source.show.settings.length ||
      source.show.defaults?.showComposition ||
      source.show.cards.some((card) => "note" in card && card.note))
  ) {
    throw new Error("Private fields in public demonstration")
  }

  if (source.show.settings.some((setting) => setting.scope === "roster")) {
    throw new Error("Private account preview settings")
  }

  if (
    new TextEncoder().encode(canonicalJson(source.show)).byteLength > 262144
  ) {
    throw new Error("Account preview byte budget")
  }

  if (
    new Set(source.assets.map((asset) => asset.url)).size !==
      source.assets.length ||
    source.assets.reduce((total, asset) => total + asset.bytes, 0) > 200_000_000
  ) {
    throw new Error("Invalid account preview assets")
  }

  const permitted = new Set([
    ...source.assets.map((asset) => asset.url),
    ...showThemeRegistry
      .list()
      .flatMap((theme) => theme.assets.map((asset) => asset.url)),
  ])
  const visit = (value: unknown, key = "") => {
    if (
      typeof value === "string" &&
      ((/url$/iu.test(key) && value !== "") || value.startsWith("/media/")) &&
      !permitted.has(value)
    ) {
      throw new Error("Unbound account preview asset")
    }

    if (Array.isArray(value)) {
      value.forEach((item) => {
        visit(item)
      })
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([name, item]) => {
        visit(item, name)
      })
    }
  }
  visit(source.show)
  const draft = freeze({
    ...source,
    context,
    identityMap: deriveAuthoredShowPreviewIdentityMap(source.show),
  })
  validated.add(draft)

  return draft
}

export function assertApplicationPreviewDraft(draft: ApplicationPreviewDraft) {
  if (!validated.has(draft)) {
    throw new Error("Unvalidated application preview draft")
  }
}
