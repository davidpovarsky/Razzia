import build from "./application-preview-build.json" with { type: "json" }
import { resolveShowTheme } from "../show-themes/resolve"
import { createShowThemeRegistry } from "../show-themes/registry"
import { canonicalJson, sha256 } from "./digest"
import { getPreviewIdentityId } from "./identity"
import {
  assertApplicationPreviewDraft,
  type ApplicationPreviewDraft,
} from "./application-preview-input"
import {
  compiledPreviewManifestSchema,
  previewPlanSchema,
  type PreviewPlan,
} from "./preview-schemas"
import { diagnostic, freeze } from "./primitives"

// This application build is separate from portable/MCP executable acceptance.
// The account provider still resolves source/media rights on every operation.
const manifest = freeze(
  compiledPreviewManifestSchema.parse({
    portVersion: 3,
    identityRuleVersion: 2,
    pins: build.available ? build.pins : [],
  }),
)
const boundShows = new WeakMap<object, ApplicationPreviewDraft["show"]>()

export function getApplicationPreviewManifest() {
  return manifest
}

export function resolveApplicationPreviewPlan(
  draft: ApplicationPreviewDraft,
): Readonly<PreviewPlan> {
  assertApplicationPreviewDraft(draft)
  const { role } = draft.context
  const registry = createShowThemeRegistry(draft.packageContext?.definitions)
  const theme = resolveShowTheme({
    selection: draft.show.defaults?.showTheme,
    role,
    registry,
  })
  const nativePin = manifest.pins.find(
    (candidate) => candidate.renderer.id === theme.definition.rendererId,
  )
  const packagePin =
    theme.definition.kind === "sandboxed-react" &&
    draft.packageContext &&
    theme.definition.runtime &&
    manifest.pins.some(
      (candidate) => candidate.renderer.id === "tadazz-classic-stage",
    )
      ? {
          portVersion: 3 as const,
          identityRuleVersion: 2 as const,
          registry: {
            id: theme.definition.runtime.packageId,
            version: theme.definition.runtime.version,
          },
          registrySha256: sha256(
            canonicalJson(draft.packageContext.definitions),
          ),
          renderer: { id: "tadazz-sandbox-stage", version: "1.0.0" },
          rendererBuildSha256: theme.definition.runtime.buildDigest,
        }
      : undefined
  const pin = packagePin ?? nativePin
  const supported = draft.show.cards.every((card) => {
    const scoped = resolveShowTheme({
      selection: draft.show.defaults?.showTheme,
      scope: card.themeOverrides,
      role,
      registry,
    })

    return (
      scoped.diagnostics.length === 0 &&
      ((card.kind !== "quiz" && card.kind !== "survey") ||
        (card.questionType !== "estimation" &&
          card.answers.length <= 5 &&
          (!card.media || card.media.type !== undefined)))
    )
  })
  const ready = Boolean(
    pin &&
    registry.get(theme.definition.id, theme.definition.version) &&
    theme.requested.id === theme.definition.id &&
    theme.diagnostics.length === 0 &&
    supported,
  )
  const requested = { id: theme.requested.id, version: theme.requested.version }
  const plan = freeze(
    previewPlanSchema.parse({
      portVersion: 3,
      identityRuleVersion: 2,
      resolution:
        ready && pin
          ? {
              kind: "exact",
              requested,
              effective: {
                id: theme.definition.id,
                version: theme.definition.version,
              },
              pin,
            }
          : { kind: "unavailable", requested, effective: null, pin: null },
      capabilities: {
        localSelection: false,
        reveal: ready,
        results: ready,
        leaderboard: ready,
        seek: ready ? "silent-reconstruct" : "unavailable",
        supportedRoles: ready ? ["manager", "player", "spectator"] : [],
        questions: draft.show.cards.flatMap((card) =>
          card.kind === "quiz" || card.kind === "survey"
            ? [
                {
                  questionId: getPreviewIdentityId(
                    draft.identityMap,
                    "questions",
                    card.key,
                  ),
                  questionType: card.questionType,
                  playMode: card.kind,
                  answerCount:
                    card.questionType === "estimation"
                      ? null
                      : card.answers.length,
                  support: ready ? "exact" : "unavailable",
                },
              ]
            : [],
        ),
      },
      diagnostics: [
        ...(ready ? [] : [diagnostic("adapter-unimplemented")]),
        ...theme.diagnostics.map((d) => diagnostic(d.code, d.slot ?? "")),
      ].slice(0, 20),
    }),
  )
  boundShows.set(plan, draft.show)

  return plan
}

export function assertApplicationPreviewPlan(
  show: ApplicationPreviewDraft["show"],
  plan: Readonly<PreviewPlan>,
) {
  if (boundShows.get(plan) !== show || plan.resolution.kind !== "exact") {
    throw new Error("Unbound application preview plan")
  }
}
