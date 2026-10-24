import {
  CUE_IDS,
  INTERLUDE_ADVANCES,
  INTERLUDE_KINDS,
  LEADERBOARD_MODES,
  REVEAL_AUDIENCES,
  REVEAL_EFFECTS,
  REVEAL_TRIGGERS,
  type AnswerVisual,
  type AudioCueSetting,
  type CueId,
  type Interlude,
  type QuizExtrasV1,
  type RevealEffect,
  type TeamDefinition,
} from "@razzia/extensions/core"
import {
  Image,
  Music,
  Play,
  Plus,
  Square,
  Trash2,
  Trophy,
  Users,
  Video,
  Volume2,
} from "lucide-react"
import { useState } from "react"
import { InterludePreview } from "../presentation/interlude-preview"
import { RichAnswerCard } from "../media/rich-answer-card"

export interface EditorEnhancementPanelProps {
  extras: QuizExtrasV1
  currentQuestionId?: string
  currentQuestionIndex?: number
  currentQuestionTitle?: string
  currentQuestionAnswers?: string[]
  onChange: (_updated: QuizExtrasV1) => void
  onOpenMediaPicker?: (_onSelect: (_url: string) => void) => void
  className?: string
}

type EditorTab =
  "leaderboard" | "teams" | "audio" | "visuals" | "interlude" | "preview"

const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

const DEFAULT_TEAM_PALETTE = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
  "#06b6d4",
  "#d946ef",
]

/**
 * Integrated EditorEnhancementPanel providing full authoring for:
 * 1. Leaderboard policy (upstream, everyN, selected, categoryEnd, manual)
 * 2. Teams configuration (2..12 teams, names, palette colors)
 * 3. 9 Sound & music cues (start..podium, custom media, loop, volume, mute)
 * 4. Per-question visual answers (text/image/both, alt text, safe URLs) and reveal effects
 * 5. Per-question interludes (title/image/video/countdown, duration, auto/manual)
 * 6. Accessible interactive preview
 */
export const EditorEnhancementPanel = ({
  extras,
  currentQuestionId,
  currentQuestionIndex = 0,
  currentQuestionTitle = "Question",
  currentQuestionAnswers = ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
  onChange,
  onOpenMediaPicker,
  className,
}: EditorEnhancementPanelProps) => {
  const [activeTab, setActiveTab] = useState<EditorTab>("visuals")
  const [testingCue, setTestingCue] = useState<CueId | null>(null)

  const activeQuestionId =
    currentQuestionId ?? extras.questionIds[currentQuestionIndex]
  const currentPerQuestion = activeQuestionId
    ? extras.perQuestion[activeQuestionId]
    : undefined

  // Audio testing helper
  const handleTestPlay = (cueId: CueId, url?: string) => {
    if (testingCue === cueId) {
      setTestingCue(null)

      return
    }

    setTestingCue(cueId)
    const audioUrl = url ?? `/sfx/${cueId}.mp3`
    const audio = new Audio(audioUrl)
    audio.play().catch(() => undefined)
    audio.onended = () => {
      setTestingCue(null)
    }
  }

  // Helper for updating perQuestion items
  const updateCurrentQuestionItem = (
    updater: (_item: NonNullable<typeof currentPerQuestion>) => void,
  ) => {
    if (!activeQuestionId) {
      return
    }

    const item = { ...(extras.perQuestion[activeQuestionId] ?? {}) }
    updater(item)

    onChange({
      ...extras,
      perQuestion: {
        ...extras.perQuestion,
        [activeQuestionId]: item,
      },
    })
  }

  return (
    <div
      className={clsx(
        "flex flex-col rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
      data-testid="editor-enhancement-panel"
    >
      {/* Navigation Tabs Header */}
      <div className="flex overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setActiveTab("visuals")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "visuals"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-visuals"
        >
          <Image className="size-4" />
          Visuals & Reveal
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("interlude")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "interlude"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-interlude"
        >
          <Video className="size-4" />
          Interludes
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("leaderboard")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "leaderboard"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-leaderboard"
        >
          <Trophy className="size-4" />
          Leaderboard Policy
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("teams")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "teams"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-teams"
        >
          <Users className="size-4" />
          Teams
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audio")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "audio"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-audio"
        >
          <Music className="size-4" />
          Sound Cues
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("preview")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
            activeTab === "preview"
              ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
              : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
          )}
          data-testid="tab-preview"
        >
          <Play className="size-4" />
          Preview
        </button>
      </div>

      {/* Tab Contents */}
      <div className="p-6">
        {/* TAB 1: VISUALS & REVEAL */}
        {activeTab === "visuals" && (
          <div className="flex flex-col gap-6" data-testid="panel-visuals">
            {/* Question Reveal Section */}
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">
                Question Image Reveal Effect
              </h3>
              <p className="mb-4 text-xs text-neutral-500">
                Synchronized reveal on presenter/host screen. Safe alt text is
                preserved.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Effect
                  </label>
                  <select
                    value={currentPerQuestion?.reveal?.effect ?? "none"}
                    onChange={(e) => {
                      const effect = e.target.value as RevealEffect
                      updateCurrentQuestionItem((item) => {
                        item.reveal = {
                          effect,
                          durationMs: item.reveal?.durationMs ?? 3000,
                          trigger: item.reveal?.trigger ?? "automatic",
                          audience: item.reveal?.audience ?? "all",
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    data-testid="reveal-effect-select"
                  >
                    {REVEAL_EFFECTS.map((eff) => (
                      <option key={eff} value={eff}>
                        {eff.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Duration (250..15000 ms)
                  </label>
                  <input
                    type="number"
                    min={250}
                    max={15000}
                    step={250}
                    value={currentPerQuestion?.reveal?.durationMs ?? 3000}
                    onChange={(e) => {
                      const durationMs = Number(e.target.value)
                      updateCurrentQuestionItem((item) => {
                        if (item.reveal) {
                          item.reveal.durationMs = durationMs
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    data-testid="reveal-duration-input"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Trigger
                  </label>
                  <select
                    value={currentPerQuestion?.reveal?.trigger ?? "automatic"}
                    onChange={(e) => {
                      const trigger = e.target.value as "automatic" | "manual"
                      updateCurrentQuestionItem((item) => {
                        if (item.reveal) {
                          item.reveal.trigger = trigger
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {REVEAL_TRIGGERS.map((trig) => (
                      <option key={trig} value={trig}>
                        {trig}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Audience
                  </label>
                  <select
                    value={currentPerQuestion?.reveal?.audience ?? "all"}
                    onChange={(e) => {
                      const audience = e.target.value as "all" | "manager"
                      updateCurrentQuestionItem((item) => {
                        if (item.reveal) {
                          item.reveal.audience = audience
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {REVEAL_AUDIENCES.map((aud) => (
                      <option key={aud} value={aud}>
                        {aud}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Answer Picture Visuals Section */}
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-2 text-base font-bold text-neutral-900 dark:text-neutral-100">
                Answer Choice Visuals (Text / Image / Both)
              </h3>
              <p className="mb-4 text-xs text-neutral-500">
                Configure images for answer options. Accessible alt text is
                mandatory for all images.
              </p>

              <div className="flex flex-col gap-4">
                {currentQuestionAnswers.map((answerText, answerIndex) => {
                  const currentVisual = currentPerQuestion?.answerVisuals?.find(
                    (v) => v.answerIndex === answerIndex,
                  )

                  return (
                    <div
                      key={answerIndex}
                      className="flex flex-col gap-3 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 sm:flex-row sm:items-center dark:border-neutral-800 dark:bg-neutral-800/40"
                      data-testid={`answer-visual-row-${answerIndex}`}
                    >
                      <span className="flex size-7 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">
                        {String.fromCharCode(65 + answerIndex)}
                      </span>

                      <div className="flex-1 truncate text-sm font-medium">
                        {answerText || `Choice ${answerIndex + 1}`}
                      </div>

                      <select
                        value={currentVisual?.display ?? "text"}
                        onChange={(e) => {
                          const display = e.target.value as
                            "text" | "image" | "both"
                          updateCurrentQuestionItem((item) => {
                            const visuals = [...(item.answerVisuals ?? [])]
                            const existingIdx = visuals.findIndex(
                              (v) => v.answerIndex === answerIndex,
                            )

                            if (display === "text") {
                              if (existingIdx >= 0) {
                                visuals.splice(existingIdx, 1)
                              }
                            } else {
                              const newVisual: AnswerVisual = {
                                answerIndex,
                                display,
                                url: currentVisual?.url ?? "/media/answer.png",
                                alt:
                                  currentVisual?.alt ??
                                  (answerText || "Choice"),
                              }

                              if (existingIdx >= 0) {
                                visuals[existingIdx] = newVisual
                              } else {
                                visuals.push(newVisual)
                              }
                            }

                            item.answerVisuals = visuals
                          })
                        }}
                        className="rounded-lg border border-neutral-300 bg-white p-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                        data-testid={`display-select-${answerIndex}`}
                      >
                        <option value="text">Text only</option>
                        <option value="image">Image only</option>
                        <option value="both">Text & Image</option>
                      </select>

                      {currentVisual && currentVisual.display !== "text" && (
                        <>
                          <input
                            type="text"
                            placeholder="Media URL (/media/... or https://)"
                            value={currentVisual.url ?? ""}
                            onChange={(e) => {
                              const url = e.target.value
                              updateCurrentQuestionItem((item) => {
                                const target = item.answerVisuals?.find(
                                  (v) => v.answerIndex === answerIndex,
                                )

                                if (target) {
                                  target.url = url
                                }
                              })
                            }}
                            className="flex-1 rounded-lg border border-neutral-300 bg-white p-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                            data-testid={`media-url-input-${answerIndex}`}
                          />

                          {onOpenMediaPicker && (
                            <button
                              type="button"
                              onClick={() => {
                                onOpenMediaPicker((selectedUrl) => {
                                  updateCurrentQuestionItem((item) => {
                                    const list = item.answerVisuals ?? []

                                    for (const target of list) {
                                      if (target.answerIndex === answerIndex) {
                                        target.url = selectedUrl

                                        break
                                      }
                                    }
                                  })
                                })
                              }}
                              className="rounded bg-neutral-200 px-2 py-1 text-xs font-semibold hover:bg-neutral-300 dark:bg-neutral-700"
                            >
                              Browse
                            </button>
                          )}

                          <input
                            type="text"
                            placeholder="Mandatory Alt Text"
                            value={currentVisual.alt}
                            onChange={(e) => {
                              const alt = e.target.value
                              updateCurrentQuestionItem((item) => {
                                const target = item.answerVisuals?.find(
                                  (v) => v.answerIndex === answerIndex,
                                )

                                if (target) {
                                  target.alt = alt
                                }
                              })
                            }}
                            className="flex-1 rounded-lg border border-neutral-300 bg-white p-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                            data-testid={`alt-input-${answerIndex}`}
                          />
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: INTERLUDES */}
        {activeTab === "interlude" && (
          <div className="flex flex-col gap-6" data-testid="panel-interlude">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Interlude After This Question
                </h3>
                <p className="text-xs text-neutral-500">
                  Inserts a title, image, video or countdown card before
                  advancing to the next question.
                </p>
              </div>

              <input
                type="checkbox"
                checked={Boolean(currentPerQuestion?.interlude)}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateCurrentQuestionItem((item) => {
                      item.interlude = {
                        kind: "countdown",
                        title: "Get Ready!",
                        durationMs: 5000,
                        advance: "auto",
                      }
                    })
                  } else {
                    updateCurrentQuestionItem((item) => {
                      delete item.interlude
                    })
                  }
                }}
                className="size-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                data-testid="toggle-interlude"
              />
            </div>

            {currentPerQuestion?.interlude && (
              <div className="grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 p-4 sm:grid-cols-2 dark:border-neutral-800">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Interlude Kind
                  </label>
                  <select
                    value={currentPerQuestion.interlude.kind}
                    onChange={(e) => {
                      const kind = e.target.value as Interlude["kind"]
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.kind = kind
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {INTERLUDE_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {k.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Advance Mode
                  </label>
                  <select
                    value={currentPerQuestion.interlude.advance}
                    onChange={(e) => {
                      const advance = e.target.value as "auto" | "manual"
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.advance = advance
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    {INTERLUDE_ADVANCES.map((adv) => (
                      <option key={adv} value={adv}>
                        {adv}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Title / Heading
                  </label>
                  <input
                    type="text"
                    value={currentPerQuestion.interlude.title ?? ""}
                    onChange={(e) => {
                      const title = e.target.value
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.title = title
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                    placeholder="E.g., Round 2 Begins!"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Duration (1000..30000 ms)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    max={30000}
                    step={1000}
                    value={currentPerQuestion.interlude.durationMs}
                    onChange={(e) => {
                      const durationMs = Number(e.target.value)
                      updateCurrentQuestionItem((item) => {
                        if (item.interlude) {
                          item.interlude.durationMs = durationMs
                        }
                      })
                    }}
                    className="w-full rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </div>

                {(currentPerQuestion.interlude.kind === "image" ||
                  currentPerQuestion.interlude.kind === "video") && (
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      Media URL (/media/... or HTTPS)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={currentPerQuestion.interlude.url ?? ""}
                        onChange={(e) => {
                          const url = e.target.value
                          updateCurrentQuestionItem((item) => {
                            if (item.interlude) {
                              item.interlude.url = url
                            }
                          })
                        }}
                        className="flex-1 rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                      />
                      {onOpenMediaPicker && (
                        <button
                          type="button"
                          onClick={() => {
                            onOpenMediaPicker((url) => {
                              updateCurrentQuestionItem((item) => {
                                if (item.interlude) {
                                  item.interlude.url = url
                                }
                              })
                            })
                          }}
                          className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold hover:bg-neutral-300 dark:bg-neutral-700"
                        >
                          Select
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LEADERBOARD POLICY */}
        {activeTab === "leaderboard" && (
          <div className="flex flex-col gap-5" data-testid="panel-leaderboard">
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Leaderboard Presentation Policy
              </h3>
              <p className="text-xs text-neutral-500">
                Controls when scoring leaderboards appear during the quiz. Never
                appears after final question (podium remains).
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {LEADERBOARD_MODES.map((mode) => (
                <label
                  key={mode}
                  className={clsx(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all",
                    extras.leaderboard.mode === mode
                      ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-900/20"
                      : "border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50",
                  )}
                >
                  <input
                    type="radio"
                    name="leaderboardMode"
                    value={mode}
                    checked={extras.leaderboard.mode === mode}
                    onChange={() => {
                      onChange({
                        ...extras,
                        leaderboard: {
                          ...extras.leaderboard,
                          mode,
                          everyN:
                            mode === "everyN"
                              ? (extras.leaderboard.everyN ?? 3)
                              : undefined,
                        },
                      })
                    }}
                    className="mt-0.5"
                    data-testid={`mode-radio-${mode}`}
                  />
                  <div>
                    <span className="block text-sm font-bold capitalize">
                      {mode === "upstream" ? "Default Upstream" : mode}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {mode === "upstream" &&
                        "Standard skip on same-category or last question."}
                      {mode === "everyN" &&
                        "Display leaderboard every N questions."}
                      {mode === "selected" &&
                        "Display only after specific selected questions."}
                      {mode === "categoryEnd" &&
                        "Display at category transitions."}
                      {mode === "manual" &&
                        "Manager manually triggers leaderboard."}
                    </span>
                  </div>
                </label>
              ))}
            </div>

            {extras.leaderboard.mode === "everyN" && (
              <div className="mt-2 flex items-center gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
                <span className="text-sm font-semibold">
                  Every N questions:
                </span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={extras.leaderboard.everyN ?? 3}
                  onChange={(e) => {
                    onChange({
                      ...extras,
                      leaderboard: {
                        ...extras.leaderboard,
                        everyN: Number(e.target.value),
                      },
                    })
                  }}
                  className="w-24 rounded-lg border border-neutral-300 bg-white p-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  data-testid="every-n-input"
                />
              </div>
            )}
          </div>
        )}

        {/* TAB 4: TEAMS */}
        {activeTab === "teams" && (
          <div className="flex flex-col gap-5" data-testid="panel-teams">
            <div className="flex items-center justify-between rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Team Mode (2..12 Teams)
                </h3>
                <p className="text-xs text-neutral-500">
                  Projects team scores dynamically from individual points. Auto
                  round-robin assign on join.
                </p>
              </div>

              <input
                type="checkbox"
                checked={extras.teams.enabled}
                onChange={(e) => {
                  const enabled = e.target.checked
                  const defaultTeams =
                    extras.teams.teams.length >= 2
                      ? extras.teams.teams
                      : [
                          {
                            id: "team-1",
                            name: "Red Team",
                            color: DEFAULT_TEAM_PALETTE[0],
                          },
                          {
                            id: "team-2",
                            name: "Blue Team",
                            color: DEFAULT_TEAM_PALETTE[1],
                          },
                        ]

                  onChange({
                    ...extras,
                    teams: {
                      enabled,
                      teams: defaultTeams,
                      autoAssign: "roundRobin",
                    },
                  })
                }}
                className="size-5 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                data-testid="toggle-teams"
              />
            </div>

            {extras.teams.enabled && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Configured Teams ({extras.teams.teams.length} of 12)
                  </span>

                  {extras.teams.teams.length < 12 && (
                    <button
                      type="button"
                      onClick={() => {
                        const nextIndex = extras.teams.teams.length + 1
                        const newTeam: TeamDefinition = {
                          id: `team-${Date.now()}`,
                          name: `Team ${nextIndex}`,
                          color:
                            DEFAULT_TEAM_PALETTE[
                              nextIndex % DEFAULT_TEAM_PALETTE.length
                            ],
                        }
                        onChange({
                          ...extras,
                          teams: {
                            ...extras.teams,
                            teams: [...extras.teams.teams, newTeam],
                          },
                        })
                      }}
                      className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
                      data-testid="add-team-button"
                    >
                      <Plus className="size-3.5" />
                      Add Team
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {extras.teams.teams.map((team, index) => (
                    <div
                      key={team.id}
                      className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
                      data-testid={`team-row-${team.id}`}
                    >
                      <input
                        type="color"
                        value={team.color}
                        onChange={(e) => {
                          const newColor = e.target.value
                          const updated = [...extras.teams.teams]
                          updated[index] = { ...team, color: newColor }
                          onChange({
                            ...extras,
                            teams: { ...extras.teams, teams: updated },
                          })
                        }}
                        className="size-8 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                      />

                      <input
                        type="text"
                        maxLength={32}
                        value={team.name}
                        onChange={(e) => {
                          const newName = e.target.value
                          const updated = [...extras.teams.teams]
                          updated[index] = { ...team, name: newName }
                          onChange({
                            ...extras,
                            teams: { ...extras.teams, teams: updated },
                          })
                        }}
                        className="flex-1 rounded-lg border border-neutral-300 bg-white p-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                        placeholder="Team name"
                      />

                      {extras.teams.teams.length > 2 && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = extras.teams.teams.filter(
                              (_, i) => i !== index,
                            )
                            onChange({
                              ...extras,
                              teams: { ...extras.teams, teams: updated },
                            })
                          }}
                          className="text-neutral-400 hover:text-red-500"
                          data-testid={`delete-team-${team.id}`}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: AUDIO CUES */}
        {activeTab === "audio" && (
          <div className="flex flex-col gap-4" data-testid="panel-audio">
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Audio Cues & Music
              </h3>
              <p className="text-xs text-neutral-500">
                Custom sound cues for quiz moments. Defaults are automatically
                provided. Missing files fallback safely.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {CUE_IDS.map((cueId) => {
                const setting: AudioCueSetting = extras.audio.cues[cueId]

                return (
                  <div
                    key={cueId}
                    className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-3 sm:flex-row sm:items-center dark:border-neutral-800"
                    data-testid={`cue-row-${cueId}`}
                  >
                    <span className="w-36 text-xs font-bold capitalize">
                      {cueId}
                    </span>

                    <button
                      type="button"
                      onClick={() => handleTestPlay(cueId, setting.url)}
                      className={clsx(
                        "flex size-7 items-center justify-center rounded-lg text-white",
                        testingCue === cueId
                          ? "bg-red-500"
                          : "bg-neutral-800 dark:bg-neutral-700",
                      )}
                      title="Test Play"
                    >
                      {testingCue === cueId ? (
                        <Square className="size-3" />
                      ) : (
                        <Play className="size-3" />
                      )}
                    </button>

                    <select
                      value={setting.source}
                      onChange={(e) => {
                        const source = e.target.value as "default" | "media"
                        const updatedCues = {
                          ...extras.audio.cues,
                          [cueId]: { ...setting, source },
                        }
                        onChange({
                          ...extras,
                          audio: { cues: updatedCues },
                        })
                      }}
                      className="rounded-lg border border-neutral-300 bg-white p-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <option value="default">Default</option>
                      <option value="media">Custom</option>
                    </select>

                    {setting.source === "media" && (
                      <input
                        type="text"
                        placeholder="/media/... or HTTPS"
                        value={setting.url ?? ""}
                        onChange={(e) => {
                          const url = e.target.value
                          const updatedCues = {
                            ...extras.audio.cues,
                            [cueId]: { ...setting, url },
                          }
                          onChange({
                            ...extras,
                            audio: { cues: updatedCues },
                          })
                        }}
                        className="flex-1 rounded-lg border border-neutral-300 bg-white p-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
                      />
                    )}

                    <div className="flex items-center gap-2">
                      <Volume2 className="size-3.5 text-neutral-400" />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={setting.enabled ? setting.volume : 0}
                        onChange={(e) => {
                          const volume = Number(e.target.value)
                          const updatedCues = {
                            ...extras.audio.cues,
                            [cueId]: {
                              ...setting,
                              volume,
                              enabled: volume > 0,
                            },
                          }
                          onChange({
                            ...extras,
                            audio: { cues: updatedCues },
                          })
                        }}
                        className="w-20"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* TAB 6: PREVIEW */}
        {activeTab === "preview" && (
          <div className="flex flex-col gap-6" data-testid="panel-preview">
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Interactive Preview
              </h3>
              <p className="text-xs text-neutral-500">
                Preview how the current question and answers render with
                visuals.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-xl bg-neutral-900 p-6 text-white">
              <h2 className="text-center text-2xl font-bold">
                {currentQuestionTitle}
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {currentQuestionAnswers.map((ans, idx) => {
                  const visual = currentPerQuestion?.answerVisuals?.find(
                    (v) => v.answerIndex === idx,
                  )
                  const choiceColors = [
                    "bg-red-500",
                    "bg-blue-500",
                    "bg-amber-500",
                    "bg-green-500",
                  ]

                  return (
                    <RichAnswerCard
                      key={idx}
                      label={String.fromCharCode(65 + idx)}
                      text={ans}
                      visual={visual}
                      colorClass={choiceColors[idx % choiceColors.length]}
                    />
                  )
                })}
              </div>

              {currentPerQuestion?.interlude && (
                <div className="mt-6 border-t border-white/20 pt-4">
                  <h4 className="mb-2 text-sm font-semibold tracking-wider text-white/70 uppercase">
                    Interlude Slide Preview
                  </h4>
                  <InterludePreview interlude={currentPerQuestion.interlude} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
