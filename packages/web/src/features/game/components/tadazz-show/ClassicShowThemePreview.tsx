import {
  TadazzV4Stage,
  TadazzOpening,
  themeAdapterAsset,
  type TadazzV4Scene,
} from "@razzia/extensions/presentation"
import {
  themeSlotAsset,
  type ResolvedShowTheme,
  type ShowThemeSlotId,
} from "@razzia/extensions/core"
import { useTadazzV4Labels } from "./useTadazzLabels"

export interface ShowThemePreviewProps {
  theme: ResolvedShowTheme
  slot: ShowThemeSlotId
  reducedMotion: boolean
  previewTitle: string
}

const scenes: Record<ShowThemeSlotId, TadazzV4Scene> = {
  firstPaint: "question",
  opening: "company-opening",
  lobby: "connection-readiness",
  question: "question",
  answerCards: "picture-answers",
  voting: "voting-open",
  timer: "countdown",
  voteLock: "vote-locked",
  resultsReveal: "survey-results",
  leaderboard: "leaderboard",
  rankUpdate: "leaderboard",
  zzTransition: "z-wipe",
  interlude: "interlude",
  closing: "grand-finale",
  personalResult: "top-pick",
}

/** Trusted Classic preview composition; additional compiled themes register their own. */
export function ClassicShowThemePreview({
  theme,
  slot,
  reducedMotion,
  previewTitle,
}: ShowThemePreviewProps) {
  const labels = useTadazzV4Labels()
  const poster = theme.definition.assets.find(
    (asset) => asset.id === theme.definition.posterAssetId,
  )?.url

  if (slot === "opening") {
    return (
      <TadazzV4Stage
        reducedMotion={reducedMotion}
        customScreen={
          reducedMotion ? (
            <img
              src={themeAdapterAsset(theme, "brandLogo")}
              alt=""
              className="size-full object-contain"
            />
          ) : (
            <TadazzOpening
              backdropUrl={themeSlotAsset(
                theme,
                "opening",
                "backgroundAssetId",
              )}
              videoUrl={themeSlotAsset(theme, "opening", "mediaAssetId")}
              lottieUrl={themeSlotAsset(theme, "opening", "overlayAssetId")}
              onFinished={() => undefined}
            />
          )
        }
      />
    )
  }

  return (
    <TadazzV4Stage
      initialScene={scenes[slot]}
      reducedMotion={reducedMotion}
      initialData={{
        question: previewTitle,
        answers: [1, 2, 3, 4, 5].map((index) => ({
          title: String(index),
          imageUrl: poster,
        })),
        labels,
        counts: [0, 0, 0, 0, 0],
        percentages: [0, 0, 0, 0, 0],
        winnerIndices: [],
        solutions: [],
        selectedIndex: null,
        mode: "survey",
        number: 1,
        totalQuestions: 1,
        seconds: 10,
        remainingSeconds: 10,
        backgroundUrl:
          theme.slots[slot].mediaUrl ??
          themeAdapterAsset(theme, "showBackdrop"),
        backgroundFit: theme.slots[slot].fit,
        teams: [1, 2].map((index) => ({
          id: String(index),
          name: String(index),
          score: 0,
        })),
      }}
    />
  )
}
