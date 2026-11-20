import { FullShowAudioV3 } from "./full-show-audio.tsx"
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react"
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
  themeAdapterAsset,
} from "../../presentation/show-themes/context.tsx"
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
import type {
  FullShowPlaybackSnapshot,
  FullShowQuestionPresentation,
} from "../client/full-show-playback.ts"
import { observeQuestionPresentation } from "../../presentation/question-lead-in.ts"
import {
  FullShowDemoQuestionV3,
  type FullShowDemoLabels,
} from "./full-show-demo-question.tsx"

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
      overrides: { slots: input.theme.slots, audio: input.theme.audio },
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
  playback,
}: {
  input: FullShowFrameV3
  theme: ReturnType<typeof resolved>
  onUnavailable: () => void
  playback: FullShowPlaybackSnapshot
}) {
  const stage = useRef<TadazzStageHandle>(null)
  const paused = useRef(playback.clock.paused)
  paused.current = playback.clock.paused
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
    )
      .then(() => {
        if (current && paused.current) {
          handle.pauseAnimations?.()
        }
      })
      .catch(() => {
        if (current) {
          onUnavailable()
        }
      })

    return () => {
      current = false
      handle.finishAnimations()
    }
  }, [classic, plan, onUnavailable])
  useLayoutEffect(() => {
    if (playback.clock.paused) {
      stage.current?.pauseAnimations?.()
    } else {
      stage.current?.resumeAnimations?.()
    }
  }, [playback.clock.paused])
  const surface = (
    <ScenePresenter
      scene={scene}
      tadazzEnabled={classic}
      isManager={input.inventory.context.role === "manager"}
      labels={labels.sceneLabels}
      epoch={`${input.inventory.selectedChapterId}:${playback.clock.epoch}`}
      controlledTimeMs={playback.clock.elapsedMs}
      controlledPaused={playback.clock.paused}
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
          backdropUrl={input.presentation.background?.url}
          backdropFit={input.presentation.background?.fit}
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
  soundEnabled = false,
  onSoundEnabled = () => undefined,
  playback,
  onQuestionPresented,
  audioControlsTarget,
  demoControlsTarget,
  onDemoReveal,
  demoLabels,
  onWorkspaceAppearance,
}: {
  value: FullShowFrameV3
  onUnavailable: () => void
  soundEnabled?: boolean
  onSoundEnabled?: (enabled: boolean) => void
  playback: FullShowPlaybackSnapshot
  onQuestionPresented: (presentation: FullShowQuestionPresentation) => void
  audioControlsTarget: HTMLDivElement | null
  demoControlsTarget?: HTMLDivElement | null
  onDemoReveal?: () => void
  demoLabels?: FullShowDemoLabels
  onWorkspaceAppearance?: (appearance: CSSProperties) => void
}) {
  const input = useMemo(() => fullShowFrameV3Schema.parse(value), [value])
  const stageElement = useRef<HTMLDivElement>(null)
  const presentation = playback.questionPresentation
  useLayoutEffect(() => {
    const root = stageElement.current

    if (
      !root ||
      !presentation ||
      input.content.kind !== "question" ||
      input.content.frame.phase !== "question" ||
      presentation.draftId !== input.inventory.draftId ||
      presentation.chapterId !== input.inventory.selectedChapterId ||
      presentation.revision !== input.inventory.revision ||
      presentation.questionId !== input.content.frame.question.id ||
      presentation.epoch !== playback.clock.epoch
    ) {
      return
    }

    return observeQuestionPresentation(root, () => {
      onQuestionPresented(presentation)
    })
  }, [input, presentation, playback.clock.epoch, onQuestionPresented])
  const theme = useMemo(() => resolved(input), [input])
  // The native stage has its own React root, so it needs the same private
  // translation provider as the native scene and question components.
  const nativeI18n = useMemo(
    () => previewNativeLabels(input.inventory.context.locale).i18n,
    [input.inventory.context.locale],
  )
  // Reuse the verified native theme and admitted frame assets for the canvas
  // surround; editor controls retain the application palette.
  const workspaceAppearance = useMemo<CSSProperties>(() => {
    const backdrop = input.presentation.background
    const url =
      backdrop?.url ??
      themeAdapterAsset(
        theme,
        input.content.kind === "question" ? "questionBackdrop" : "showBackdrop",
      )

    return {
      backgroundColor: theme.definition.tokens.background,
      backgroundImage: url ? `url(${JSON.stringify(url)})` : "none",
      backgroundSize: backdrop?.fit ?? "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    }
  }, [theme, input.content.kind, input.presentation.background])
  useLayoutEffect(() => {
    onWorkspaceAppearance?.(workspaceAppearance)
  }, [onWorkspaceAppearance, workspaceAppearance])
  const { content } = input
  const key = `${input.inventory.selectedChapterId}:${input.inventory.revision}:${playback.clock.epoch}`

  return (
    <I18nextProvider i18n={nativeI18n}>
      <ShowThemeScope theme={theme}>
        <div
          ref={stageElement}
          data-full-show-stage={content.kind}
          data-full-show-theme={input.theme.id}
          data-full-show-chapter={input.inventory.selectedChapterId}
          data-playback-elapsed={Math.round(playback.clock.elapsedMs)}
          data-playback-epoch={playback.clock.epoch}
          data-playback-paused={playback.userPaused}
          data-question-presentation-pending={Boolean(presentation)}
          style={{
            ...showThemeStyle(theme),
            width: "100%",
            height: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {content.kind === "question" ? (
            <FullShowDemoQuestionV3
              key={`${input.inventory.draftId}:${input.inventory.revision}:${content.frame.question.id}:${playback.audioEpoch}`}
              input={input}
              theme={theme}
              playback={playback}
              onUnavailable={onUnavailable}
              controlsTarget={demoControlsTarget}
              onReveal={onDemoReveal}
              labels={demoLabels}
            />
          ) : (
            <NativeScene
              key={key}
              input={input}
              theme={theme}
              onUnavailable={onUnavailable}
              playback={playback}
            />
          )}
          <FullShowAudioV3
            value={input}
            enabled={soundEnabled}
            onEnabled={onSoundEnabled}
            paused={playback.clock.paused}
            replayEpoch={playback.audioEpoch}
            controlsTarget={audioControlsTarget}
          />
        </div>
      </ShowThemeScope>
    </I18nextProvider>
  )
}
