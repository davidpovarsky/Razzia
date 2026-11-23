import {
  tadaShowV1Schema,
  preflightShowImport,
  resolveShowTheme,
} from "@razzia/extensions/core"
import { canonicalJson, finiteJson, utf8Bytes } from "../contracts/canonical.ts"
import { LIMITS, summarySchema } from "../contracts/schemas.ts"
import type { AuthoringPolicy, NormalizedDraft } from "./dependencies.ts"
import { ToolError } from "./errors.ts"
import { storedSemanticAdmission } from "./semantic-state.ts"
import type { SemanticAssetOperation } from "../contracts/semantic-edit.ts"

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
  context: {
    key: string
    depth: number
    path: readonly string[]
    storedUrls: ReadonlyMap<string, string>
  },
): void {
  const { key, depth } = context

  if (depth > 40) {
    throw new ToolError("VALIDATION_FAILED")
  }

  if (typeof value === "string") {
    const urlField = /(?:url|image|src)$/iu.test(key)

    if (value.length > (urlField ? 2048 : 1000)) {
      throw new ToolError("VALIDATION_FAILED")
    }

    if (
      urlField &&
      value &&
      !policy.allowedPublicAssetUrls.has(value) &&
      context.storedUrls.get(JSON.stringify(context.path)) !== value
    ) {
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

  if (!value || typeof value !== "object") {
    return
  }

  for (const [k, child] of Object.entries(value)) {
    // Already matched trusted defaults.
    if (depth === 0 && k === "defaults") {
      continue
    }

    if (forbidden.has(k)) {
      throw new ToolError("VALIDATION_FAILED")
    }

    policyCheck(child, policy, {
      ...context,
      key: k,
      depth: depth + 1,
      path: [...context.path, k],
    })
  }
}
// Schema defaults must not introduce fields that the same policy rejects on
// the next read. Explicit forbidden input has already been denied by policyCheck.
// Keep trusted root defaults intact; native parsing still applies its defaults.
function omitGeneratedForbiddenFields(
  value: unknown,
  input: unknown,
  depth = 0,
): unknown {
  if (Array.isArray(value)) {
    return value.map((child, index) =>
      omitGeneratedForbiddenFields(
        child,
        Array.isArray(input) ? input[index] : undefined,
        depth + 1,
      ),
    )
  }

  if (!value || typeof value !== "object") {
    return value
  }

  const original = input && typeof input === "object" ? input : {}

  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !(forbidden.has(k) && !Object.hasOwn(original, k)))
      .map(([k, child]) => [
        k,
        depth === 0 && k === "defaults"
          ? child
          : omitGeneratedForbiddenFields(
              child,
              Reflect.get(original, k),
              depth + 1,
            ),
      ]),
  )
}

function normalize(
  raw: string,
  policy: AuthoringPolicy,
  storedOperation?: SemanticAssetOperation,
): NormalizedDraft {
  try {
    if (raw.length > LIMITS.authored || utf8Bytes(raw) > LIMITS.authored) {
      throw new ToolError("VALIDATION_FAILED")
    }

    const input: unknown = JSON.parse(raw)
    finiteJson(input)
    const stored =
      storedOperation !== undefined && policy.semantic !== undefined
    const storedUrls = stored
      ? storedSemanticAdmission(input, policy, storedOperation)
      : new Map<string, string>()
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

    if (questions.length > 25) {
      throw new ToolError("VALIDATION_FAILED")
    }

    // Defaults are trusted template inheritance, not a theme/audio mutation input.
    if (
      !stored &&
      show.defaults !== undefined &&
      canonicalJson(show.defaults) !==
        canonicalJson(policy.trustedDefaults ?? {})
    ) {
      throw new ToolError("VALIDATION_FAILED")
    }

    policyCheck(input, policy, { key: "", depth: 0, path: [], storedUrls })
    const normalized = tadaShowV1Schema.parse({
      ...show,
      ...(policy.trustedDefaults === undefined ||
      (stored && show.defaults !== undefined)
        ? {}
        : { defaults: policy.trustedDefaults }),
    })
    const authoredShowJson = canonicalJson(
      omitGeneratedForbiddenFields(normalized, input),
    )

    if (utf8Bytes(authoredShowJson) > LIMITS.authored) {
      throw new ToolError("VALIDATION_FAILED")
    }

    // Real existing validator/converter path; validation output is not persisted as
    // freshly-randomized native IDs. Stable native persistence is a separate gate.
    const inspected = preflightShowImport(authoredShowJson, "draft.tada.json")

    if (!inspected.ok || !inspected.normalizedBundleDraft) {
      throw new ToolError("VALIDATION_FAILED")
    }

    const theme = resolveShowTheme({
      selection: normalized.defaults?.showTheme,
      role: "manager",
    })

    if (theme.diagnostics.length > 20) {
      throw new ToolError("VALIDATION_FAILED")
    }

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
    if (error instanceof ToolError) {
      throw error
    }

    throw new ToolError("VALIDATION_FAILED")
  }
}

/** Strict model-authored JSON admission, including for existing enhanced drafts. */
export function normalizeDraft(
  raw: string,
  policy: AuthoringPolicy,
): NormalizedDraft {
  return normalize(raw, policy)
}

/** Strict server-owned canonical state; callers must obtain it from actual authority. */
export function normalizeStoredDraft(
  raw: string,
  policy: AuthoringPolicy,
  operation: SemanticAssetOperation = "store",
): NormalizedDraft {
  return normalize(raw, policy, operation)
}
