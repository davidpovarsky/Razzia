// oxlint-disable eslint/max-params -- Preserve the existing explicit identity, revision, role and abort arguments at this adapter boundary.
import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useReducedMotion } from "motion/react"
import type { ExtensionStateEnvelope } from "../../core/state"
import type {
  PreviewPhase,
  PreviewRole,
} from "../../core/show-library/primitives"
import { resolveLiveApplicationComposition } from "../../core/show-library/application-live-composition"
import { NativeComposition } from "../show-library-preview/application-composition"
import { applicationCardScopeId } from "../../core/show-library/application-composition-pin"

export function useNativeCompositionResolution(
  envelope: ExtensionStateEnvelope | null,
  role: PreviewRole,
  statusName?: string,
  phase?: PreviewPhase,
) {
  const json = envelope?.extras.applicationCompositionJson,
    unavailable = envelope?.extras.applicationCompositionUnavailable
  const scene = envelope?.extras.currentScene as
    { id?: string; kind?: string } | undefined
  const defaults = envelope?.extras.defaults as
    { showCompositionScopeAliases?: unknown } | undefined
  const sceneId = applicationCardScopeId(
      scene?.id,
      defaults?.showCompositionScopeAliases,
    ),
    sceneKind = scene?.kind,
    envelopePhase = envelope?.phase,
    questionId = applicationCardScopeId(
      envelope?.questionId ?? undefined,
      defaults?.showCompositionScopeAliases,
    )

  return useMemo(
    () =>
      resolveLiveApplicationComposition(
        {
          phase: envelopePhase,
          questionId,
          extras: {
            applicationCompositionJson: json,
            applicationCompositionUnavailable: unavailable,
            currentScene: { id: sceneId, kind: sceneKind },
          },
        },
        role,
        statusName,
        phase,
      ),
    [
      json,
      unavailable,
      envelopePhase,
      questionId,
      sceneId,
      sceneKind,
      role,
      statusName,
      phase,
    ],
  )
}

/** One shared bounded layout around the real room content. Host controls stay outside. */
export function NativeCompositionBoundary({
  envelope,
  role,
  statusName,
  phase,
  children,
}: {
  envelope: ExtensionStateEnvelope | null
  role: PreviewRole
  statusName?: string
  phase?: PreviewPhase
  children: ReactNode
}) {
  const { t } = useTranslation(),
    reducedMotion = useReducedMotion() ?? false
  const resolved = useNativeCompositionResolution(
    envelope,
    role,
    statusName,
    phase,
  )

  if (resolved.kind === "none") {
    return children
  }

  if (resolved.kind === "unavailable") {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative" }}>
        {children}
        <p
          role="status"
          data-testid="composition-unavailable"
          className="absolute top-2 left-2 z-50 rounded bg-black/80 px-3 py-2 text-sm text-white"
        >
          {t("extensions:themes.invalidChoice")}
        </p>
      </div>
    )
  }

  return (
    <NativeComposition
      template={resolved.template}
      title={
        typeof envelope?.extras.applicationCompositionTitle === "string"
          ? envelope.extras.applicationCompositionTitle
          : ""
      }
      epoch={envelope?.epoch ?? 0}
      paused={envelope?.pause?.paused ?? false}
      reducedMotion={reducedMotion}
    >
      {children}
    </NativeComposition>
  )
}
