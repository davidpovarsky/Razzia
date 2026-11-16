// oxlint-disable eslint/max-params -- Preserve the existing explicit identity, revision, role and abort arguments at this adapter boundary.
import { RUNTIME_PHASES } from "../packages/protocol"
import { STAGE_ANIMATION_PRESETS } from "../card-appearance"
import { createShowLibraryRegistry } from "./registry"
import { canonicalJson } from "./digest"
import { resolveCompositionSections } from "./assets"
import type { z } from "zod"
import type { applicationAppearanceSchema } from "./application-preview-schema"
import type { PreviewPhase, PreviewRole } from "./primitives"

const ref = (id: string) => ({ id, version: "1.0.0" })
const extraIds = ["native.show-title", "native.brand"]
const bindings: Record<string, string[]> = {
  lobby: ["join"],
  question: ["question"],
  answerCards: ["choices"],
  voting: ["choices", "clock"],
  voteLocked: ["choices"],
  results: ["choice-results"],
  leaderboard: ["leaderboard"],
  personalResult: ["personal-result"],
}
const capabilities: Record<string, string[]> = {
  lobby: ["real-join-and-lock", "phone-if-enabled"],
  question: ["current-question"],
  answerCards: ["complete-answer-set"],
  voting: ["complete-answer-set", "server-clock"],
  voteLocked: ["complete-answer-set"],
  results: ["authorized-reveal"],
  leaderboard: ["public-leaderboard"],
  personalResult: ["own-player-result"],
}
const base = {
  availability: "candidate",
  propsProfile: "bounded-view-v1",
  fallback: "whole-template",
  reducedMotion: "same-theme-static",
  capabilities: {
    questionTypes: ["single", "multi", "estimation"],
    playModes: ["quiz", "survey"],
    minAnswers: 2,
    maxAnswers: 64,
    roles: ["manager", "player", "spectator"],
    phases: [...RUNTIME_PHASES],
  },
  provenance:
    "Source-controlled application-preview-stage / application-composition: existing native stage, BrandLogo and original QuestionEntrance adapters. No gameplay authority.",
  a11yLabelKey: "extensions:themes.preview",
}
const motions = STAGE_ANIMATION_PRESETS.map((preset) => ({
  ...ref(`native.motion.${preset}`),
  kind: "element",
  availability: "candidate",
  ports: ["decoration"],
  components: extraIds.map(ref),
  durationMs: 800,
  staggerMs: 90,
  seek: "unavailable",
  reducedMotion: "same-theme-static",
}))
const registry = createShowLibraryRegistry({
  schemaVersion: 1,
  ...ref("tadazz-native-application"),
  motions,
  components: [
    {
      ...base,
      ...ref("native.stage"),
      adapterId: "native-application-stage",
      allowedPorts: ["stage-root"],
      childPorts: [
        {
          id: "decoration",
          allowedComponents: extraIds.map(ref),
          maxChildren: 8,
        },
      ],
      bindings: [...new Set(Object.values(bindings).flat())],
      motions: [],
    },
    ...["native.original-stage", "native.cinematic-stage"].map((id) => ({
      ...base,
      ...ref(id),
      adapterId: id,
      allowedPorts: ["stage-root"],
      childPorts: [
        {
          id: "decoration",
          allowedComponents: extraIds.map(ref),
          maxChildren: 8,
        },
      ],
      bindings: [...new Set(Object.values(bindings).flat())],
      motions: [],
    })),
    ...extraIds.map((id) => ({
      ...base,
      ...ref(id),
      adapterId: id,
      allowedPorts: ["decoration"],
      childPorts: [],
      bindings: ["show-brand"],
      motions: motions.map(({ id: motionId, version }) => ({
        id: motionId,
        version,
      })),
    })),
  ],
  templates: RUNTIME_PHASES.flatMap((phase) =>
    ["flow", "grid", "original", "cinematic"].map((layout) => ({
      ...ref(`native.${phase}.${layout}`),
      availability: "candidate",
      phase,
      roles:
        phase === "personalResult"
          ? ["player"]
          : ["manager", "player", "spectator"],
      rootNodeId: "stage",
      layouts: ["stage-16-9", "safe-4-3", "narrow-player"],
      requiredSystemCapabilities: capabilities[phase] ?? [],
      fallback: "whole-template",
      nodes: [
        {
          nodeId: "stage",
          component: ref(
            (
              {
                original: "native.original-stage",
                cinematic: "native.cinematic-stage",
              } as Record<string, string>
            )[layout] ?? "native.stage",
          ),
          port: "stage-root",
          props: {},
          bindings: Object.fromEntries(
            (bindings[phase] ?? []).map((binding) => [binding, binding]),
          ),
          layout: {
            preset: layout === "grid" ? "grid" : "flow",
            alignment: "center",
            gap: "medium",
            lane: "content",
          },
          motions: [],
          children: { decoration: layout === "grid" ? ["brand", "title"] : [] },
        },
        ...(layout === "grid"
          ? extraIds.map((id, n) => ({
              nodeId: n ? "brand" : "title",
              component: ref(id),
              port: "decoration",
              props: {},
              bindings: { "show-brand": "show-brand" },
              layout: {
                preset: "flow",
                alignment: "center",
                gap: "small",
                lane: "decoration",
              },
              motions: [],
              children: {},
            }))
          : []),
      ],
    })),
  ),
})

/** Exact component definitions are fixed; only bounded template graphs are authored. */
export function getApplicationShowLibrary() {
  return registry
}

export function resolveApplicationTemplate(
  appearance: z.infer<typeof applicationAppearanceSchema>,
  role: PreviewRole,
  phase: PreviewPhase,
  scopeId?: string,
) {
  const candidate = createShowLibraryRegistry(appearance.registry)

  if (
    candidate.id !== registry.id ||
    candidate.version !== registry.version ||
    canonicalJson(candidate.components) !==
      canonicalJson(registry.components) ||
    canonicalJson(candidate.motions) !== canonicalJson(registry.motions)
  ) {
    throw new Error("Unsupported component registry")
  }

  const sections = resolveCompositionSections(
    appearance.document.composition,
    role,
    scopeId,
  )
  const requested = sections.templates?.[phase]
  const template = candidate.templates.find((t) =>
    requested
      ? t.id === requested.id && t.version === requested.version
      : t.id === `native.${phase}.flow`,
  )

  if (!template || template.phase !== phase || !template.roles.includes(role)) {
    throw new Error("Unsupported screen template")
  }

  return template
}
