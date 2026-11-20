import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { PresentationControls } from "../../../platform-ui"
import { GameViewer } from "../../components/game-viewer/GameViewer"
import { getPublicDemo } from "../../../core/show-library/public-demo-catalogue"
import { tadaShowV1Schema } from "../../../core/show-authoring-schema"
import { resolveShowTheme } from "../../../core/show-themes"
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
import {
  CatalogueMobileQuestion,
  useCatalogueMobileControls,
} from "./CatalogueMobileQuestion"
import { siteText as t } from "../../locales"
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
  "intro" | "transition" | "question" | "voting" | "results" | "finish"

const soundtrackByPhase: Record<Phase, SoundtrackSlotId> = {
  intro: "lobby",
  transition: "question",
  question: "question",
  voting: "voting",
  results: "results",
  finish: "finale",
}

// Public solo play consumes the same authored questions and global theme as
// installation. It uses the production stage; votes and score live in this tab.
export function CatalogueGameDemo({ catalogueId }: { catalogueId: string }) {
  const demo = getPublicDemo(catalogueId)

  if (!demo) {
    return <p role="alert">{t("This game is unavailable.")}</p>
  }

  return <CataloguePlayer key={catalogueId} demo={demo} />
}

function CataloguePlayer({
  demo,
}: {
  demo: NonNullable<ReturnType<typeof getPublicDemo>>
}) {
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
  const stage = useRef<TadazzStageHandle>(null)
  const [leadIn] = useState(() => createQuestionLeadIn())
  const phaseRef = useRef<Phase>("intro")
  const [phase, setPhase] = useState<Phase>("intro")
  const [index, setIndex] = useState(0)
  const [votes, setVotes] = useState<Record<number, number>>({})
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
  const { playEffect, musicUrl } = useCatalogueAudio({
    enabled: sound,
    slot: soundtrackByPhase[phase],
    screenKey: [demo.metadata.id, index, phase].join(":"),
    selection: show.defaults?.showTheme,
    cardAudioCues: question.audioCues,
  })
  const compactControls = useCatalogueMobileControls()
  const showMobileQuestion =
    compactControls &&
    (phase === "question" || phase === "voting" || phase === "results")
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
    void stage.current?.showIntro()

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
  const stageQuestion = (position: number): StageQuestion => {
    const card = questions[position]

    return {
      key: card.key,
      answerCount: card.answers.length,
      hasAnswerImages: card.answers.some((answer) => Boolean(answer.imageUrl)),
      question: card.question,
      number: position + 1,
      totalQuestions: questions.length,
      round: Math.floor(position / 4) + 1,
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

    transition("question")
    setIndex(position)
    setVotes((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => Number(key) !== position),
      ),
    )
    const stageCard = stageQuestion(position)
    const ready = leadIn.wait()
    // Enter the question once. The platform clock, not the entrance animation,
    // decides when answer cards and their voting deadline appear.
    void handle.showQuestion({ ...stageCard, options: [] }).catch(() => {
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
    transition("intro")
    await stage.current?.showIntro()
  }
  const next = async () => {
    if (phaseRef.current === "intro") {
      return startQuestion(0)
    }

    if (phaseRef.current === "voting") {
      return reveal()
    }

    if (phaseRef.current === "finish") {
      return restart()
    }

    if (index < questions.length - 1) {
      return startQuestion(index + 1)
    }

    transition("finish")

    if (quizCount) {
      await stage.current?.showFinale({ name: t("You"), score })
    } else {
      await stage.current?.showInterlude?.({
        title: t("Thanks for playing together!"),
        subtitle: t("You shared {{count}} choices", {
          count: Object.keys(votes).length,
        }),
      })
    }
  }
  const back = async () => {
    if (phaseRef.current === "finish") {
      return startQuestion(index)
    }

    if (index === 0) {
      return restart()
    }

    await startQuestion(index - 1)
  }
  let status = t("Round {{current}} of {{total}}", {
    current: index + 1,
    total: questions.length,
  })

  if (phase === "intro") {
    status = t("{{count}} rounds", { count: questions.length })
  } else if (phase === "finish") {
    status = quizCount
      ? t("Your score: {{score}}", { score })
      : t("You shared {{count}} choices", { count: Object.keys(votes).length })
  }

  let nextState: "start" | "replay" | "next" = "next"

  if (phase === "intro") {
    nextState = "start"
  } else if (phase === "finish") {
    nextState = "replay"
  }

  return (
    <ShowThemeScope theme={theme}>
      <section
        className="catalogue-player"
        data-testid="catalogue-game-demo"
        data-catalogue-id={demo.metadata.id}
        data-game-phase={phase}
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
                    busy || phase === "transition" || phase === "question",
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
            aria-hidden={showMobileQuestion || undefined}
          >
            <TadazzV4StageAdapter
              ref={stage}
              labels={{
                introCaption: demo.metadata.title,
                footer: demo.metadata.title,
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
              interactive={!showMobileQuestion}
              onSelectOption={choose}
              onCue={onCue}
              reducedMotion={reducedMotion}
            />
          </div>
        </GameViewer>
      </section>
    </ShowThemeScope>
  )
}
