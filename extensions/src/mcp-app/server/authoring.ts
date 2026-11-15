import {
  tadaShowV1Schema,
  preflightShowImport,
  resolveShowTheme,
} from "@razzia/extensions/core"
import { canonicalJson, finiteJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS, summarySchema } from "../contracts/schemas.ts"
import type { AuthoringPolicy, NormalizedDraft } from "./dependencies.ts"
import { ToolError } from "./errors.ts"

const forbidden = new Set([
  "extraJson",
  "roster",
  "phoneRoster",
  "teams",
  "participants",
  "phone",
  "themeOverrides",
  "audioCues",
  "stageAnimations",
  "questionEntrance",
  "questionDecoration",
  "background",
  "overlayAnimations",
  "lottieUrl",
  "audio",
  "volume",
  "audioEvents",
  "showTheme",
])
function policyCheck(
  value: unknown,
  policy: AuthoringPolicy,
  key = "",
  depth = 0,
): void {
  if (depth > 40) throw new ToolError("VALIDATION_FAILED")
  if (typeof value === "string") {
    const urlField = /(?:url|image|src)$/iu.test(key)
    if (value.length > (urlField ? 2048 : 1000))
      throw new ToolError("VALIDATION_FAILED")
    if (urlField && value && !policy.allowedPublicAssetUrls.has(value)) {
      throw new ToolError("VALIDATION_FAILED")
    }
    if (urlField && value) {
      const url = new URL(value)
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      ) {
        throw new ToolError("VALIDATION_FAILED")
      }
    }
    return
  }
  if (!value || typeof value !== "object") return
  for (const [k, child] of Object.entries(value)) {
    if (depth === 0 && k === "defaults") continue // Already matched trusted defaults.
    if (forbidden.has(k)) throw new ToolError("VALIDATION_FAILED")
    policyCheck(child, policy, k, depth + 1)
  }
}
export function normalizeDraft(
  raw: string,
  policy: AuthoringPolicy,
): NormalizedDraft {
  try {
    if (raw.length > LIMITS.authored || utf8Bytes(raw) > LIMITS.authored) {
      throw new ToolError("VALIDATION_FAILED")
    }
    const input: unknown = JSON.parse(raw)
    finiteJson(input)
    const show = tadaShowV1Schema.parse(input)
    if (
      show.settings.length ||
      show.title.length > 160 ||
      show.cards.length > 50
    ) {
      throw new ToolError("VALIDATION_FAILED")
    }
    const questions = show.cards.filter(
      (card) => card.kind === "quiz" || card.kind === "survey",
    )
    if (questions.length > 25) throw new ToolError("VALIDATION_FAILED")
    // Defaults are trusted template inheritance, not a theme/audio mutation input.
    if (
      show.defaults !== undefined &&
      canonicalJson(show.defaults) !==
        canonicalJson(policy.trustedDefaults ?? {})
    ) {
      throw new ToolError("VALIDATION_FAILED")
    }
    policyCheck(input, policy)
    const normalized = tadaShowV1Schema.parse({
      ...show,
      ...(policy.trustedDefaults === undefined
        ? {}
        : { defaults: policy.trustedDefaults }),
    })
    const authoredShowJson = canonicalJson(normalized)
    if (utf8Bytes(authoredShowJson) > LIMITS.authored)
      throw new ToolError("VALIDATION_FAILED")
    // Real existing validator/converter path; validation output is not persisted as
    // freshly-randomized native IDs. Stable native persistence is a separate gate.
    const inspected = preflightShowImport(authoredShowJson, "draft.tada.json")
    if (!inspected.ok || !inspected.normalizedBundleDraft)
      throw new ToolError("VALIDATION_FAILED")
    const theme = resolveShowTheme({
      selection: normalized.defaults?.showTheme,
      role: "manager",
    })
    if (theme.diagnostics.length > 20) throw new ToolError("VALIDATION_FAILED")
    const summary = summarySchema.parse({
      title: normalized.title,
      cardCount: normalized.cards.length,
      questionCount: questions.length,
      themeId: theme.requested.id,
      themeVersion: theme.requested.version,
      diagnostics: theme.diagnostics.map((item) => ({
        code: item.code,
        path: "defaults.showTheme",
        messageKey: "extensions:themes.invalidChoice",
        severity: "warning",
      })),
    })
    return Object.freeze({ authoredShowJson, summary })
  } catch (error) {
    if (error instanceof ToolError) throw error
    throw new ToolError("VALIDATION_FAILED")
  }
}
