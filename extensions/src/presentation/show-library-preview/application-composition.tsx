import { requireLibraryValue } from "../../core/show-library/required"
// oxlint-disable typescript/no-unnecessary-condition -- Untrusted chapter indexes can address an empty or sparse array.
import { useMemo, type ReactNode } from "react"
import QuestionEntrance from "../../../../packages/web/src/features/game/components/QuestionEntrance"
import { BrandLogo } from "../tadazz-v4/FullShowScenes"
import { resolveApplicationTemplate } from "../../core/show-library/application-library"
import { compileFullShowPreviewTimeline } from "../../core/show-library/full-show-preview-timeline"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import type { PreviewPhase } from "../../core/show-library/primitives"
import type { QuestionEntrance as QuestionEntranceConfig } from "../../core/quiz-extras"

function CompositionBrand({
  url,
  fit,
  title,
}: {
  url?: string
  fit?: "contain" | "cover"
  title: string
}) {
  return url ? (
    <img
      data-testid="show-brand-image"
      src={url}
      alt={title}
      style={{
        display: "block",
        maxHeight: "100%",
        maxWidth: "100%",
        objectFit: fit ?? "contain",
      }}
    />
  ) : (
    <BrandLogo className="max-h-full max-w-full" />
  )
}

export function admittedApplicationTemplate(
  frame: ApplicationPreviewFrame,
  phase: PreviewPhase,
) {
  if (!frame.appearance) {
    return null
  }

  const chapter = compileFullShowPreviewTimeline(frame.show)[frame.chapterIndex]
  const card = chapter ? frame.show.cards[chapter.cardIndex] : undefined

  return resolveApplicationTemplate(
    frame.appearance,
    frame.role,
    phase,
    card && !frame.stagePhase ? frame.scopeIds?.[card.key] : undefined,
  )
}

/** Bounded composition around the genuine stage; never a second question renderer. */
export function ApplicationComposition({
  frame,
  phase,
  children,
  template: provided,
}: {
  frame: ApplicationPreviewFrame
  phase: PreviewPhase
  children: ReactNode
  template?: ReturnType<typeof admittedApplicationTemplate>
}) {
  const template = useMemo(
    () => provided ?? admittedApplicationTemplate(frame, phase),
    [
      provided,
      frame.appearance,
      frame.role,
      phase,
      frame.chapterIndex,
      frame.show,
      frame.scopeIds,
      frame.stagePhase,
    ],
  )

  return (
    <NativeComposition
      template={template}
      title={frame.show.title}
      epoch={frame.clock.epoch}
      paused={frame.clock.paused}
      reducedMotion={frame.reducedMotion}
    >
      {children}
    </NativeComposition>
  )
}

/** Shared layout around the existing live or readonly stage, with no game state owner. */
export function NativeComposition({
  template,
  title,
  epoch,
  paused,
  reducedMotion,
  children,
}: {
  template: ReturnType<typeof admittedApplicationTemplate>
  title: string
  epoch: number | string
  paused: boolean
  reducedMotion: boolean
  children: ReactNode
}) {
  const root = template?.nodes.find((n) => n.nodeId === template.rootNodeId)

  if (!root) {
    return children
  }

  const gap = { none: 0, small: 8, medium: 16, large: 32 }[root.layout.gap]
  const nodes = (root.children.decoration ?? []).map((id) =>
    requireLibraryValue(
      requireLibraryValue(template).nodes.find((node) => node.nodeId === id),
    ),
  )
  const side = root.layout.preset === "grid" && nodes.length > 0

  // Decorations get a reserved lane. They cannot obscure answers, media or controls.
  return (
    <div
      data-native-composition={requireLibraryValue(template).id}
      style={{
        width: "100%",
        height: "100%",
        minHeight: 0,
        minWidth: 0,
        flex: "1 1 0%",
        display: "grid",
        gridTemplateColumns: side
          ? "minmax(0,3fr) minmax(0,1fr)"
          : "minmax(0,1fr)",
        gridTemplateRows:
          !side && nodes.length
            ? "minmax(0,4fr) minmax(0,1fr)"
            : "minmax(0,1fr)",
        gap,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
      {nodes.length > 0 && (
        <div
          data-composition-decoration
          data-composition-paused={paused || undefined}
          style={{
            minWidth: 0,
            minHeight: 0,
            overflow: "hidden",
            containerType: "inline-size",
            display: "flex",
            flexDirection: side ? "column" : "row",
            justifyContent:
              (
                {
                  start: "flex-start",
                  end: "flex-end",
                  center: "center",
                } as Record<string, string>
              )[root.layout.alignment] ?? "center",
            alignItems: "center",
            gap,
            padding: Math.min(gap, 8),
          }}
        >
          <style>
            {
              "[data-composition-decoration][data-composition-paused] [data-tada-entrance]{animation-play-state:paused}"
            }
          </style>
          {nodes.map((node) => (
            <div
              key={node.nodeId}
              style={{
                minWidth: 0,
                maxWidth: "100%",
                maxHeight: "100%",
                overflow: "hidden",
                textAlign:
                  ({ start: "start", end: "end", center: "center" } as const)[
                    node.layout.alignment
                  ] ?? "center",
                padding: { none: 0, small: 2, medium: 4, large: 8 }[
                  node.layout.gap
                ],
              }}
            >
              <QuestionEntrance
                epoch={`${epoch}:${node.nodeId}`}
                entrance={{
                  preset: reducedMotion
                    ? "none"
                    : ((node.motions[0]?.id.replace("native.motion.", "") ??
                        "none") as QuestionEntranceConfig["preset"]),
                  durationMs: 800,
                }}
              >
                {node.component.id === "native.brand" ? (
                  <CompositionBrand
                    url={node.props.imageUrl}
                    fit={node.props.fit}
                    title={title}
                  />
                ) : (
                  <strong
                    style={{
                      display: "block",
                      fontSize: "clamp(10px,12cqw,24px)",
                      lineHeight: 1.2,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {title}
                  </strong>
                )}
              </QuestionEntrance>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
