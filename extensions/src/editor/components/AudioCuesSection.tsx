import type {
  AudioCueSetting,
  CueId,
  QuizExtrasV1,
  SoundtrackSetting,
  SoundtrackSlotId,
} from "@razzia/extensions/core"
import { resolveAudioCue } from "@razzia/extensions/presentation"
import { Play, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { clsx } from "./utils"

interface Props {
  extras: QuizExtrasV1
  onChange: (_updated: QuizExtrasV1) => void
  tr: (_key: string, _fallback: string) => string
}

export const AudioCuesSection = ({ extras, onChange, tr }: Props) => {
  const audioExtras = extras.audio
  const [testingCue, setTestingCue] = useState<CueId | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(
    () => () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }
    },
    [],
  )

  const handleTestPlay = (cueId: CueId) => {
    // Stop currently playing cue if clicked again
    if (testingCue === cueId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }

      setTestingCue(null)

      return
    }

    // Stop previous cue cleanly
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      audioRef.current = null
    }

    // Resolve audio cue according to runtime semantics (source, fallback URL, enabled, volume, loop)
    const resolved = resolveAudioCue(cueId, audioExtras)

    if (!resolved.enabled || resolved.volume <= 0) {
      setTestingCue(null)

      return
    }

    setTestingCue(cueId)

    try {
      const audio = new Audio(resolved.url)
      audio.volume = Math.max(0, Math.min(1, resolved.volume))
      audio.loop = resolved.loop
      audioRef.current = audio

      audio.onerror = () => {
        setTestingCue(null)
        audioRef.current = null
      }

      audio.onended = () => {
        setTestingCue(null)
        audioRef.current = null
      }

      const playPromise = audio.play()

      void playPromise.catch(() => {
        setTestingCue(null)
        audioRef.current = null
      })
    } catch {
      setTestingCue(null)
      audioRef.current = null
    }
  }

  const handleUpdateCue = (cueId: CueId, updates: Partial<AudioCueSetting>) => {
    const existing = audioExtras.cues[cueId]

    onChange({
      ...extras,
      audio: {
        ...audioExtras,
        cues: {
          ...audioExtras.cues,
          [cueId]: {
            ...existing,
            ...updates,
          },
        },
      },
    })
  }

  const cues: Array<{ id: CueId; labelKey: string; fallback: string }> = [
    { id: "start", labelKey: "audio.cueStart", fallback: "Game Start" },
    {
      id: "showQuestion",
      labelKey: "audio.cueShowQuestion",
      fallback: "Show Question",
    },
    {
      id: "answersMusic",
      labelKey: "audio.cueAnswersMusic",
      fallback: "Answering Music (Loop)",
    },
    {
      id: "answerPressed",
      labelKey: "audio.cueAnswerPressed",
      fallback: "Answer Pressed",
    },
    {
      id: "revealResults",
      labelKey: "audio.cueRevealResults",
      fallback: "Reveal Results",
    },
    {
      id: "leaderboard",
      labelKey: "audio.cueLeaderboard",
      fallback: "Leaderboard Display",
    },
    {
      id: "podium1",
      labelKey: "audio.cuePodium1",
      fallback: "1st Place Fanfare",
    },
    {
      id: "podium2",
      labelKey: "audio.cuePodium2",
      fallback: "2nd Place Fanfare",
    },
    {
      id: "podium3",
      labelKey: "audio.cuePodium3",
      fallback: "3rd Place Fanfare",
    },
  ]

  const soundtrackSlots: Array<{
    id: SoundtrackSlotId
    labelKey: string
    fallback: string
  }> = [
    {
      id: "openingIntro",
      labelKey: "audio.slotOpeningIntro",
      fallback: "Opening intro (12 seconds)",
    },
    { id: "lobby", labelKey: "audio.slotLobby", fallback: "Lobby / QR" },
    {
      id: "roundStart",
      labelKey: "audio.slotRoundStart",
      fallback: "Round start",
    },
    {
      id: "question",
      labelKey: "audio.slotQuestion",
      fallback: "Question before choices",
    },
    {
      id: "voting",
      labelKey: "audio.slotVoting",
      fallback: "Voting (answersMusic remains authoritative)",
    },
    {
      id: "results",
      labelKey: "audio.slotResults",
      fallback: "Results / interim results",
    },
    {
      id: "leaderboard",
      labelKey: "audio.slotLeaderboard",
      fallback: "Leaderboard / tie",
    },
    {
      id: "recap",
      labelKey: "audio.slotRecap",
      fallback: "Round recap / story",
    },
    { id: "finale", labelKey: "audio.slotFinale", fallback: "Finale" },
  ]

  const updateSoundtrack = (
    slot: SoundtrackSlotId,
    updates: Partial<SoundtrackSetting>,
  ) => {
    const existing: SoundtrackSetting = audioExtras.soundtrack?.[slot] ?? {
      mode: "inherit",
      volume: 0.35,
      loop: slot === "lobby" || slot === "voting",
      fadeMs: 700,
      startOffsetSeconds: 0,
    }
    onChange({
      ...extras,
      audio: {
        ...audioExtras,
        soundtrack: {
          ...audioExtras.soundtrack,
          [slot]: { ...existing, ...updates },
        },
      },
    })
  }

  return (
    <div className="flex flex-col gap-6" data-testid="panel-audio">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("audio.cuesTitle", "Sound Effects & Audio Cues")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "audio.cuesDesc",
            "Configure background music and sound cues for game events.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {cues.map(({ id, labelKey, fallback }) => {
          const setting = audioExtras.cues[id]
          const { enabled: isEnabled, volume, source, loop } = setting
          const isCustom = source === "media"
          const isPlaying = testingCue === id

          return (
            <div
              key={id}
              className="border-border bg-card/60 flex flex-col gap-3 rounded-xl border p-4"
              data-testid={`audio-cue-card-${id}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-foreground text-sm font-bold">
                  {tr(labelKey, fallback)}
                </span>
                <button
                  type="button"
                  onClick={() => handleTestPlay(id)}
                  className={clsx(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors",
                    isPlaying
                      ? "bg-red-500 text-white"
                      : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 border",
                  )}
                  data-testid={`test-audio-${id}`}
                >
                  {isPlaying ? (
                    <>
                      <Square className="size-3 fill-white" />
                      <span>{tr("audio.testStop", "Stop")}</span>
                    </>
                  ) : (
                    <>
                      <Play className="size-3 fill-current" />
                      <span>{tr("audio.testPlay", "Play")}</span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <label className="text-muted-foreground text-xs font-semibold">
                    {tr("audio.source", "Source")}:
                  </label>
                  <select
                    value={setting.source}
                    onChange={(e) =>
                      handleUpdateCue(id, {
                        source: e.target.value as "default" | "media",
                      })
                    }
                    className="focus:ring-primary border-accent bg-background text-foreground flex-1 rounded-lg border p-1.5 text-xs focus:ring-2 focus:outline-none"
                    data-testid={`audio-source-${id}`}
                  >
                    <option value="default">
                      {tr("audio.sourceDefault", "Default Sound")}
                    </option>
                    <option value="media">
                      {tr("audio.sourceCustom", "Custom Media")}
                    </option>
                  </select>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                    {tr("audio.volume", "Volume")}:
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) =>
                      handleUpdateCue(id, { volume: Number(e.target.value) })
                    }
                    className="accent-primary flex-1 cursor-pointer"
                  />
                  <span className="w-8 text-right font-mono text-xs font-bold text-neutral-700 dark:text-neutral-300">
                    {Math.round(volume * 100)}%
                  </span>
                </div>
              </div>

              {isCustom && (
                <div className="flex flex-col gap-1">
                  <input
                    type="text"
                    value={setting.url ?? ""}
                    onChange={(e) =>
                      handleUpdateCue(id, { url: e.target.value })
                    }
                    placeholder="/sounds/custom-cue.mp3"
                    className="focus:ring-primary border-accent bg-background text-foreground w-full rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none"
                    data-testid={`audio-custom-url-${id}`}
                  />
                </div>
              )}

              <div className="border-border flex items-center gap-4 border-t pt-2 text-xs">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) =>
                      handleUpdateCue(id, { enabled: e.target.checked })
                    }
                    className="accent-primary size-3.5 rounded"
                  />
                  <span className="text-foreground font-semibold">
                    {tr("audio.enabled", "Sound Enabled")}
                  </span>
                </label>

                {id === "answersMusic" && (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={loop}
                      onChange={(e) =>
                        handleUpdateCue(id, { loop: e.target.checked })
                      }
                      className="accent-primary size-3.5 rounded"
                    />
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                      {tr("audio.loop", "Loop Music")}
                    </span>
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col gap-3" data-testid="soundtrack-slots">
        <div>
          <h3 className="text-foreground text-base font-bold">
            {tr("audio.soundtrackTitle", "Presenter soundtrack")}
          </h3>
          <p className="text-muted-foreground text-xs">
            {tr(
              "audio.soundtrackDesc",
              "Use only cleared tenant media URLs. Candidate source files are not bundled.",
            )}
          </p>
        </div>
        {soundtrackSlots.map(({ id, labelKey, fallback }) => {
          const setting = audioExtras.soundtrack?.[id] ?? {
            mode: "inherit" as const,
            volume: 0.35,
            loop: id === "lobby" || id === "voting",
            fadeMs: 700,
            startOffsetSeconds: 0,
          }

          return (
            <div
              key={id}
              className="border-border bg-card/60 grid gap-3 rounded-xl border p-4"
              data-testid={`soundtrack-slot-${id}`}
            >
              <span className="text-foreground text-sm font-bold">
                {tr(labelKey, fallback)}
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                <select
                  value={setting.mode}
                  onChange={(event) =>
                    updateSoundtrack(id, {
                      mode: event.target.value as SoundtrackSetting["mode"],
                    })
                  }
                  className="focus:ring-primary border-accent bg-background text-foreground rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none"
                >
                  <option value="inherit">
                    {tr("audio.inherit", "Use cue / inherit")}
                  </option>
                  <option value="mute">
                    {tr("audio.none", "No background music")}
                  </option>
                  <option value="media">
                    {tr("audio.sourceCustom", "Authorized media")}
                  </option>
                </select>
                <label className="text-muted-foreground flex items-center gap-2 text-xs font-semibold">
                  {tr("audio.volume", "Volume")}
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={setting.volume}
                    onChange={(event) =>
                      updateSoundtrack(id, {
                        volume: Number(event.target.value),
                      })
                    }
                    className="accent-primary flex-1"
                  />
                </label>
              </div>
              {setting.mode === "media" && (
                <input
                  type="text"
                  value={setting.url ?? ""}
                  onChange={(event) =>
                    updateSoundtrack(id, { url: event.target.value })
                  }
                  placeholder="/media/cleared-track.ext"
                  className="focus:ring-primary border-accent bg-background text-foreground rounded-lg border p-2 text-xs focus:ring-2 focus:outline-none"
                  data-testid={`soundtrack-url-${id}`}
                />
              )}
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="text-foreground flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={setting.loop}
                    onChange={(event) =>
                      updateSoundtrack(id, { loop: event.target.checked })
                    }
                    className="accent-primary"
                  />
                  {tr("audio.loop", "Loop")}
                </label>
                <label className="text-muted-foreground flex items-center gap-2 font-semibold">
                  {tr("audio.fade", "Fade ms")}
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    step="50"
                    value={setting.fadeMs}
                    onChange={(event) =>
                      updateSoundtrack(id, {
                        fadeMs: Number(event.target.value),
                      })
                    }
                    className="border-accent bg-background text-foreground w-24 rounded-lg border p-1.5"
                  />
                </label>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
