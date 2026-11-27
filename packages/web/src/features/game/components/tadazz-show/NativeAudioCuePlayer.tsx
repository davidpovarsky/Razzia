import {
  AudioCuePlayer as Engine,
  type AudioCuePlayerProps,
  type AudioControlState,
} from "@razzia/extensions/presentation"
import {
  Button,
  IconButton,
  PlatformScope,
  Select,
  Tooltip,
} from "@razzia/extensions/platform-ui"
import { CircleHelp, Music2, Pause, Play, Volume2, VolumeX } from "lucide-react"
import { useId } from "react"
import { useTranslation } from "react-i18next"

/** Platform controls around the single shared music engine. */
export function NativeAudioControls(state: AudioControlState) {
  return <HostMusicControls {...state} />
}

function HostMusicControls(state: AudioControlState) {
  const { t, i18n } = useTranslation()
  const trackId = useId()
  const musicLabel = t("extensions:audio.musicLabel", "Music")
  const musicHelp = t(
    "extensions:audio.musicHelp",
    "Changes music for this screen. The next screen resumes automatic music.",
  )

  return (
    <PlatformScope
      context="platform.host"
      dir={i18n.dir()}
      className="relative z-50 flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2 px-3 py-2 text-sm font-semibold"
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
      {state.unavailable && (
        <p
          role="alert"
          className="tds-field-error"
          data-testid="host-music-unavailable"
        >
          {t(
            "extensions:audio.musicUnavailable",
            "This music could not be loaded. Choose another track.",
          )}
        </p>
      )}
      <Button
        size="sm"
        onClick={state.toggleMute}
        data-testid="host-toggle-audio-mute"
        aria-label={state.muted ? state.labels.unmute : state.labels.mute}
        aria-pressed={state.muted}
      >
        {state.muted ? (
          <VolumeX className="size-4" />
        ) : (
          <Volume2 className="size-4" />
        )}
        <span className="max-md:sr-only">
          {state.muted ? state.labels.unmute : state.labels.mute}
        </span>
      </Button>
      <label className="flex items-center gap-2 px-2">
        <span className="sr-only">{state.labels.volume}</span>
        <input
          style={{
            accentColor: "var(--tds-action)",
            minHeight: "var(--tds-button-min-height)",
          }}
          className="w-24 cursor-pointer"
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
        onClick={state.togglePause}
        data-testid="host-toggle-audio-pause"
        aria-label={state.userPaused ? state.labels.play : state.labels.pause}
        aria-pressed={state.userPaused}
      >
        {state.userPaused ? (
          <Play className="size-4" />
        ) : (
          <Pause className="size-4" />
        )}
        <span className="max-md:sr-only">
          {state.userPaused ? state.labels.play : state.labels.pause}
        </span>
      </Button>
      {state.tracks.length > 0 && (
        <div
          className="flex w-full max-w-full min-w-0 flex-nowrap items-center gap-2 sm:w-auto"
          data-testid="host-music-picker"
        >
          <label htmlFor={trackId} className="flex items-center gap-1.5">
            <Music2 className="size-4" aria-hidden="true" />
            <span className="max-md:sr-only">{musicLabel}</span>
          </label>
          <div className="min-w-0 flex-1 sm:w-48 sm:flex-none">
            <Select
              id={trackId}
              aria-label={musicLabel}
              value={state.track}
              onChange={(event) => state.setTrack(event.target.value)}
              data-testid="host-audio-track-select"
            >
              <option value="">
                {t("extensions:audio.musicAutomatic", "Automatic")}
              </option>
              {state.tracks.map((track) => (
                <option
                  key={track.value}
                  value={track.value}
                  disabled={track.disabled}
                >
                  {track.label}
                </option>
              ))}
            </Select>
          </div>
          <Tooltip content={musicHelp}>
            <IconButton
              label={musicHelp}
              size="sm"
              variant="ghost"
              data-testid="host-music-help"
            >
              <CircleHelp className="size-4" />
            </IconButton>
          </Tooltip>
        </div>
      )}
    </PlatformScope>
  )
}

export function NativeAudioCuePlayer(props: AudioCuePlayerProps) {
  return <Engine {...props} renderControls={NativeAudioControls} />
}
