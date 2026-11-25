import type { PropsWithChildren } from "react"
import type {
  ExtensionCommand,
  ExtensionStateEnvelope,
  Interlude,
} from "../core/index"
import { ScenePresenter, type ScenePresenterProps } from "./scene-presenter"
import {
  InterludePresenter,
  type InterludePresenterLabels,
} from "./interlude-presenter"
import { StageFitContainer } from "./stage-fit"

export type ExtensionStageContentProps = PropsWithChildren & {
  extensionState: ExtensionStateEnvelope | null
  openingPlaceholder: boolean
  tadazzEnabled: boolean
  isManager: boolean
  scenePresenterLabels: ScenePresenterProps["labels"]
  interludeLabels: InterludePresenterLabels
  onCommand: (command: ExtensionCommand) => void
}

export const ExtensionStageContent = ({
  children,
  extensionState,
  openingPlaceholder,
  tadazzEnabled,
  isManager,
  scenePresenterLabels,
  interludeLabels,
  onCommand,
}: ExtensionStageContentProps) => {
  // The Goldy Motion Kit paints the whole branded opening. Do not mount
  // the legacy black cinema card underneath while its iframe initializes.
  // The manager's independent Next Screen control remains available.
  if (openingPlaceholder) {
    return (
      <div
        data-testid="tadazz-opening-background"
        className="flex min-h-0 w-full flex-1"
      />
    )
  }

  if (!extensionState) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
        {children}
      </div>
    )
  }

  if (
    extensionState.phase === "scene" &&
    (Boolean(extensionState.extras.currentScene) ||
      (extensionState.extras.activeTimelineStep &&
        (extensionState.extras.activeTimelineStep as { kind?: string }).kind !==
          "question"))
  ) {
    const activeStep = extensionState.extras.activeTimelineStep as
      ScenePresenterProps["step"] | undefined
    const currentScene = extensionState.extras.currentScene as
      ScenePresenterProps["scene"] | undefined
    const activeSceneData = extensionState.extras.activeSceneData as
      ScenePresenterProps["activeSceneData"] | undefined
    const globalStageAnimations = (
      extensionState.extras.defaults as
        | { stageAnimations?: ScenePresenterProps["globalStageAnimations"] }
        | undefined
    )?.stageAnimations

    return (
      <StageFitContainer className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 sm:p-2 md:p-4">
        <ScenePresenter
          step={activeStep}
          scene={currentScene}
          activeSceneData={activeSceneData}
          globalStageAnimations={globalStageAnimations}
          tadazzEnabled={tadazzEnabled}
          labels={scenePresenterLabels}
          serverStartedAt={extensionState.startedAt}
          epoch={extensionState.epoch}
          controlledPaused={extensionState.pause?.paused}
          isManager={isManager}
          onMediaEnded={() => {
            if (isManager && extensionState.gameId) {
              onCommand({
                v: 1,
                gameId: extensionState.gameId,
                action: "ADVANCE_TIMELINE_SCENE",
                payload: {
                  epoch: extensionState.epoch,
                  sceneId: activeStep?.sceneId ?? currentScene?.id,
                  timelineStepIndex: activeStep?.stepIndex,
                  reason: "mediaEnded",
                },
                requestId: `media-end-${extensionState.epoch}-${activeStep?.stepIndex ?? 0}`,
              })
            }
          }}
          onAdvance={() => {
            if (isManager && extensionState.gameId) {
              onCommand({
                v: 1,
                gameId: extensionState.gameId,
                action: "ADVANCE_TIMELINE_SCENE",
                payload: {
                  epoch: extensionState.epoch,
                },
                requestId: `adv-${Date.now()}`,
              })
            }
          }}
          onSkip={() => {
            if (isManager && extensionState.gameId) {
              onCommand({
                v: 1,
                gameId: extensionState.gameId,
                action: "SKIP_TIMELINE_SCENE",
                payload: {
                  epoch: extensionState.epoch,
                },
                requestId: `skip-${Date.now()}`,
              })
            }
          }}
        />
      </StageFitContainer>
    )
  }

  if (extensionState.phase === "interlude" && extensionState.extras.interlude) {
    return (
      <StageFitContainer className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden p-1 sm:p-2 md:p-4">
        <InterludePresenter
          interlude={extensionState.extras.interlude as Interlude}
          serverStartedAt={extensionState.startedAt}
          isManager={isManager}
          labels={interludeLabels}
          onSkip={() => {
            if (isManager && extensionState.gameId) {
              onCommand({
                v: 1,
                gameId: extensionState.gameId,
                action: "END_OR_SKIP_INTERLUDE",
                payload: {
                  reason: "manual",
                  epoch: extensionState.epoch,
                },
                requestId: `skip-${Date.now()}`,
              })
            }
          }}
        />
      </StageFitContainer>
    )
  }

  return (
    <StageFitContainer className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
      {children}
    </StageFitContainer>
  )
}
