import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import type { AuthoredPreviewChapter } from "../../core/show-library/full-show-preview-timeline"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import type { StageQuestion } from "../tadazz-show/TadazzStage"

const samplePlayer = {
  en: "Sample player",
  fr: "Joueur exemple",
  de: "Beispielspieler",
  es: "Jugador de ejemplo",
  it: "Giocatore di esempio",
  ja: "サンプルプレイヤー",
  tr: "Örnek oyuncu",
  vi: "Người chơi mẫu",
  he: "שחקן לדוגמה",
} as const

/** Authored content goes through the same public scene projection as live play. */
export function packagePreviewScene(
  frame: ApplicationPreviewFrame,
  chapter: AuthoredPreviewChapter,
): ShowScene {
  if (frame.stagePhase === "lobby") {
    return { kind: "lobby", key: "package-preview-lobby" }
  }

  const card =
    Number.isSafeInteger(chapter.cardIndex) && chapter.cardIndex >= 0
      ? frame.show.cards.at(chapter.cardIndex)
      : undefined

  if (!card) {
    throw new Error("Package preview chapter unavailable")
  }

  if (card.kind !== "quiz" && card.kind !== "survey") {
    return {
      kind: "scene",
      key: card.key,
      scene: { ...card, id: card.key },
      elapsedMs: frame.clock.elapsedMs,
      paused: frame.clock.paused,
      ...(card.kind === "leaderboard"
        ? {
            activeSceneData: {
              leaderboard: {
                entries: [1, 2, 3].map((rank) => ({
                  rank,
                  displayName: `${samplePlayer[frame.locale]} ${rank}`,
                  points: 3200 - rank * 400,
                })),
              },
            },
          }
        : {}),
    }
  }

  const question: StageQuestion = {
    key: card.key,
    question: card.question,
    number: frame.show.cards
      .slice(0, chapter.cardIndex + 1)
      .filter((item) => item.kind === "quiz" || item.kind === "survey").length,
    totalQuestions: frame.show.cards.filter(
      (item) => item.kind === "quiz" || item.kind === "survey",
    ).length,
    options:
      chapter.phase === "question"
        ? []
        : card.answers.map((answer) => ({
            label: answer.text,
            ...(answer.display !== "text" && answer.imageUrl
              ? {
                  image: answer.imageUrl,
                  ...(answer.imageTreatment
                    ? { imageTreatment: answer.imageTreatment }
                    : {}),
                }
              : {}),
          })),
    ...(card.media?.type === "image" ? { questionImage: card.media.url } : {}),
  }

  if (chapter.phase === "results") {
    if (frame.role === "player") {
      return {
        kind: "player-result",
        key: card.key,
        correct: false,
        message: card.kind === "survey" ? "game:answerNoted" : "game:wrong",
        points: 0,
        myPoints: 0,
        rank: 1,
        aheadOfMe: null,
      }
    }

    return {
      kind: "results",
      key: card.key,
      question,
      questionType: card.questionType,
      reveal: {
        mode: card.kind,
        counts: card.answers.map(() => 0),
        percentages: card.answers.map(() => 0),
        ...(card.kind === "quiz"
          ? { solutions: card.correctAnswers.map((number) => number - 1) }
          : {}),
      },
    }
  }

  if (["answerCards", "voting", "voteLocked"].includes(chapter.phase)) {
    return {
      kind: "voting",
      key: card.key,
      question,
      questionType: card.questionType,
      seconds: card.timeSeconds > 0 ? card.timeSeconds : null,
      remainingSeconds:
        frame.clock.deadlineMs === null
          ? null
          : Math.max(0, frame.clock.deadlineMs - frame.clock.elapsedMs) / 1000,
      totalPlayers: 0,
      answers: question.options.map((answer) => answer.label),
      answersOnly: chapter.phase === "answerCards",
    }
  }

  return { kind: "question", key: card.key, question }
}
