import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"
import { PresentationControls } from "../../../platform-ui"
import { GameViewer } from "../../components/game-viewer/GameViewer"
import { getPublicDemo } from "../../../core/show-library/public-demo-catalogue"
import { tadaShowV1Schema } from "../../../core/show-authoring-schema"
import { resolveShowTheme } from "../../../core/show-themes"
import { isOriginalThemeId } from "../../../core/show-themes/original-theme-families"
import {
  ShowThemeScope,
  showThemeStyle,
  themeAdapterAsset,
} from "../../../presentation/show-themes/context"
import { TadazzV4StageAdapter } from "../../../presentation/tadazz-show/TadazzV4StageAdapter"
import type {
  StageQuestion,
  TadazzStageHandle,
} from "../../../presentation/tadazz-show/TadazzStage"
import type { TadazzV4Cue } from "../../../presentation/tadazz-v4/types"
import { useCatalogueAudio } from "./use-catalogue-audio"
import type { SoundtrackSlotId } from "../../../core/constants"
import { createQuestionLeadIn } from "../../../presentation/question-lead-in"
import { CinematicLayerStack } from "../../../presentation/cinematic-layer-stack"
import { FamilyMixupEvent } from "../../../presentation/family-mixup/FamilyMixupScene"
import {
  catalogueAuthoredSequence,
  catalogueQuestionReplayEntry,
} from "./catalogue-authored-sequence"
import {
  CatalogueMobileQuestion,
  useCatalogueMobileControls,
} from "./CatalogueMobileQuestion"
import { siteText as t } from "../../locales"
import mobileQuestionCss from "./catalogue-mobile-question.css?inline"
import v4Css from "../../../presentation/tadazz-v4/tadazz-v4.css?inline"
import v4LayoutCss from "../../../presentation/tadazz-v4/source-layout.css?inline"
import v4FullShowCss from "../../../presentation/tadazz-v4/full-show.css?inline"
import motionKitCss from "../../../presentation/tadazz-show/tadazz-motion-kit.css?inline"
import stageAdaptationsCss from "../../../presentation/tadazz-show/tadazz-show-adaptations.css?inline"

const nativeStageCss = [
  motionKitCss,
  stageAdaptationsCss,
  v4FullShowCss,
  v4LayoutCss,
  v4Css,
].join("\n")
type Phase =
  | "intro"
  | "transition"
  | "preparing"
  | "question"
  | "voting"
  | "results"
  | "checkpoint"
  | "interlude"
  | "media"
  | "finish"

const soundtrackByPhase: Record<Phase, SoundtrackSlotId> = {
  intro: "lobby",
  transition: "question",
  preparing: "question",
  question: "question",
  voting: "voting",
  results: "results",
  checkpoint: "leaderboard",
  interlude: "roundStart",
  media: "question",
  finish: "finale",
}

// Public solo play consumes the same authored questions and global theme as
// installation. It uses the production stage; votes and score live in this tab.
export function CatalogueGameDemo({
  catalogueId,
  onClose,
}: {
  catalogueId: string
  onClose: () => void
}) {
  const demo = getPublicDemo(catalogueId)

  if (!demo) {
    return <p role="alert">{t("This game is unavailable.")}</p>
  }

  return <CataloguePlayer key={catalogueId} demo={demo} onClose={onClose} />
}

function CataloguePlayer({
  demo,
  onClose,
}: {
  demo: NonNullable<ReturnType<typeof getPublicDemo>>
  onClose: () => void
}) {
  const { i18n } = useTranslation()
  const show = useMemo(() => tadaShowV1Schema.parse(demo.show), [demo])
  const questions = useMemo(
    () =>
      show.cards.filter(
        (card) => card.kind === "quiz" || card.kind === "survey",
      ),
    [show],
  )
  const theme = useMemo(
    () =>
      resolveShowTheme({ selection: show.defaults?.showTheme, role: "player" }),
    [show],
  )
  const originalDemo = isOriginalThemeId(demo.metadata.themeId)
  const familyDemo = demo.metadata.id === "family-mixup"
  const authoredSequence = useMemo(
    () => catalogueAuthoredSequence(show.cards),
    [show],
  )
  const [authoredPosition, setAuthoredPosition] = useState(0)
  const authoredPositionRef = useRef(0)
  const [authoredEpoch, setAuthoredEpoch] = useState(0)
  const authoredEpochRef = useRef(0)
  const completedAuthoredEpochRef = useRef(-1)
  const [mediaReady, setMediaReady] = useState(false)
  const [mediaProblem, setMediaProblem] = useState(false)
  const mediaProblemRef = useRef(false)
  const nextRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const stage = useRef<TadazzStageHandle>(null)
  const [leadIn] = useState(() => createQuestionLeadIn())
  const phaseRef = useRef<Phase>("intro")
  const [phase, setPhase] = useState<Phase>("intro")
  const [index, setIndex] = useState(0)
  const [sceneOffset, setSceneOffset] = useState(-1)
  const [votes, setVotes] = useState<Partial<Record<number, number>>>({})
  const [seconds, setSeconds] = useState(0)
  const deadline = useRef(0)
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [sound, setSound] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const mounted = useRef(true)
  const revealRef = useRef<(choice?: number) => Promise<void>>(() =>
    Promise.resolve(),
  )
  const question = questions[index]
  const followupScenes = useMemo(() => {
    if (!originalDemo || familyDemo) {
      return []
    }

    const position = show.cards.findIndex((card) => card.key === question.key)
    const following = show.cards.slice(position + 1)
    const nextQuestion = following.findIndex(
      (card) => card.kind === "quiz" || card.kind === "survey",
    )

    return (
      nextQuestion < 0 ? following : following.slice(0, nextQuestion)
    ).filter(
      (card) =>
        card.kind === "leaderboard" ||
        card.kind === "answerRecap" ||
        card.kind === "transition" ||
        card.kind === "closing",
    )
  }, [originalDemo, familyDemo, question.key, show])
  const authoredCard = familyDemo
    ? authoredSequence.at(authoredPosition)?.card
    : undefined
  const currentAuthoredScene = familyDemo
    ? authoredCard?.kind !== "quiz" && authoredCard?.kind !== "survey"
      ? authoredCard
      : undefined
    : sceneOffset >= 0
      ? followupScenes.at(sceneOffset)
      : undefined
  const familyMedia =
    familyDemo && phase === "media" && currentAuthoredScene?.kind === "media"
      ? currentAuthoredScene
      : undefined
  const closingCard = show.cards.find((card) => card.kind === "closing")
  const { playEffect, musicUrl } = useCatalogueAudio({
    enabled: sound,
    slot:
      phase === "checkpoint" && currentAuthoredScene?.kind === "answerRecap"
        ? "recap"
        : soundtrackByPhase[phase],
    screenKey: [
      demo.metadata.id,
      index,
      phase,
      familyDemo ? currentAuthoredScene?.key : "",
      familyDemo ? authoredEpoch : "",
    ].join(":"),
    selection: show.defaults?.showTheme,
    cardAudioCues: question.audioCues,
  })
  const compactControls = useCatalogueMobileControls()
  const showMobileQuestion =
    compactControls &&
    (phase === "question" || phase === "voting" || phase === "results")
  // The companion reads the same recorded votes and authored range as the stage.
  const mobileRecapScene =
    phase === "checkpoint" && currentAuthoredScene?.kind === "answerRecap"
      ? currentAuthoredScene
      : undefined
  const showMobileRecap =
    compactControls &&
    demo.metadata.themeId === "magic-storybook" &&
    (mobileRecapScene !== undefined || phase === "finish")
  const mobileRecapStart = mobileRecapScene
    ? Math.max(
        0,
        questions.findIndex(
          (card) => card.key === mobileRecapScene.startQuestionKey,
        ),
      )
    : 0
  const mobileRecapChoices = showMobileRecap
    ? questions.slice(mobileRecapStart, index + 1).flatMap((card, offset) => {
        const position = mobileRecapStart + offset
        const choice = votes[position]
        const answer =
          choice === undefined ? undefined : card.answers.at(choice)

        return answer
          ? [{ key: card.key, number: position + 1, label: answer.text }]
          : []
      })
    : []
  const quizCount = questions.filter((card) => card.kind === "quiz").length
  const score = questions.reduce(
    (sum, card, position) =>
      sum +
      (card.kind === "quiz" &&
      card.correctAnswers.includes((votes[position] ?? -2) + 1)
        ? card.maxPoints
        : 0),
    0,
  )
  const transition = (next: Phase) => {
    phaseRef.current = next

    if (mounted.current) {
      setPhase(next)
    }
  }
  const run = (action: () => Promise<void>) => {
    if (busyRef.current) {
      return
    }

    busyRef.current = true
    setBusy(true)
    setError("")
    void action()
      .catch(() => {
        if (mounted.current) {
          setError(t("The game could not continue. Please try again."))
        }
      })
      .finally(() => {
        busyRef.current = false

        if (mounted.current) {
          setBusy(false)
        }
      })
  }
  useEffect(() => {
    mounted.current = true
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReducedMotion(media.matches)
    const update = () => setReducedMotion(media.matches)
    media.addEventListener("change", update)
    if (familyDemo) void stage.current?.showCustomScreen()
    else void stage.current?.showIntro()

    return () => {
      mounted.current = false
      leadIn.cancel()
      media.removeEventListener("change", update)
    }
  }, [])
  const onCue = useCallback(
    (cue: TadazzV4Cue) => {
      playEffect(cue.name)
    },
    [playEffect],
  )
  const onQuestionPresented = useCallback(
    (questionKey: string) => {
      if (!mounted.current) {
        return
      }

      leadIn.present(questionKey, () => {
        flushSync(() => {
          phaseRef.current = "question"
          setPhase("question")
        })
      })
    },
    [leadIn],
  )
  const stageQuestion = (position: number): StageQuestion => {
    const card = questions[position]

    return {
      key: card.key,
      answerCount: card.answers.length,
      hasAnswerImages: card.answers.some((answer) => Boolean(answer.imageUrl)),
      question: card.question,
      number: position + 1,
      totalQuestions: questions.length,
      round: Math.floor(position / (familyDemo ? 8 : originalDemo ? 2 : 4)) + 1,
      note: card.note,
      ...(card.media?.type === "image"
        ? { questionImage: card.media.url }
        : {}),
      options: card.answers.map((answer) => ({
        label: answer.text,
        ...(answer.imageUrl
          ? {
              image: answer.imageUrl,
              alt: answer.alt ?? answer.text,
              display: answer.display === "image" ? "image" : "both",
            }
          : {}),
      })),
    }
  }
  const startQuestion = async (position: number) => {
    const handle = stage.current

    if (!handle) {
      return
    }

    transition("preparing")
    setIndex(position)
    setSceneOffset(-1)
    setVotes((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) =>
          originalDemo ? Number(key) < position : Number(key) !== position,
        ),
      ),
    )
    const stageCard = stageQuestion(position)
    const ready = leadIn.wait(stageCard.key)
    // The first presented question frame starts the shared two-second reading
    // interval. Pending React work must never consume the visible reading time.
    void handle.showQuestion({ ...stageCard, options: [] }).catch(() => {
      leadIn.cancel()

      if (mounted.current) {
        setError(t("The game could not continue. Please try again."))
      }
    })
    const opensAt = await ready

    if (!mounted.current || opensAt === null || stage.current !== handle) {
      return
    }

    const duration = Math.max(5, questions[position].timeSeconds)
    setSeconds(duration)
    deadline.current = opensAt + duration * 1000
    transition("voting")
    void handle.openVoting(duration, deadline.current, stageCard).catch(() => {
      // Revealing an answer or leaving the player cancels the voting animation.
    })
  }
  const reveal = async (choice?: number) => {
    const handle = stage.current

    if (!handle) {
      return
    }

    transition("results")
    await handle.revealResults({
      mode: question.kind,
      counts: question.answers.map((_, answer) => (answer === choice ? 1 : 0)),
      ...(question.kind === "quiz"
        ? {
            solutions: question.correctAnswers.map((answer) => answer - 1),
          }
        : {}),
      showPercentages: false,
    })
  }
  revealRef.current = reveal
  useEffect(() => {
    if (phase !== "voting") {
      return
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((deadline.current - Date.now()) / 1000),
      )
      setSeconds(remaining)

      if (
        remaining === 0 &&
        phaseRef.current === "voting" &&
        !busyRef.current
      ) {
        transition("results")
        run(() => revealRef.current())
      }
    }
    const timer = window.setInterval(tick, 200)

    return () => window.clearInterval(timer)
  }, [phase, index])
  const choose = (choice: number) => {
    if (phaseRef.current !== "voting" || busyRef.current) {
      return
    }

    setVotes((previous) => ({ ...previous, [index]: choice }))
    stage.current?.setSelectedOptions([choice])
    playEffect(
      "answer-submitted",
      [demo.metadata.id, index, "submitted"].join(":"),
    )
    run(() => reveal(choice))
  }
  const restart = async () => {
    leadIn.cancel()
    setVotes({})
    setIndex(0)
    setSceneOffset(-1)
    if (familyDemo) return enterAuthoredCard(0)
    transition("intro")
    await stage.current?.showIntro()
  }
  // Family solo play follows the actual authored sequence. Quiz presentation,
  // voting, scoring and controls remain owned by this existing native player.
  const enterAuthoredCard = async (position: number) => {
    const step = authoredSequence.at(position)
    if (!step || !mounted.current) return
    const card = step.card
    leadIn.cancel()
    authoredPositionRef.current = position
    authoredEpochRef.current += 1
    mediaProblemRef.current = false
    flushSync(() => {
      setAuthoredPosition(position)
      setAuthoredEpoch(authoredEpochRef.current)
      setMediaReady(false)
      setMediaProblem(false)
      setError("")
      setIndex(step.questionIndex)
    })

    if (card.kind === "quiz" || card.kind === "survey") {
      return startQuestion(step.questionIndex)
    }
    if (card.kind === "leaderboard") {
      transition("checkpoint")
      await stage.current?.showLeaderboard(
        [{ id: "solo-player", name: t("You"), score }],
        t(card.title ?? "Your score"),
      )
      return
    }

    transition(
      card.kind === "opening"
        ? "intro"
        : card.kind === "closing"
          ? "finish"
          : card.kind === "media"
            ? "media"
            : "interlude",
    )
    await stage.current?.showCustomScreen()
  }
  const next = async () => {
    if (familyDemo) {
      if (phaseRef.current === "voting") return reveal()
      if (phaseRef.current === "finish") return restart()
      // A failed observation is replayed, never silently bypassed into a quiz.
      if (phaseRef.current === "media" && mediaProblemRef.current) {
        return enterAuthoredCard(authoredPositionRef.current)
      }
      return enterAuthoredCard(authoredPositionRef.current + 1)
    }
    if (phaseRef.current === "intro") {
      return startQuestion(0)
    }

    if (phaseRef.current === "voting") {
      return reveal()
    }

    if (phaseRef.current === "finish") {
      return restart()
    }

    if (originalDemo) {
      const scene = followupScenes.at(sceneOffset + 1)

      if (scene) {
        setSceneOffset((previous) => previous + 1)

        if (scene.kind === "leaderboard") {
          transition("checkpoint")
          await stage.current?.showLeaderboard(
            [{ id: "solo-player", name: t("You"), score }],
            t(scene.title ?? "Your score"),
          )

          return
        }

        if (scene.kind === "answerRecap") {
          transition("checkpoint")
          const startsAt = Math.max(
            0,
            questions.findIndex((card) => card.key === scene.startQuestionKey),
          )
          const winners = questions
            .slice(startsAt, index + 1)
            .flatMap((card, offset) => {
              const choice = votes[startsAt + offset]
              const answer =
                choice === undefined ? undefined : card.answers.at(choice)

              return answer
                ? [
                    {
                      label: answer.text,
                      ...(answer.imageUrl
                        ? {
                            image: answer.imageUrl,
                            alt: answer.alt ?? answer.text,
                          }
                        : {}),
                    },
                  ]
                : []
            })

          if (winners.length) {
            await stage.current?.showRoundRecap?.({
              winners,
              round: Math.floor(index / 2) + 1,
              title: t(scene.title ?? "Your story choices"),
            })
          } else {
            await stage.current?.showInterlude?.({
              title: t(scene.title ?? "Your story choices"),
              subtitle: t("No choices yet"),
            })
          }

          return
        }

        if (scene.kind === "transition") {
          transition("interlude")
          await stage.current?.showInterlude?.({
            title: t(scene.title ?? "The adventure continues"),
            subtitle: scene.description ? t(scene.description) : undefined,
          })

          return
        }
        // The final authored closing uses the same native finale owner below.
      }
    }

    if (index < questions.length - 1) {
      return startQuestion(index + 1)
    }

    transition("finish")

    if (quizCount) {
      await stage.current?.showFinale({ name: t("You"), score })
    } else {
      await stage.current?.showInterlude?.({
        ...(originalDemo ? { eyebrow: t("Thanks for playing together!") } : {}),
        title:
          originalDemo && closingCard
            ? t(closingCard.title)
            : t("Thanks for playing together!"),
        subtitle:
          originalDemo && closingCard?.subtitle
            ? t(closingCard.subtitle)
            : t("You shared {{count}} choices", {
                count: Object.keys(votes).length,
              }),
      })
    }
  }
  nextRef.current = next

  const completeAuthoredScene = (key: string, epoch: number) => {
    if (
      !mounted.current ||
      busyRef.current ||
      mediaProblemRef.current ||
      authoredEpochRef.current !== epoch ||
      completedAuthoredEpochRef.current === epoch ||
      authoredSequence.at(authoredPositionRef.current)?.card.key !== key
    )
      return
    completedAuthoredEpochRef.current = epoch
    run(() => nextRef.current())
  }
  const failAuthoredMedia = (key: string, epoch: number) => {
    if (
      !mounted.current ||
      authoredEpochRef.current !== epoch ||
      authoredSequence.at(authoredPositionRef.current)?.card.key !== key ||
      phaseRef.current !== "media"
    )
      return
    mediaProblemRef.current = true
    setMediaProblem(true)
    setError(t("This clip could not finish. Replay it to continue."))
  }
  useEffect(() => {
    if (!familyDemo || !currentAuthoredScene) return
    const card = currentAuthoredScene
    const epoch = authoredEpoch
    // Opening remains the standard explicit Start gate. Authored round cards
    // then run for their own duration, before the first question of each round.
    if (
      phase === "interlude" &&
      card.kind === "transition" &&
      card.advance === "auto"
    ) {
      const timer = window.setTimeout(
        () => completeAuthoredScene(card.key, epoch),
        Math.max(0, card.durationMs ?? 2500),
      )
      return () => window.clearTimeout(timer)
    }
    if (phase !== "media" || card.kind !== "media" || mediaProblem) return
    const timers: number[] = []
    if (card.mediaType === "image" && mediaReady) {
      timers.push(
        window.setTimeout(
          () => completeAuthoredScene(card.key, epoch),
          Math.max(0, card.durationMs ?? 3000),
        ),
      )
    }
    // Genuine video completion is authoritative. This is only a bounded error
    // watchdog; it must not open a memory question after an unseen/stalled clip.
    timers.push(
      window.setTimeout(
        () => failAuthoredMedia(card.key, epoch),
        Math.max(
          card.mediaEndFallbackMs ?? 0,
          (card.durationMs ?? 8000) + 1500,
        ),
      ),
    )
    return () => timers.forEach(window.clearTimeout)
  }, [
    familyDemo,
    currentAuthoredScene,
    phase,
    authoredEpoch,
    mediaReady,
    mediaProblem,
  ])

  const back = async () => {
    if (familyDemo) {
      if (index === 0) return restart()
      const target = ["finish", "checkpoint", "interlude", "media"].includes(
        phaseRef.current,
      )
        ? index
        : index - 1
      return enterAuthoredCard(
        catalogueQuestionReplayEntry(authoredSequence, target),
      )
    }
    if (
      phaseRef.current === "finish" ||
      phaseRef.current === "checkpoint" ||
      phaseRef.current === "interlude"
    ) {
      return startQuestion(index)
    }

    if (index === 0) {
      return restart()
    }

    await startQuestion(index - 1)
  }
  let status = familyDemo
    ? `${t("Round {{current}} of {{total}}", { current: Math.floor(index / 8) + 1, total: 6 })} · ${t("Question {{current}} of {{total}}", { current: index + 1, total: questions.length })}`
    : t("Round {{current}} of {{total}}", {
        current: index + 1,
        total: questions.length,
      })

  if (phase === "intro") {
    status = t("{{count}} rounds", { count: familyDemo ? 6 : questions.length })
  } else if (
    (phase === "checkpoint" || phase === "interlude" || phase === "media") &&
    currentAuthoredScene
  ) {
    status = t(currentAuthoredScene.title ?? "Your score")
  } else if (phase === "finish") {
    status = quizCount
      ? t("Your score: {{score}}", { score })
      : t("You shared {{count}} choices", { count: Object.keys(votes).length })
  }

  let nextState: "start" | "replay" | "next" = "next"

  if (phase === "intro") {
    nextState = "start"
  } else if (phase === "finish" || (phase === "media" && mediaProblem)) {
    nextState = "replay"
  }

  return (
    <ShowThemeScope theme={theme}>
      <section
        className="catalogue-player"
        data-testid="catalogue-game-demo"
        data-catalogue-id={demo.metadata.id}
        data-game-phase={phase}
        data-authored-scene={currentAuthoredScene?.key}
        data-audio-url={musicUrl}
        data-question-index={index}
        data-question-count={questions.length}
        data-theme-id={demo.metadata.themeId}
        data-game-mode={question.kind}
        data-game-media={
          question.answers.some((answer) => answer.imageUrl) ? "image" : "text"
        }
        data-answer-count={question.answers.length}
        aria-label={t(demo.metadata.title)}
        style={showThemeStyle(theme)}
      >
        <style>{nativeStageCss}</style>
        <GameViewer
          onClose={onClose}
          title={t(demo.metadata.title)}
          status={`${status}${phase === "voting" ? ` · ${seconds}s` : ""}`}
          controls={
            <>
              {showMobileQuestion && (
                <CatalogueMobileQuestion
                  question={stageQuestion(index)}
                  questionType={question.kind}
                  voting={phase === "voting"}
                  showAnswers={phase !== "question"}
                  busy={busy}
                  selected={votes[index]}
                  correctAnswers={
                    phase === "results" && question.kind === "quiz"
                      ? question.correctAnswers.map((answer) => answer - 1)
                      : undefined
                  }
                  onChoose={choose}
                />
              )}
              {showMobileRecap && (
                <section
                  className="catalogue-mobile-question catalogue-mobile-recap"
                  data-testid="catalogue-mobile-recap"
                  data-phase={phase}
                  aria-label={t("Your story choices")}
                  dir={i18n.dir()}
                >
                  <style>{mobileQuestionCss}</style>
                  <h2 data-testid="catalogue-mobile-recap-heading" dir="auto">
                    {t(mobileRecapScene?.title ?? "Your story choices")}
                  </h2>
                  {mobileRecapChoices.length ? (
                    <ol className="catalogue-mobile-recap-list">
                      {mobileRecapChoices.map((choice) => (
                        <li
                          key={choice.key}
                          value={choice.number}
                          data-question-key={choice.key}
                          data-selected="true"
                        >
                          <span
                            className="catalogue-mobile-recap-label"
                            data-testid="catalogue-mobile-recap-label"
                            dir="auto"
                          >
                            {choice.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p data-testid="catalogue-mobile-recap-empty">
                      {t("No choices yet")}
                    </p>
                  )}
                </section>
              )}
              <PresentationControls
                previous={{
                  disabled:
                    busy ||
                    phase === "intro" ||
                    phase === "transition" ||
                    phase === "question",
                  onClick: () => run(back),
                  testId: "catalogue-back",
                }}
                next={{
                  state: nextState,
                  disabled:
                    busy ||
                    phase === "transition" ||
                    phase === "question" ||
                    (phase === "media" && !mediaProblem),
                  onClick: () => run(next),
                  testId: "catalogue-next",
                }}
                replay={
                  phase === "finish"
                    ? undefined
                    : {
                        disabled:
                          busy ||
                          phase === "transition" ||
                          phase === "question",
                        onClick: () => run(restart),
                        testId: "catalogue-replay",
                      }
                }
                sound={{
                  enabled: sound,
                  onClick: () => setSound((value) => !value),
                  testId: "catalogue-sound",
                }}
              />
              {error && (
                <p role="alert" className="catalogue-player-error">
                  {error}
                </p>
              )}
            </>
          }
          details={
            <>
              {phase === "results" && question.note && (
                <p className="catalogue-answer-note">{question.note}</p>
              )}
              <p className="catalogue-player-note">
                {quizCount
                  ? t("Play solo. Your answers and score stay in this tab.")
                  : t(
                      "Play solo. Survey results show only your own choice.",
                    )}{" "}
                {t(
                  "Use this game to host the complete show with your audience.",
                )}
              </p>
            </>
          }
        >
          <div
            className="catalogue-player-frame"
            data-testid="catalogue-native-stage"
            dir="ltr"
            aria-hidden={showMobileQuestion || showMobileRecap || undefined}
          >
            <TadazzV4StageAdapter
              ref={stage}
              customScreen={
                familyDemo &&
                currentAuthoredScene &&
                ["opening", "transition", "closing"].includes(
                  currentAuthoredScene.kind,
                ) ? (
                  <FamilyMixupEvent
                    scene={{
                      ...currentAuthoredScene,
                      id: currentAuthoredScene.key,
                    }}
                  />
                ) : familyMedia ? (
                  <div />
                ) : undefined
              }
              overlay={
                familyMedia ? (
                  <div
                    key={`${familyMedia.key}:${authoredEpoch}`}
                    className="tz-scene-media"
                    style={{ zIndex: 20 }}
                    data-testid="catalogue-authored-media"
                    data-media-state={mediaProblem ? "error" : "playing"}
                    onErrorCapture={() =>
                      failAuthoredMedia(familyMedia.key, authoredEpoch)
                    }
                    onLoadCapture={() => setMediaReady(true)}
                    onCanPlayCapture={() => setMediaReady(true)}
                  >
                    <CinematicLayerStack
                      sceneId={familyMedia.key}
                      sceneKind="media"
                      epoch={authoredEpoch}
                      mediaUrl={familyMedia.mediaUrl}
                      mediaType={familyMedia.mediaType}
                      mediaFit={familyMedia.mediaFit ?? "contain"}
                      volume={familyMedia.volume}
                      loop={false}
                      muted
                      endBehavior={familyMedia.endBehavior}
                      contrastOverlayOpacity={0}
                      titleSlotVisible={false}
                      controlledPaused={mediaProblem}
                      showAutoplayControl={false}
                      onForegroundMediaEnded={() =>
                        completeAuthoredScene(familyMedia.key, authoredEpoch)
                      }
                    />
                  </div>
                ) : undefined
              }
              labels={{
                introCaption: originalDemo
                  ? t(demo.metadata.title)
                  : demo.metadata.title,
                footer: originalDemo
                  ? t(demo.metadata.title)
                  : demo.metadata.title,
                ...(originalDemo && closingCard
                  ? { champion: t(closingCard.title) }
                  : {}),
                correctAnswer: t("Correct answer"),
                audienceFavourite: t("Your choice"),
                audienceResults: t("Your choice"),
              }}
              v4Labels={{
                audienceResults:
                  question.kind === "quiz"
                    ? t("Correct answer")
                    : t("Your choice"),
                mostChosenAnswer: t("Your choice"),
              }}
              backdropUrl={themeAdapterAsset(theme, "questionBackdrop")}
              interactive={!showMobileQuestion && !showMobileRecap}
              onSelectOption={choose}
              onCue={onCue}
              onQuestionPresented={onQuestionPresented}
              reducedMotion={reducedMotion}
            />
          </div>
        </GameViewer>
      </section>
    </ShowThemeScope>
  )
}
