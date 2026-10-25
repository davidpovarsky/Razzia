import type {
  AudioCueSetting,
  CueId,
  QuizExtrasV1,
} from "@razzia/extensions/core"
import { Play, Square } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { clsx } from "./utils"

interface Props {
  extras: QuizExtrasV1
  onChange: (_updated: QuizExtrasV1) => void
  tr: (_key: string, _fallback: string) => string
}

const DEFAULT_SOUND_MAP: Record<CueId, string> = {
  start: "/sounds/boump.mp3",
  showQuestion: "/sounds/show.mp3",
  answersMusic: "/sounds/answersMusic.mp3",
  answerPressed: "/sounds/answersSound.mp3",
  revealResults: "/sounds/results.mp3",
  leaderboard: "/sounds/snearRoll.mp3",
  podium1: "/sounds/first.mp3",
  podium2: "/sounds/second.mp3",
  podium3: "/sounds/three.mp3",
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

  const handleTestPlay = (cueId: CueId, customUrl?: string) => {
    if (testingCue === cueId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current = null
      }

      setTestingCue(null)

      return
    }

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }

    setTestingCue(cueId)
    const audioUrl = customUrl ?? DEFAULT_SOUND_MAP[cueId]
    const audio = new Audio(audioUrl)
    audioRef.current = audio

    audio.play().catch(() => undefined)
    audio.onended = () => {
      setTestingCue(null)
      audioRef.current = null
    }
  }

  const handleUpdateCue = (cueId: CueId, updates: Partial<AudioCueSetting>) => {
    const existing = audioExtras.cues[cueId]

    onChange({
      ...extras,
      audio: {
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
          const { enabled: isEnabled, volume, source, url, loop } = setting
          const isCustom = source === "media"
          const isPlaying = testingCue === id

          return (
            <div
              key={id}
              className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/40"
              data-testid={`audio-cue-card-${id}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-neutral-800 dark:text-neutral-200">
                  {tr(labelKey, fallback)}
                </span>
                <button
                  type="button"
                  onClick={() => handleTestPlay(id, url)}
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
                  <label className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
                    {tr("audio.source", "Source")}:
                  </label>
                  <select
                    value={setting.source}
                    onChange={(e) =>
                      handleUpdateCue(id, {
                        source: e.target.value as "default" | "media",
                      })
                    }
                    className="focus:ring-primary flex-1 rounded-lg border border-neutral-300 bg-white p-1.5 text-xs focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
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
                    className="focus:ring-primary w-full rounded-lg border border-neutral-300 bg-white p-2 text-xs focus:ring-2 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                    data-testid={`audio-custom-url-${id}`}
                  />
                </div>
              )}

              <div className="flex items-center gap-4 border-t border-neutral-200/60 pt-2 text-xs dark:border-neutral-700/60">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={(e) =>
                      handleUpdateCue(id, { enabled: e.target.checked })
                    }
                    className="accent-primary size-3.5 rounded"
                  />
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">
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
    </div>
  )
}
