// oxlint-disable eslint/max-params -- Preserve the existing explicit identity, revision, role and abort arguments at this adapter boundary.
import { applicationAppearanceSchema } from "./application-preview-schema"
import { resolveApplicationTemplate } from "./application-library"
import type { PreviewPhase, PreviewRole } from "./primitives"
import { applicationCardScopeId } from "./application-composition-pin"

interface Envelope {
  phase?: string
  questionId?: string | null
  extras: Record<string, unknown>
}

/** Presentation mapping only. It never advances or infers authoritative game state. */
export function applicationPhaseForEnvelope(
  envelope: Envelope | null,
  role: PreviewRole,
  status?: string,
): PreviewPhase {
  if (envelope?.phase === "scene") {
    const scene = envelope.extras.currentScene as { kind?: string } | undefined

    if (
      scene?.kind === "opening" ||
      scene?.kind === "closing" ||
      scene?.kind === "leaderboard"
    ) {
      return scene.kind
    }

    return "interlude"
  }

  if (status === "SHOW_START") {
    return "opening"
  }

  if (status === "SHOW_PREPARED" || envelope?.phase === "prepared") {
    return "answerCards"
  }

  if (status === "SHOW_RESULT" && role === "player") {
    return "personalResult"
  }

  if (
    status === "SHOW_RESPONSES" ||
    status === "SHOW_RESULT" ||
    envelope?.phase === "responses"
  ) {
    return "results"
  }

  if (status === "SHOW_LEADERBOARD" || envelope?.phase === "leaderboard") {
    return "leaderboard"
  }

  if (
    status === "FINISHED" ||
    status === "SUMMARY" ||
    envelope?.phase === "finished"
  ) {
    return "closing"
  }

  if (status === "SELECT_ANSWER" || envelope?.phase === "answers") {
    return "voting"
  }

  if (status === "SHOW_QUESTION" || envelope?.phase === "question") {
    return "question"
  }

  if (envelope?.phase === "interlude") {
    return "interlude"
  }

  return "lobby"
}

export function resolveLiveApplicationComposition(
  envelope: Envelope | null,
  role: PreviewRole,
  status?: string,
  phase = applicationPhaseForEnvelope(envelope, role, status),
) {
  const raw = envelope?.extras.applicationCompositionJson

  if (typeof raw !== "string") {
    return envelope?.extras.applicationCompositionUnavailable
      ? { kind: "unavailable" as const }
      : { kind: "none" as const }
  }

  try {
    if (raw.length > 500_000) {
      throw new Error("Composition byte budget")
    }

    const appearance = applicationAppearanceSchema.parse(JSON.parse(raw))
    const scene = envelope?.extras.currentScene as { id?: string } | undefined
    const defaults = envelope?.extras.defaults as
      { showCompositionScopeAliases?: unknown } | undefined
    const scopeId = applicationCardScopeId(
      envelope?.phase === "scene"
        ? scene?.id
        : (envelope?.questionId ?? undefined),
      defaults?.showCompositionScopeAliases,
    )

    return {
      kind: "ready" as const,
      appearance,
      phase,
      template: resolveApplicationTemplate(appearance, role, phase, scopeId),
    }
  } catch {
    return { kind: "unavailable" as const }
  }
}

export function applicationCompositionRenderer(
  envelope: Envelope | null,
  role: PreviewRole,
  status?: string,
) {
  const resolved = resolveLiveApplicationComposition(envelope, role, status)

  if (resolved.kind !== "ready") {
    return null
  }

  const component = resolved.template.nodes.find(
    (node) => node.nodeId === resolved.template.rootNodeId,
  )?.component.id

  const renderers: Partial<
    Record<string, "razzia-native-stage" | "tadazz-classic-stage">
  > = {
    "native.original-stage": "razzia-native-stage",
    "native.cinematic-stage": "tadazz-classic-stage",
  }

  return renderers[component ?? ""] ?? null
}
