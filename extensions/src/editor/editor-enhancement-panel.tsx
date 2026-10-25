import type { QuizExtrasV1 } from "@razzia/extensions/core"
import {
  Eye,
  Image as ImageIcon,
  Music,
  Trophy,
  Users,
  Video,
} from "lucide-react"
import { useState } from "react"
import { AudioCuesSection } from "./components/AudioCuesSection"
import { InterludeSection } from "./components/InterludeSection"
import { LeaderboardSection } from "./components/LeaderboardSection"
import { PreviewSection } from "./components/PreviewSection"
import { RevealSection } from "./components/RevealSection"
import { TeamsSection } from "./components/TeamsSection"
import {
  CANONICAL_ANSWER_COLORS,
  clsx,
  DEFAULT_TEAM_PALETTE,
  type MediaPickerRequestOptions,
  type PerQuestionExtras,
} from "./components/utils"
import { VisualAnswersSection } from "./components/VisualAnswersSection"

export {
  CANONICAL_ANSWER_COLORS,
  DEFAULT_TEAM_PALETTE,
  type MediaPickerRequestOptions,
}

export interface EditorEnhancementPanelProps {
  extras: QuizExtrasV1
  currentQuestionId?: string
  currentQuestionIndex?: number
  currentQuestionTitle?: string
  currentQuestionAnswers?: string[]
  onChange: (_updated: QuizExtrasV1) => void
  onOpenMediaPicker?: (
    _onSelect: (_url: string) => void,
    _options?: MediaPickerRequestOptions,
  ) => void
  className?: string
  t?: (_key: string, _fallback?: string) => string
}

type EditorTab =
  "visuals" | "interlude" | "leaderboard" | "teams" | "audio" | "preview"

export const EditorEnhancementPanel = ({
  extras,
  currentQuestionId,
  currentQuestionIndex = 0,
  currentQuestionTitle = "Question",
  currentQuestionAnswers = ["Answer 1", "Answer 2", "Answer 3", "Answer 4"],
  onChange,
  onOpenMediaPicker,
  className,
  t,
}: EditorEnhancementPanelProps) => {
  const tr = (key: string, fallback: string): string =>
    t ? t(`extensions:${key}`, fallback) : fallback

  const [activeTab, setActiveTab] = useState<EditorTab>("visuals")

  const activeQuestionId =
    currentQuestionId ?? extras.questionIds[currentQuestionIndex]
  const currentPerQuestion: PerQuestionExtras | undefined = activeQuestionId
    ? extras.perQuestion[activeQuestionId]
    : undefined

  const updateCurrentQuestionItem = (
    updater: (_item: PerQuestionExtras) => void,
  ) => {
    if (!activeQuestionId) {
      return
    }

    const item: PerQuestionExtras = {
      ...(extras.perQuestion[activeQuestionId] ?? {}),
    }
    updater(item)

    onChange({
      ...extras,
      perQuestion: {
        ...extras.perQuestion,
        [activeQuestionId]: item,
      },
    })
  }

  const tabs: Array<{
    id: EditorTab
    labelKey: string
    fallback: string
    icon: typeof ImageIcon
  }> = [
    {
      id: "visuals",
      labelKey: "tabs.visuals",
      fallback: "Visuals & Reveal",
      icon: ImageIcon,
    },
    {
      id: "interlude",
      labelKey: "tabs.interludes",
      fallback: "Interludes",
      icon: Video,
    },
    {
      id: "leaderboard",
      labelKey: "tabs.leaderboard",
      fallback: "Leaderboard Policy",
      icon: Trophy,
    },
    { id: "teams", labelKey: "tabs.teams", fallback: "Teams", icon: Users },
    {
      id: "audio",
      labelKey: "tabs.audio",
      fallback: "Sound Cues",
      icon: Music,
    },
    {
      id: "preview",
      labelKey: "tabs.preview",
      fallback: "Preview",
      icon: Eye,
    },
  ]

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
        {tabs.map(({ id, labelKey, fallback, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={clsx(
              "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
              activeTab === id
                ? "border-primary text-primary dark:border-primary dark:text-primary font-bold"
                : "border-transparent text-neutral-600 hover:text-black dark:text-neutral-400 dark:hover:text-white",
            )}
            data-testid={`tab-${id}`}
          >
            <Icon className="size-4" />
            {tr(labelKey, fallback)}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="p-6">
        {activeTab === "visuals" && (
          <div className="flex flex-col gap-8">
            <VisualAnswersSection
              activeQuestionId={activeQuestionId}
              currentPerQuestion={currentPerQuestion}
              currentQuestionAnswers={currentQuestionAnswers}
              updateCurrentQuestionItem={updateCurrentQuestionItem}
              onOpenMediaPicker={onOpenMediaPicker}
              tr={tr}
            />
            <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <RevealSection
                currentPerQuestion={currentPerQuestion}
                updateCurrentQuestionItem={updateCurrentQuestionItem}
                tr={tr}
              />
            </div>
          </div>
        )}

        {activeTab === "interlude" && (
          <InterludeSection
            activeQuestionId={activeQuestionId}
            currentPerQuestion={currentPerQuestion}
            updateCurrentQuestionItem={updateCurrentQuestionItem}
            onOpenMediaPicker={onOpenMediaPicker}
            tr={tr}
          />
        )}

        {activeTab === "leaderboard" && (
          <LeaderboardSection extras={extras} onChange={onChange} tr={tr} />
        )}

        {activeTab === "teams" && (
          <TeamsSection extras={extras} onChange={onChange} tr={tr} />
        )}

        {activeTab === "audio" && (
          <AudioCuesSection extras={extras} onChange={onChange} tr={tr} />
        )}

        {activeTab === "preview" && (
          <PreviewSection
            currentQuestionTitle={currentQuestionTitle}
            currentQuestionAnswers={currentQuestionAnswers}
            currentPerQuestion={currentPerQuestion}
            tr={tr}
          />
        )}
      </div>
    </div>
  )
}
