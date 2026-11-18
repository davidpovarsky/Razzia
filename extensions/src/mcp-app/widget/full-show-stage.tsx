import { useLayoutEffect, useMemo, useRef } from "react"
import { I18nextProvider } from "react-i18next"
import { builtDefinitions } from "virtual:tadazz-native-v2-definitions"
import {
  fullShowFrameV3Schema,
  type FullShowFrameV3,
} from "../contracts/full-show-frame.ts"
import { resolveShowTheme } from "../../core/show-themes/resolve.ts"
import { showThemeRegistry } from "../../core/show-themes/registry.ts"
import { sceneConfigSchema } from "../../core/studio-timeline-schema.ts"
import {
  ShowThemeScope,
  showThemeStyle,
} from "../../presentation/show-themes/context.tsx"
import { NativePreviewStage } from "../../presentation/show-library-preview/NativePreviewStage.tsx"
import { NativeRazziaPreviewV2 } from "../../presentation/show-library-preview/NativeRazziaPreviewV2.tsx"
import { ScenePresenter } from "../../presentation/scene-presenter.tsx"
import { TadazzV4StageAdapter } from "../../presentation/tadazz-show/TadazzV4StageAdapter.tsx"
import type { TadazzStageHandle } from "../../presentation/tadazz-show/TadazzStage.tsx"
import {
  collapseForResume,
  planTransition,
  runSteps,
} from "../../presentation/tadazz-show/show-director.ts"
import { previewNativeLabels } from "../../presentation/show-library-preview/i18n.ts"
import { StageFitContainer } from "../../presentation/stage-fit.tsx"
import { hashJson } from "../contracts/canonical.ts"

function resolved(input: FullShowFrameV3) {
  const expected = builtDefinitions.find(
    (d) => d.id === input.theme.id && d.version === input.theme.version,
  )
  const definition = showThemeRegistry.get(input.theme.id, input.theme.version)

  if (
    !expected ||
    !definition ||
    expected.definitionSha256 !== input.theme.definitionSha256 ||
    expected.rendererId !== input.theme.rendererId ||
    definition.rendererId !== input.theme.rendererId
  ) {
    throw new Error("full-show:unbuilt-theme")
  }

  for (const [slot, choice] of Object.entries(input.theme.slots)) {
    if (
      !definition.slots[slot as keyof typeof definition.slots].variants.some(
        (v) => v.id === choice.variantId,
      )
    ) {
      throw new Error("full-show:unbuilt-variant")
    }
  }
  const theme = resolveShowTheme({
    role: input.inventory.context.role,
    selection: {
      id: input.theme.id,
      version: input.theme.version,
      overrides: { slots: input.theme.slots },
    },
  })

  if (theme.diagnostics.length) {
    throw new Error("full-show:theme-resolution")
  }

  return theme
}
function sceneValue(input: FullShowFrameV3) {
  if (input.content.kind !== "scene") {
    throw new Error("full-show:scene-required")
  }

  const publicHash = input.content.scene.id.slice("preview-scene-".length)
  const id = `${publicHash.slice(0, 8)}-${publicHash.slice(
    8,
    12,
  )}-4${publicHash.slice(13, 16)}-8${publicHash.slice(
    17,
    20,
  )}-${publicHash.slice(20, 32)}`

  return sceneConfigSchema.parse({
    ...input.content.scene,
    id,
    audio: { mode: "mute", volume: 0, loop: false },
    ...(["media", "opening", "closing"].includes(input.content.scene.kind)
      ? { muted: true, volume: 0, showControls: false }
      : {}),
  })
}
function NativeScene({
  input,
  theme,
  onUnavailable,
}: {
  input: FullShowFrameV3
  theme: ReturnType<typeof resolved>
  onUnavailable: () => void
}) {
  const stage = useRef<TadazzStageHandle>(null)
  const scene = useMemo(() => sceneValue(input), [input])
  const labels = useMemo(
    () => previewNativeLabels(input.inventory.context.locale),
    [input.inventory.context.locale],
  )
  const plan = useMemo(
    () =>
      planTransition(
        null,
        { kind: "scene", key: scene.id, scene, elapsedMs: 0, paused: false },
        { mode: "idle", questionKey: null },
      ),
    [scene],
  )
  const classic = theme.definition.rendererId === "tadazz-classic-stage"
  useLayoutEffect(() => {
    const handle = stage.current

    if (!classic || !handle) {
      return
    }

    let current = true
    void runSteps(
      handle,
      input.inventory.context.reducedMotion ? collapseForResume(plan) : plan,
      () => current,
    ).catch(() => {
      if (current) {
        onUnavailable()
      }
    })

    return () => {
      current = false
      handle.finishAnimations()
    }
  }, [classic, plan, onUnavailable])
  const surface = (
    <ScenePresenter
      scene={scene}
      tadazzEnabled={classic}
      isManager={input.inventory.context.role === "manager"}
      labels={labels.sceneLabels}
      epoch={input.inventory.selectedChapterId}
      controlledPaused={false}
    />
  )

  return (
    <I18nextProvider i18n={labels.i18n}>
      {classic ? (
        <TadazzV4StageAdapter
          ref={stage}
          labels={labels.labels}
          v4Labels={labels.v4Labels}
          reducedMotion={input.inventory.context.reducedMotion}
          interactive={false}
          customScreen={
            plan.some((step) => step.op === "custom") ? surface : undefined
          }
        />
      ) : (
        <StageFitContainer>{surface}</StageFitContainer>
      )}
    </I18nextProvider>
  )
}

/** Uses existing native components; no game engine, socket, scoring or room transport. */
export function FullShowNativeStageV3({
  value,
  onUnavailable,
}: {
  value: FullShowFrameV3
  onUnavailable: () => void
}) {
  const input = useMemo(() => fullShowFrameV3Schema.parse(value), [value])
  const theme = useMemo(() => resolved(input), [input])
  const { content } = input
  const key = `${input.inventory.selectedChapterId}:${input.inventory.revision}`

  return (
    <ShowThemeScope theme={theme}>
      <div
        data-full-show-stage={content.kind}
        data-full-show-chapter={input.inventory.selectedChapterId}
        style={{
          ...showThemeStyle(theme),
          width: "100%",
          height: "100%",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Native renderer discrimination keeps scene/question payloads separate. */}
        {/* oxlint-disable-next-line no-nested-ternary -- Preserve strict discriminated native component props. */}
        {content.kind === "question" ? (
          theme.definition.rendererId === "tadazz-classic-stage" ? (
            <NativePreviewStage
              key={key}
              frame={content.frame}
              locale={input.inventory.context.locale}
              reducedMotion={input.inventory.context.reducedMotion}
              fitRevision={0}
              resolvedTheme={theme}
              onUnavailable={onUnavailable}
            />
          ) : (
            <NativeRazziaPreviewV2
              key={key}
              theme={theme}
              input={{
                inputVersion: 2,
                frame: content.frame,
                locale: input.inventory.context.locale,
                reducedMotion: input.inventory.context.reducedMotion,
                themeBinding: {
                  format: "tadazz-native-preview-theme",
                  schemaVersion: 2,
                  portVersion: 3,
                  identityRuleVersion: 2,
                  questionId: content.frame.question.id,
                  role: content.frame.role,
                  draftRevision: content.frame.revision,
                  theme: { id: input.theme.id, version: input.theme.version },
                  rendererId: input.theme.rendererId,
                  definitionSha256: input.theme.definitionSha256,
                  compositionDocumentSha256: hashJson(input.theme),
                  slots: input.theme.slots,
                  settings: content.visualSettings,
                },
              }}
            />
          )
        ) : (
          <NativeScene
            key={key}
            input={input}
            theme={theme}
            onUnavailable={onUnavailable}
          />
        )}
      </div>
    </ShowThemeScope>
  )
}
