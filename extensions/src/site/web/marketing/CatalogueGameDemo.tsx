import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react"
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
import { TADAZZ_SFX_BY_CUE } from "../../../presentation/audio-cue-player"
import { SiteButton } from "../shared/SiteButton"
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
type Phase = "intro" | "transition" | "voting" | "results" | "finish"

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
  const soundRef = useRef(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [reducedMotion, setReducedMotion] = useState(false)
  const mounted = useRef(true)
  const revealRef = useRef<(choice?: number) => Promise<void>>(() =>
    Promise.resolve(),
  )
  const question = questions[index]
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
      audio.current?.pause()
      media.removeEventListener("change", update)
    }
  }, [])
  const onCue = useCallback((cue: TadazzV4Cue) => {
    const url = TADAZZ_SFX_BY_CUE[cue.name]

    if (!soundRef.current || !url) {
      return
    }

    const soundEffect = audio.current ?? new Audio()
    audio.current = soundEffect
    soundEffect.pause()
    soundEffect.src = url
    soundEffect.volume = 0.35
    void soundEffect.play().catch(() => {
      // Browsers may block optional audio until the next direct interaction.
    })
  }, [])
  const stageQuestion = (position: number): StageQuestion => {
    const card = questions[position]

    return {
      key: card.key,
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

    transition("transition")
    setIndex(position)
    setVotes((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => Number(key) !== position),
      ),
    )
    await handle.nextQuestion(stageQuestion(position))

    if (!mounted.current) {
      return
    }

    const duration = Math.max(5, questions[position].timeSeconds)
    setSeconds(duration)
    deadline.current = Date.now() + duration * 1000
    transition("voting")
    void handle.openVoting(duration, deadline.current).catch(() => {
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
    run(() => reveal(choice))
  }
  const restart = async () => {
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
  let mainLabel = "Next round"

  if (phase === "intro") {
    mainLabel = "Start game"
  } else if (phase === "finish") {
    mainLabel = "Play again"
  } else if (phase === "voting") {
    mainLabel = "Reveal answer"
  } else if (index === questions.length - 1) {
    mainLabel = quizCount ? "See your score" : "Finish game"
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

  return (
    <ShowThemeScope theme={theme}>
      <section
        className="catalogue-player"
        data-testid="catalogue-game-demo"
        data-catalogue-id={demo.metadata.id}
        data-game-phase={phase}
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
        <div className="catalogue-player-frame" dir="ltr">
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
            interactive
            onSelectOption={choose}
            onCue={onCue}
            reducedMotion={reducedMotion}
          />
        </div>
        <div className="catalogue-player-console">
          <div className="catalogue-player-status" aria-live="polite">
            <strong>{t(demo.metadata.title)}</strong>
            <span>
              {status}
              {phase === "voting" ? ` · ${seconds}s` : ""}
            </span>
          </div>
          {phase === "voting" && (
            <div
              className="catalogue-mobile-answers"
              aria-label={t("Choose an answer")}
            >
              {question.answers.map((answer, answerIndex) => (
                <SiteButton
                  key={answerIndex}
                  disabled={busy}
                  onClick={() => choose(answerIndex)}
                >
                  <b>{answerIndex + 1}</b>
                  <span>{answer.text}</span>
                </SiteButton>
              ))}
            </div>
          )}
          {phase === "results" && question.note && (
            <p className="catalogue-answer-note">{question.note}</p>
          )}
          <div className="catalogue-player-actions">
            <SiteButton
              className="btn btn-outline"
              disabled={busy || phase === "transition"}
              aria-pressed={sound}
              aria-label={t(sound ? "Mute game sounds" : "Enable game sounds")}
              onClick={() => {
                soundRef.current = !soundRef.current
                setSound(soundRef.current)

                if (!soundRef.current) {
                  audio.current?.pause()
                }
              }}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
              {t(sound ? "Sound on" : "Sound off")}
            </SiteButton>
            {phase !== "intro" && (
              <SiteButton
                className="btn btn-outline"
                disabled={busy || phase === "transition"}
                onClick={() => run(back)}
                data-testid="catalogue-back"
              >
                <ArrowLeft size={18} />
                {t("Back")}
              </SiteButton>
            )}
            <SiteButton
              className="btn btn-primary"
              disabled={busy || phase === "transition"}
              onClick={() => run(next)}
              data-testid="catalogue-next"
            >
              {phase === "finish" ? (
                <RotateCcw size={18} />
              ) : (
                <ArrowRight size={18} />
              )}
              {t(mainLabel)}
            </SiteButton>
          </div>
          {error && (
            <p role="alert" className="catalogue-player-error">
              {error}
            </p>
          )}
          <p className="catalogue-player-note">
            {quizCount
              ? t("Play solo. Your answers and score stay in this tab.")
              : t("Play solo. Survey results show only your own choice.")}{" "}
            {t("Use this game to host the complete show with your audience.")}
          </p>
        </div>
      </section>
    </ShowThemeScope>
  )
}
