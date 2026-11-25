import type { LeaderboardMode, QuizExtrasV1 } from "@razzia/extensions/core"
import { clsx } from "./utils"

interface Props {
  extras: QuizExtrasV1
  onChange: (_updated: QuizExtrasV1) => void
  tr: (_key: string, _fallback: string) => string
}

export const LeaderboardSection = ({ extras, onChange, tr }: Props) => {
  const { leaderboard } = extras
  const currentMode = leaderboard.mode

  const handleModeChange = (mode: LeaderboardMode) => {
    onChange({
      ...extras,
      leaderboard: {
        ...leaderboard,
        mode,
      },
    })
  }

  const handleEveryNChange = (n: number) => {
    onChange({
      ...extras,
      leaderboard: {
        ...leaderboard,
        everyN: n,
      },
    })
  }

  const toggleQuestionSelected = (qId: string) => {
    const list = leaderboard.afterQuestionIds ?? []
    const updated = list.includes(qId)
      ? list.filter((id: string) => id !== qId)
      : [...list, qId]

    onChange({
      ...extras,
      leaderboard: {
        ...leaderboard,
        afterQuestionIds: updated,
      },
    })
  }

  return (
    <div className="flex flex-col gap-6" data-testid="panel-leaderboard">
      <div>
        <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          {tr("tabs.leaderboard", "Leaderboard Policy")}
        </h3>
        <p className="text-xs text-neutral-500">
          {tr(
            "leaderboard.description",
            "Configure when the score leaderboard displays during live gameplay.",
          )}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {(
          [
            {
              mode: "upstream",
              title: tr("leaderboard.modeUpstream", "Default"),
              desc: tr(
                "leaderboard.modeUpstreamDesc",
                "Upstream Razzia behavior (skip on same-category next or final question).",
              ),
            },
            {
              mode: "everyN",
              title: tr("leaderboard.modeEveryN", "Every N Questions"),
              desc: tr(
                "leaderboard.modeEveryNDesc",
                "Show leaderboard every set number of questions.",
              ),
            },
            {
              mode: "selected",
              title: tr("leaderboard.modeSelected", "Selected Questions Only"),
              desc: tr(
                "leaderboard.modeSelectedDesc",
                "Display leaderboard only after chosen question checkpoints.",
              ),
            },
            {
              mode: "categoryEnd",
              title: tr(
                "leaderboard.modeCategoryEnd",
                "Category Boundary Only",
              ),
              desc: tr(
                "leaderboard.modeCategoryEndDesc",
                "Display only when category changes.",
              ),
            },
            {
              mode: "manual",
              title: tr("leaderboard.modeManual", "Manual Trigger Only"),
              desc: tr(
                "leaderboard.modeManualDesc",
                "Only display when host clicks 'Show Leaderboard' during results.",
              ),
            },
          ] as const
        ).map(({ mode, title, desc }) => (
          <label
            key={mode}
            className={clsx(
              "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-all",
              currentMode === mode
                ? "border-primary bg-primary/5 dark:bg-primary/10"
                : "border-border bg-card hover:border-accent text-foreground",
            )}
            data-testid={`leaderboard-mode-${mode}`}
          >
            <input
              type="radio"
              name="leaderboardMode"
              checked={currentMode === mode}
              onChange={() => handleModeChange(mode)}
              className="accent-primary mt-1 size-4"
              data-testid={`mode-radio-${mode}`}
            />
            <div className="flex flex-col">
              <span className="text-foreground text-sm font-bold">{title}</span>
              <span className="text-muted-foreground text-xs">{desc}</span>
            </div>
          </label>
        ))}
      </div>

      {currentMode === "everyN" && (
        <div className="border-border bg-card/60 flex items-center gap-3 rounded-xl border p-4">
          <label className="text-foreground text-sm font-semibold">
            {tr("leaderboard.everyNLabel", "Show leaderboard every")}
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={leaderboard.everyN ?? 1}
            onChange={(e) =>
              handleEveryNChange(Math.max(1, Number(e.target.value)))
            }
            className="focus:ring-primary border-accent bg-background text-foreground w-20 rounded-lg border p-2 text-center text-sm font-bold focus:ring-2 focus:outline-none"
            data-testid="every-n-input"
          />
          <span className="text-muted-foreground text-sm">
            {tr("leaderboard.questionsSuffix", "questions")}
          </span>
        </div>
      )}

      {currentMode === "selected" && (
        <div className="border-border bg-card/60 flex flex-col gap-2 rounded-xl border p-4">
          <span className="text-foreground text-xs font-semibold">
            {tr(
              "leaderboard.selectQuestions",
              "Select which questions show the leaderboard after results:",
            )}
          </span>
          <div className="flex flex-col gap-1.5 pt-2">
            {extras.questionIds.map((qId, idx) => (
              <label
                key={qId}
                className="hover:bg-muted/60 flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5"
              >
                <input
                  type="checkbox"
                  checked={Boolean(leaderboard.afterQuestionIds?.includes(qId))}
                  onChange={() => toggleQuestionSelected(qId)}
                  className="accent-primary size-4 rounded"
                  data-testid={`leaderboard-select-q-${idx}`}
                />
                <span className="text-foreground text-xs font-bold">
                  {tr("host.questionNum", "Question {{num}}").replace(
                    "{{num}}",
                    String(idx + 1),
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
