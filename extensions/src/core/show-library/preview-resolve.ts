import { resolveShowTheme } from "../show-themes/resolve"
import {
  getCompiledPreviewManifest,
  verifyCompiledPreviewManifest,
} from "./manifest"
import {
  assertValidatedPreviewDraft,
  getPreviewIdentityId,
  type ValidatedPreviewDraft,
} from "./identity"
import { diagnostic, freeze } from "./primitives"
import { previewPlanSchema, type PreviewPlan } from "./preview-schemas"

const plans = new WeakMap<object, ValidatedPreviewDraft>()
export function resolvePreviewPlan(
  draft: ValidatedPreviewDraft,
  manifest: unknown = getCompiledPreviewManifest(),
): Readonly<PreviewPlan> {
  assertValidatedPreviewDraft(draft)
  verifyCompiledPreviewManifest(manifest)
  const theme = resolveShowTheme({
    selection: draft.show.defaults?.showTheme,
    role: draft.input.context.role,
  })
  const questions = draft.show.cards.flatMap((card) =>
    card.kind === "quiz" || card.kind === "survey"
      ? [
          {
            questionId: getPreviewIdentityId(
              draft.input.identityMap,
              "questions",
              card.key,
            ),
            questionType: card.questionType,
            playMode: card.kind,
            answerCount:
              card.questionType === "estimation" ? null : card.answers.length,
            support: "unavailable" as const,
          },
        ]
      : [],
  )
  const plan = freeze(
    previewPlanSchema.parse({
      portVersion: 2,
      resolution: {
        kind: "unavailable",
        requested: { id: theme.requested.id, version: theme.requested.version },
        effective: null,
        pin: null,
      },
      capabilities: {
        localSelection: false,
        reveal: false,
        results: false,
        leaderboard: false,
        seek: "unavailable",
        supportedRoles: [],
        questions,
      },
      diagnostics: [
        diagnostic("adapter-unimplemented"),
        ...theme.diagnostics.map((d) => diagnostic(d.code, d.slot ?? "")),
      ].slice(0, 20),
    }),
  )
  plans.set(plan, draft)
  return plan
}

/** Content identity only. M2 supplies draft/revision and owns the sole MCP envelope digest. */
export function getPreviewDigestContent(
  draft: ValidatedPreviewDraft,
  plan: Readonly<PreviewPlan>,
) {
  assertValidatedPreviewDraft(draft)
  if (plans.get(plan) !== draft)
    throw new Error("show-library:unbound-preview-plan")
  return freeze({
    portVersion: 2 as const,
    identityRuleVersion: 1 as const,
    normalizedAuthoredContent: JSON.parse(
      draft.normalizedAuthoredShowJson,
    ) as unknown,
    identityMap: draft.input.identityMap,
    compiledPin: plan.resolution.pin,
    assetDigests: [...draft.input.assets].sort((a, b) =>
      a.assetId < b.assetId ? -1 : a.assetId > b.assetId ? 1 : 0,
    ),
  })
}
export type PreviewDigestContent = ReturnType<typeof getPreviewDigestContent>
