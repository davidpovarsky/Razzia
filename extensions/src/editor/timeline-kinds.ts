import {
  BarChart2,
  DoorOpen,
  Flag,
  HelpCircle,
  Image as ImageIcon,
  Layers,
  ListChecks,
  Play,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react"

export function getTimelineKindOptions(
  t: (key: string, fallback: string) => string,
) {
  return [
    // Group 1: Question
    {
      value: "quiz",
      label: t("extensions:timeline.quiz", "Quiz"),
      icon: Play,
      group: "question",
    },
    {
      value: "survey",
      label: t("extensions:timeline.survey", "Survey"),
      icon: HelpCircle,
      group: "question",
    },
    // Group 2: Media
    {
      value: "media",
      label: t("extensions:timeline.media", "Media"),
      icon: ImageIcon,
      group: "media",
    },
    // Group 3: Effects / Animation
    {
      value: "animation",
      label: t("extensions:timeline.animation", "Animation"),
      icon: Sparkles,
      group: "effects",
    },
    {
      value: "transition",
      label: t("extensions:timeline.transition", "Transition"),
      icon: Layers,
      group: "effects",
    },
    // Group 4: Show Scenes
    {
      value: "opening",
      label: t("extensions:timeline.opening", "Opening"),
      icon: DoorOpen,
      group: "show",
    },
    {
      value: "closing",
      label: t("extensions:timeline.closing", "Closing"),
      icon: Flag,
      group: "show",
    },
    {
      value: "countdown",
      label: t("extensions:timeline.countdown", "Countdown"),
      icon: Timer,
      group: "show",
    },
    // Group 5: Results
    {
      value: "leaderboard",
      label: t("extensions:timeline.leaderboard", "Leaderboard"),
      icon: Trophy,
      group: "results",
    },
    {
      value: "interimResults",
      label: t("extensions:timeline.interimResults", "Interim Results"),
      icon: BarChart2,
      group: "results",
    },
    {
      value: "answerRecap",
      label: t("extensions:timeline.answerRecap", "Answer Recap"),
      icon: ListChecks,
      group: "results",
    },
  ]
}
