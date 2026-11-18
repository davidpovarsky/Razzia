import { useTranslation } from "react-i18next"
import type { ReactNode } from "react"
import type {
  ActiveSceneData,
  SceneConfig,
} from "../../core/studio-timeline-schema"
import {
  CinematicLayerStack,
  type CinematicLayerStackProps,
} from "../cinematic-layer-stack"
import type { SceneDescriptor } from "../tadazz-show/presentation-scene"
import { hasAuthoredCinematicContent } from "../tadazz-show/show-director"
import {
  TadazzCountdownScreen,
  TadazzMessageScreen,
  TadazzRecapScreen,
  TadazzSceneTitleScreen,
} from "../tadazz-show/native-scene-screens"

// Same native custom-screen primitives and cinematic stack as TadazzShowView.
// The editor provides a controlled clock and real draft context, never a room.
export function NativeClassicScene({
  scene,
  activeSceneData,
  elapsedMs,
  paused,
  epoch,
}: {
  scene: SceneConfig
  activeSceneData?: ActiveSceneData | null
  elapsedMs: number
  paused: boolean
  epoch: number
}) {
  const { t } = useTranslation()
  const descriptor: SceneDescriptor = scene
  let content: ReactNode = null

  if (scene.kind === "countdown") {
    content = (
      <TadazzCountdownScreen
        title={scene.title}
        seconds={scene.durationSeconds}
        controlledTimeMs={elapsedMs}
      />
    )
  } else if (scene.kind === "answerRecap" && activeSceneData?.answerRecap) {
    content = (
      <TadazzRecapScreen
        title={scene.title}
        recap={activeSceneData.answerRecap}
      />
    )
  } else if (scene.kind === "interimResults" || scene.kind === "leaderboard") {
    content = (
      <TadazzMessageScreen
        headline={scene.title}
        sub={t(
          "extensions:tadazzShow.noResponses",
          "No responses recorded yet.",
        )}
      />
    )
  } else {
    content = <TadazzSceneTitleScreen scene={descriptor} />
  }

  const cinematic =
    (scene.kind === "opening" ||
      scene.kind === "closing" ||
      scene.kind === "media") &&
    hasAuthoredCinematicContent(descriptor)

  return (
    <>
      {content}
      {cinematic && (
        <div
          className="tz-scene-media"
          style={{ zIndex: 20 }}
          data-testid="tadazz-cinematic-scene"
        >
          <CinematicLayerStack
            sceneId={scene.id}
            sceneKind={
              scene.kind === "opening" || scene.kind === "closing"
                ? scene.kind
                : "media"
            }
            epoch={epoch}
            mediaUrl={descriptor.mediaUrl}
            mediaType={descriptor.mediaType}
            mediaFit={descriptor.mediaFit}
            volume={descriptor.volume}
            loop={descriptor.loop}
            muted={descriptor.muted}
            endBehavior={descriptor.endBehavior}
            contrastOverlayOpacity={0}
            lottieUrl={descriptor.lottieUrl}
            lottieFit={descriptor.lottieFit}
            lottieLoop={descriptor.lottieLoop}
            lottieSpeed={descriptor.lottieSpeed}
            overlayAnimations={
              descriptor.overlayAnimations as CinematicLayerStackProps["overlayAnimations"]
            }
            controlledTimeMs={elapsedMs}
            controlledPaused={paused}
            showAutoplayControl={false}
          />
        </div>
      )}
    </>
  )
}
