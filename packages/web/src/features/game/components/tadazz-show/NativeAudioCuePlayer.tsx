import {
  AudioCuePlayer as Engine,
  type AudioCuePlayerProps,
  type AudioControlState,
} from "@razzia/extensions/presentation"
import Button from "@razzia/web/components/Button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@razzia/web/components/Select"
import { Pause, Play, Volume2, VolumeX } from "lucide-react"

/** Original Razzia controls; the extension engine remains the sole audio owner. */
export function NativeAudioControls(state: AudioControlState) {
  const secondary = "bg-white text-black hover:bg-accent"
  return (
    <div
      className="font-display relative z-50 flex shrink-0 flex-wrap items-center gap-2 px-3 py-2 text-sm font-semibold"
      data-testid="host-audio-controls"
    >
      {state.blocked && (
        <Button
          size="sm"
          onClick={state.unlock}
          data-testid="host-enable-audio"
        >
          {state.labels.enable}
        </Button>
      )}
      <Button
        size="sm"
        className={secondary}
        onClick={state.toggleMute}
        data-testid="host-toggle-audio-mute"
        aria-pressed={state.muted}
      >
        {state.muted ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
        {state.muted ? state.labels.unmute : state.labels.mute}
      </Button>
      <label className="flex items-center gap-2 rounded-lg bg-black/40 px-3 py-1.5 text-white">
        <span className="sr-only">{state.labels.volume}</span>
        <input
          className="accent-primary w-24 cursor-pointer"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={state.volume}
          aria-label={state.labels.volume}
          data-testid="host-audio-volume"
          onChange={(event) => state.setVolume(Number(event.target.value))}
        />
      </label>
      <Button
        size="sm"
        className={secondary}
        onClick={state.togglePause}
        data-testid="host-toggle-audio-pause"
        aria-pressed={state.userPaused}
      >
        {state.userPaused ? (
          <Play className="size-4" />
        ) : (
          <Pause className="size-4" />
        )}
        {state.userPaused ? state.labels.play : state.labels.pause}
      </Button>
      {state.tracks.length > 0 && (
        <div className="w-48 max-w-full">
          <Select
            value={state.track || "follow-show"}
            onValueChange={(value) =>
              state.setTrack(value === "follow-show" ? "" : value)
            }
          >
            <SelectTrigger
              aria-label={state.labels.track}
              data-testid="host-audio-track-select"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="follow-show">
                {state.labels.followShow}
              </SelectItem>
              {state.tracks.map((track) => (
                <SelectItem key={track.value} value={track.value}>
                  {track.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

export function NativeAudioCuePlayer(props: AudioCuePlayerProps) {
  return <Engine {...props} renderControls={NativeAudioControls} />
}
