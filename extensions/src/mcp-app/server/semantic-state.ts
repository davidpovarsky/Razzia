import { z } from "zod"
import {
  isTadaShowV1,
  type TadaShowV1,
} from "../../core/show-authoring-schema.ts"
import { tadazzShowBackgroundSchema } from "../../core/tadazz-appearance.ts"
import { studioDefaultsSchema } from "../../core/studio-timeline-schema.ts"
import {
  createDefaultShowTheme,
  showThemeSelectionSchema,
} from "../../core/show-themes/selection.ts"
import { getNativeShowLibrary } from "../../core/show-library/native-library.ts"
import { deriveAuthoredShowPreviewIdentityMap } from "../../core/show-library/identity.ts"
import { canonicalJson, finiteJson } from "../contracts/canonical.ts"
import {
  semanticAssetChoiceSchema,
  semanticAssetRefSchema,
  type ResolvedSemanticAsset,
  type SemanticAssetContext,
  type SemanticAssetOperation,
  type SemanticAssetPurpose,
  type SemanticAssetRef,
  type SemanticLocale,
  type SemanticPatch,
} from "../contracts/semantic-edit.ts"
import type { AuthoringPolicy } from "./dependencies.ts"
import { ToolError } from "./errors.ts"

const reject = () => new ToolError("VALIDATION_FAILED")
const same = (left: unknown, right: unknown) =>
  canonicalJson(left === undefined ? null : left) ===
  canonicalJson(right === undefined ? null : right)
const knownTheme = (theme: { id: string; version: string }) =>
  getNativeShowLibrary().families.some(
    (family) =>
      family.ref.id === theme.id && family.ref.version === theme.version,
  )
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const themeSubset = z.strictObject({
  id: z.string(),
  version: z.string(),
  overrides: z.strictObject({
    audio: z
      .strictObject({
        answersMusic: z
          .strictObject({
            volume: z.number().min(0).max(1).optional(),
            mediaUrl: z.string().max(2048).optional(),
          })
          .optional(),
      })
      .optional(),
  }),
  legacyPolicy: z.enum(["preserve-saved", "theme-defaults"]).optional(),
})

export function readSemanticShow(raw: string): TadaShowV1 {
  const input: unknown = JSON.parse(raw)
  finiteJson(input)

  if (!isTadaShowV1(input)) {
    throw reject()
  }

  return input
}

export function semanticTheme(show: TadaShowV1) {
  const selected = showThemeSelectionSchema.parse(
    show.defaults?.showTheme ?? createDefaultShowTheme(),
  )
  const theme = { id: selected.id, version: selected.version }

  if (!knownTheme(theme)) {
    throw reject()
  }

  return theme
}

const contextFor = (
  show: TadaShowV1,
  purpose: SemanticAssetPurpose,
  operation: SemanticAssetOperation,
): SemanticAssetContext => ({ theme: semanticTheme(show), purpose, operation })

function checkedAsset(
  item: ResolvedSemanticAsset | undefined,
  context: SemanticAssetContext,
): ResolvedSemanticAsset {
  if (!item) {
    throw reject()
  }

  const ref = semanticAssetRefSchema.parse(item.ref)
  const url = new URL(item.publicUrl)

  if (
    !same(ref.theme, context.theme) ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw reject()
  }

  return { ref, publicUrl: item.publicUrl }
}

function resolveSemanticAsset(
  policy: AuthoringPolicy,
  ref: SemanticAssetRef,
  context: SemanticAssetContext,
) {
  const resolver = policy.semantic?.assets

  if (!resolver) {
    throw new ToolError("DEPENDENCY_UNAVAILABLE")
  }

  const result = checkedAsset(resolver.resolveAsset(ref, context), context)

  if (!same(result.ref, ref)) {
    throw reject()
  }

  const reverse = checkedAsset(
    resolver.resolveStoredUrl(result.publicUrl, context),
    context,
  )

  if (!same(reverse, result)) {
    throw reject()
  }

  return result
}

function resolveStored(
  policy: AuthoringPolicy,
  url: string,
  context: SemanticAssetContext,
) {
  const resolver = policy.semantic?.assets

  if (!resolver) {
    throw reject()
  }

  const result = checkedAsset(resolver.resolveStoredUrl(url, context), context)

  if (result.publicUrl !== url) {
    throw reject()
  }

  return resolveSemanticAsset(policy, result.ref, context)
}

/** Validates a server-owned stored state; this is never raw model admission. */
export function storedSemanticAdmission(
  input: unknown,
  policy: AuthoringPolicy,
  operation: SemanticAssetOperation = "store",
): ReadonlyMap<string, string> {
  if (!policy.semantic || !isTadaShowV1(input)) {
    throw reject()
  }

  const show = input
  // Compare the fixed native defaults in their normalized form. The native
  // schema adds these same defaults on serialization; their second read must
  // not grant a broader model authoring policy or invalidate a saved edit.
  const actual =
    show.defaults === undefined
      ? undefined
      : studioDefaultsSchema.partial().parse(show.defaults)
  const baseline = studioDefaultsSchema
    .partial()
    .parse(policy.trustedDefaults ?? {})

  if (!same(actual, baseline) && actual !== undefined) {
    const rest = (value: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([key]) => !["showTheme", "tadazzBackground"].includes(key),
        ),
      )

    if (!same(rest(actual), rest(baseline))) {
      throw reject()
    }

    for (const key of ["showTheme", "tadazzBackground"] as const) {
      const before = baseline[key]
      const value = actual[key]

      if (same(value, before)) {
        continue
      }

      if (value === undefined) {
        throw reject()
      }

      if (key === "showTheme") {
        const selected = themeSubset.parse(
          showThemeSelectionSchema.parse(value),
        )

        if (!knownTheme(selected)) {
          throw reject()
        }

        const url = selected.overrides.audio?.answersMusic?.mediaUrl

        if (url) {
          resolveStored(policy, url, contextFor(show, "audio", operation))
        }
      } else {
        const background = tadazzShowBackgroundSchema.parse(value)

        if (background.mode !== "static" || !background.staticUrl) {
          throw reject()
        }

        resolveStored(
          policy,
          background.staticUrl,
          contextFor(show, "background", operation),
        )
      }
    }
  }

  // Revalidate semantic media even when a stored shape matches trusted defaults.
  const music =
    show.defaults?.showTheme?.overrides?.audio?.answersMusic?.mediaUrl

  if (music && !same(actual, baseline)) {
    resolveStored(policy, music, contextFor(show, "audio", operation))
  }

  const allowed = new Map<string, string>()
  for (const [cardIndex, card] of show.cards.entries()) {
    if (card.kind !== "quiz" && card.kind !== "survey") {
      continue
    }

    for (const [answerIndex, answer] of card.answers.entries()) {
      if (!answer.imageUrl) {
        continue
      }

      if (policy.allowedPublicAssetUrls.has(answer.imageUrl)) {
        continue
      }

      resolveStored(
        policy,
        answer.imageUrl,
        contextFor(show, "answer-image", operation),
      )
      allowed.set(
        JSON.stringify([
          "cards",
          String(cardIndex),
          "answers",
          String(answerIndex),
          "imageUrl",
        ]),
        answer.imageUrl,
      )
    }
  }

  return allowed
}

function question(show: TadaShowV1, publicQuestionId: string) {
  const map = deriveAuthoredShowPreviewIdentityMap(show)
  const identity = map.questions.find(
    (item) => item.previewId === publicQuestionId,
  )
  const card = show.cards.find((item) => item.key === identity?.authoredKey)

  if (!card || (card.kind !== "quiz" && card.kind !== "survey")) {
    throw reject()
  }

  return card
}
function defaults(show: TadaShowV1) {
  show.defaults ??= {}

  return show.defaults
}
function selectedTheme(show: TadaShowV1) {
  const owner = defaults(show)
  const selected = showThemeSelectionSchema.parse(
    owner.showTheme ?? createDefaultShowTheme(),
  )
  owner.showTheme = selected

  return selected
}

export function applySemanticPatch(
  raw: string,
  patch: SemanticPatch,
  policy: AuthoringPolicy,
): string {
  if (!policy.semantic) {
    throw new ToolError("DEPENDENCY_UNAVAILABLE")
  }

  const show = readSemanticShow(raw)

  switch (patch.kind) {
    case "set-title":
      show.title = patch.title

      break

    case "set-question-text":
      question(show, patch.publicQuestionId).question = patch.text

      break

    case "select-theme": {
      if (!knownTheme(patch.theme)) {
        throw reject()
      }

      const selected = selectedTheme(show)
      selected.id = patch.theme.id
      selected.version = patch.theme.version

      break
    }

    case "set-voting-volume": {
      const selected = selectedTheme(show)
      selected.overrides.audio ??= {}
      selected.overrides.audio.answersMusic ??= {}
      selected.overrides.audio.answersMusic.volume = patch.volume

      break
    }

    case "set-voting-music": {
      const asset = resolveSemanticAsset(
        policy,
        patch.asset,
        contextFor(show, "audio", "store"),
      )
      const selected = selectedTheme(show)
      selected.overrides.audio ??= {}
      selected.overrides.audio.answersMusic ??= {}
      selected.overrides.audio.answersMusic.mediaUrl = asset.publicUrl

      break
    }

    case "set-background": {
      const asset = resolveSemanticAsset(
        policy,
        patch.asset,
        contextFor(show, "background", "store"),
      )
      const owner = defaults(show)
      owner.tadazzBackground = tadazzShowBackgroundSchema.parse({
        ...owner.tadazzBackground,
        mode: "static",
        staticUrl: asset.publicUrl,
      })

      break
    }

    case "set-answer-pictures": {
      const card = question(show, patch.publicQuestionId)
      for (const picture of patch.pictures) {
        const index = picture.answerNumber - 1
        const answer = card.answers.at(index)

        if (!answer) {
          throw reject()
        }

        const asset = resolveSemanticAsset(
          policy,
          picture.asset,
          contextFor(show, "answer-image", "store"),
        )
        card.answers[index] = {
          ...answer,
          display: picture.display,
          imageUrl: asset.publicUrl,
          alt: picture.alt,
        }
      }

      break
    }
  }

  return canonicalJson(show)
}

/** Restore one approved selection; neither request nor widget supplies old JSON. */
function restorePath(
  target: Record<string, unknown>,
  before: Record<string, unknown>,
  path: readonly string[],
): void {
  const [key, ...rest] = path

  if (!key) {
    throw reject()
  }

  if (!Object.hasOwn(before, key)) {
    Reflect.deleteProperty(target, key)

    return
  }

  if (!rest.length) {
    target[key] = structuredClone(before[key])

    return
  }

  const original = before[key]

  if (!record(original)) {
    throw reject()
  }

  const child = target[key]

  if (!record(child)) {
    throw reject()
  }

  restorePath(child, original, rest)
}

export function reverseSemanticPatch(
  currentRaw: string,
  beforeRaw: string,
  patch: SemanticPatch,
): string {
  const current = readSemanticShow(currentRaw)
  const before = readSemanticShow(beforeRaw)

  switch (patch.kind) {
    case "set-title":
      current.title = before.title

      break

    case "set-question-text":
      question(current, patch.publicQuestionId).question = question(
        before,
        patch.publicQuestionId,
      ).question

      break

    case "set-answer-pictures": {
      const target = question(current, patch.publicQuestionId)
      const original = question(before, patch.publicQuestionId)
      for (const picture of patch.pictures) {
        const answer = target.answers.at(picture.answerNumber - 1)
        const previous = original.answers.at(picture.answerNumber - 1)

        if (!answer || !previous) {
          throw reject()
        }

        for (const key of ["display", "imageUrl", "alt"]) {
          restorePath(answer, previous, [key])
        }
      }

      break
    }

    default: {
      let path: readonly string[] = []

      if (patch.kind === "select-theme") {
        path = ["defaults", "showTheme"]
      } else if (patch.kind === "set-background") {
        path = ["defaults", "tadazzBackground"]
      } else {
        path = [
          "defaults",
          "showTheme",
          "overrides",
          "audio",
          "answersMusic",
          patch.kind === "set-voting-volume" ? "volume" : "mediaUrl",
        ]
      }

      restorePath(current, before, path)
    }
  }

  return canonicalJson(current)
}

/** Raw model content may not overwrite already-approved presentation/media. */
export function preserveSemanticState(
  currentRaw: string,
  admittedRaw: string,
  policy: AuthoringPolicy,
): string {
  if (!policy.semantic) {
    return admittedRaw
  }

  const current = readSemanticShow(currentRaw)
  const next = readSemanticShow(admittedRaw)

  if (current.defaults !== undefined) {
    next.defaults = structuredClone(current.defaults)
  }

  for (const card of current.cards) {
    if (
      (card.kind !== "quiz" && card.kind !== "survey") ||
      !card.answers.some((answer) => Boolean(answer.imageUrl))
    ) {
      continue
    }

    const target = next.cards.find((item) => item.key === card.key)

    if (
      !target ||
      (target.kind !== "quiz" && target.kind !== "survey") ||
      target.answers.length !== card.answers.length
    ) {
      throw reject()
    }

    for (const [index, answer] of card.answers.entries()) {
      if (!answer.imageUrl) {
        continue
      }

      const previous = target.answers.at(index)

      if (!previous) {
        throw reject()
      }

      target.answers[index] = {
        ...previous,
        display: answer.display,
        imageUrl: answer.imageUrl,
        ...(answer.alt === undefined ? {} : { alt: answer.alt }),
      }
    }
  }

  return canonicalJson(next)
}

export function listSemanticAssets(
  raw: string,
  selection: { purpose: SemanticAssetPurpose; language: SemanticLocale },
  policy: AuthoringPolicy,
) {
  if (!policy.semantic) {
    throw new ToolError("DEPENDENCY_UNAVAILABLE")
  }

  const resolver = policy.semantic.assets

  if (!resolver) {
    return []
  }

  const show = readSemanticShow(raw)
  const context = contextFor(show, selection.purpose, "store")
  const values = resolver.listAssets(context, selection.language)

  if (values.length > 64) {
    throw reject()
  }

  const seen = new Set<string>()

  return values.map((value) => {
    const choice = semanticAssetChoiceSchema.parse(value)
    const approved = resolveSemanticAsset(policy, choice.ref, context)
    const key = canonicalJson(choice.ref)

    if (seen.has(key) || choice.publicUrl !== approved.publicUrl) {
      throw reject()
    }

    seen.add(key)

    return choice
  })
}

/** Snapshot method identities while allowing the deployment to revoke live bytes. */
export function snapshotSemanticPolicy(
  input: import("../contracts/semantic-edit.ts").SemanticAuthoringPolicy,
): import("../contracts/semantic-edit.ts").SemanticAuthoringPolicy {
  const resolver = input.assets

  return Object.freeze({
    ...(resolver
      ? {
          assets: Object.freeze({
            resolveAsset: resolver.resolveAsset.bind(resolver),
            resolveStoredUrl: resolver.resolveStoredUrl.bind(resolver),
            listAssets: resolver.listAssets.bind(resolver),
          }),
        }
      : {}),
  })
}
