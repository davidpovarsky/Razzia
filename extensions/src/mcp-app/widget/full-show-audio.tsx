import { useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { AudioCuePlayer } from "../../presentation/audio-cue-player.tsx"
import { resolveTadazzAudioPolicy } from "../../presentation/tadazz-audio-policy.ts"
import { previewNativeLabels } from "../../presentation/show-library-preview/i18n.ts"
import type { CueId } from "../../core/constants.ts"
import type { FullShowFrameV3 } from "../contracts/full-show-frame.ts"

/** The existing native audio owner runs only after an actual widget gesture. */
export function FullShowAudioV3({
  value,
  enabled,
  onEnabled,
  paused = false,
  replayEpoch = 0,
  controlsTarget,
}: {
  value: FullShowFrameV3
  enabled: boolean
  onEnabled: (value: boolean) => void
  paused?: boolean
  replayEpoch?: number
  controlsTarget: HTMLElement | null
}) {
  const [playing, setPlaying] = useState(false)
  const labels = useMemo(
    () => previewNativeLabels(value.inventory.context.locale),
    [value.inventory.context.locale],
  )
  const chapter = value.inventory.chapters.find(
    (c) => c.id === value.inventory.selectedChapterId,
  )
  const phase = chapter?.kind ?? "question"
  const policy = resolveTadazzAudioPolicy({
    sceneKind:
      phase === "answerCards" || phase === "voteLocked" ? "voting" : phase,
    openingActive: phase === "opening",
    scenePreset:
      value.content.kind === "scene" ? value.content.scene.preset : undefined,
  })
  const cues: Partial<Record<string, CueId>> = {
    opening: "start",
    question: "showQuestion",
    voting: "answersMusic",
    results: "revealResults",
    leaderboard: "leaderboard",
  }
  const tx = (key: string) =>
    labels.i18n.t(`audio.${key}`, { ns: "extensions" })

  return (
    <div
      className="widget-audio"
      data-testid="full-show-audio"
      data-audio-enabled={enabled}
      data-audio-playing={playing && enabled && !paused}
    >
      <AudioCuePlayer
        cueId={cues[phase]}
        gameId={value.inventory.draftId}
        activeCardKey={value.inventory.selectedChapterId}
        phase={phase}
        epoch={`${value.inventory.selectedChapterId}:${replayEpoch}`}
        soundtrackSlot={policy.slot}
        continuityKey={policy.continuityKey}
        autoPlay={enabled}
        paused={paused}
        initiallyPaused
        stageOwnsReveal={value.theme.id === "tadazz-classic"}
        hasCompetingMedia={false}
        onPlaybackStarted={() => setPlaying(true)}
        onEnded={() => setPlaying(false)}
        onError={() => setPlaying(false)}
        showControls
        controlLabels={{
          enable: tx("enableSound"),
          mute: tx("mute"),
          unmute: tx("unmute"),
          pause: tx("pauseAudio"),
          play: tx("playAudio"),
          volume: tx("volume"),
          track: tx("track"),
          followShow: tx("followShow"),
        }}
        renderControls={(controls) => {
          if (!controlsTarget) {
            return null
          }

          return createPortal(
            <div className="widget-toolbar">
              {!enabled || controls.blocked ? (
                <button
                  type="button"
                  data-testid="full-show-enable-audio"
                  onClick={() => {
                    // This path is reached only by a native browser click/key gesture.
                    controls.unlock()
                    onEnabled(true)
                  }}
                >
                  {tx("enableSound")}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="full-show-mute-audio"
                  onClick={() => {
                    controls.togglePause()
                    onEnabled(false)
                    setPlaying(false)
                  }}
                >
                  {tx("mute")}
                </button>
              )}
            </div>,
            controlsTarget,
          )
        }}
      />
    </div>
  )
}
