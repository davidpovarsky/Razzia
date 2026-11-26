import { projectLobbyJoin } from "../../core/studio-timeline-schema"
import NativeButton from "../../../../packages/web/src/components/Button"
import { flushSync } from "react-dom"
import { I18nextProvider } from "react-i18next"
import { NativeClassicLobbyPanel } from "./native-room-panel"
import { NativeClassicPlayerResult } from "./native-player-result"
import { resolveRoomJoin } from "../room-join/contract"
// oxlint-disable typescript/no-unnecessary-condition -- Sparse chapter arrays and asynchronous stage completion require runtime guards.
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert"
import {
  applicationChapterPhase,
  compileFullShowPreviewTimeline,
} from "../../core/show-library/full-show-preview-timeline"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import { resolveStageLook } from "../../core/stage-look"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import {
  ShowThemeScope,
  showThemeStyle,
  themeAdapterAsset,
} from "../show-themes/context"
import type { ScenePresenterProps } from "../scene-presenter"
import { NativeClassicScene } from "./native-classic-scene"
import { themeSlotForSceneKind } from "../show-themes/scene"
import { TadazzV4StageAdapter } from "../tadazz-show/TadazzV4StageAdapter"
import type {
  StageQuestion,
  TadazzStageHandle,
} from "../tadazz-show/TadazzStage"
import {
  collapseForResume,
  planTransition,
  runSteps,
  showSceneTransitionIdentity,
  type StageStep,
} from "../tadazz-show/show-director"
import type { ShowScene } from "../tadazz-show/presentation-scene"
import { previewNativeLabels } from "./i18n"
import {
  ApplicationComposition,
  admittedApplicationTemplate,
} from "./application-composition"
import { RazziaApplicationStage } from "./razzia-application-stage"
import type { PreviewPhase } from "../../core/show-library/primitives"
import { resolveTadazzStageBackground } from "../../core/tadazz-appearance"
import type { ShowThemeSlotId } from "../../core/show-themes/selection"
import { AudioCuePlayer } from "../audio-cue-player"
import { resolveTadazzAudioPolicy } from "../tadazz-audio-policy"
import type { CueId } from "../../core/constants"
import { NativeQuestionMedia } from "../tadazz-show/native-question-media"
import { createPreviewStageContinuity } from "./preview-stage-continuity"
import { createShowThemeRegistry } from "../../core/show-themes/registry"
import { PackageApplicationPreviewStage } from "./package-application-stage"
import { observeQuestionPresentation } from "../question-lead-in"
import { isOriginalThemeId } from "../../core/show-themes/original-theme-families"

// First-party native stage only. The host admits exact built bytes and account assets
// before mounting. This component has no room/socket/score/telephone transport.
//
interface ApplicationPreviewStageProps {
  frame: ApplicationPreviewFrame
  questionPosition?: { number: number; total: number }
  activeSceneData?: ScenePresenterProps["activeSceneData"]
  onCommitted: () => void
  onUnavailable: () => void
}

export function ApplicationPreviewStage(props: ApplicationPreviewStageProps) {
  return props.frame.packageContext ? (
    <PackageApplicationPreviewStage
      {...props}
      renderNative={(frame) => (
        <NativeApplicationPreviewStage {...props} frame={frame} />
      )}
    />
  ) : (
    <NativeApplicationPreviewStage {...props} />
  )
}

function NativeApplicationPreviewStage({
  frame,
  questionPosition,
  activeSceneData,
  onCommitted,
  onUnavailable,
}: ApplicationPreviewStageProps) {
  const stage = useRef<TadazzStageHandle>(null)
  const chapters = useMemo(
    () => compileFullShowPreviewTimeline(frame.show),
    [frame.show],
  )
  const bundle = useMemo(
    () => authoredShowToNativeBundleDraft(frame.show, "preview"),
    [frame.show],
  )
  const chapter = chapters[frame.chapterIndex]
  const card = chapter ? frame.show.cards[chapter.cardIndex] : undefined
  const phase: PreviewPhase =
    frame.stagePhase ??
    applicationChapterPhase(chapter?.phase ?? "question", frame.role)
  const template = useMemo(
    () => admittedApplicationTemplate(frame, phase),
    [
      frame.appearance,
      frame.role,
      phase,
      frame.chapterIndex,
      frame.show,
      frame.scopeIds,
      frame.stagePhase,
    ],
  )
  const rootComponent = template?.nodes.find(
    (node) => node.nodeId === template.rootNodeId,
  )?.component.id
  const rootFit = template?.nodes.find(
    (node) => node.nodeId === template.rootNodeId,
  )?.props.fit
  const registry = useMemo(
    () => createShowThemeRegistry(frame.packageContext?.definitions),
    [frame.packageContext?.definitions],
  )
  const theme = useMemo(
    () =>
      resolveShowTheme({
        selection: frame.show.defaults?.showTheme,
        scope: frame.stagePhase ? undefined : card?.themeOverrides,
        role: frame.role,
        registry,
      }),
    [
      frame.show.defaults?.showTheme,
      card,
      frame.role,
      frame.stagePhase,
      registry,
    ],
  )
  const labels = useMemo(
    () => previewNativeLabels(frame.locale),
    [frame.locale],
  )
  const originalFamily =
    theme.definition.rendererId === "tadazz-original-stage" &&
    isOriginalThemeId(theme.definition.id)
  const original =
    !originalFamily &&
    (rootComponent === "native.original-stage" ||
      (rootComponent !== "native.cinematic-stage" &&
        theme.definition.rendererId === "razzia-native-stage"))
  let continuityRenderer = "cinematic"
  let previewEngine = "tadazz-classic-stage"

  if (originalFamily) {
    continuityRenderer = `original:${theme.definition.id}`
    previewEngine = "tadazz-original-stage"
  } else if (original) {
    continuityRenderer = "razzia"
    previewEngine = "razzia-native-stage"
  }

  const guessOffLook =
    !original &&
    !originalFamily &&
    resolveStageLook(frame.show.defaults) === "guess-off"
  const guessOffTextAnswers =
    guessOffLook &&
    (card?.kind === "quiz" || card?.kind === "survey") &&
    !(
      card.media?.type === "image" &&
      (!card.reveal || card.reveal.effect === "none")
    ) &&
    card.answers.every(
      (answer) => answer.display === "text" || !answer.imageUrl,
    )
  const slot: ShowThemeSlotId =
    !frame.stagePhase && card && card.kind !== "quiz" && card.kind !== "survey"
      ? themeSlotForSceneKind(card.kind)
      : ((
          {
            lobby: "lobby",
            personalResult: "personalResult",
            results: "resultsReveal",
            voteLocked: "voteLock",
            opening: "opening",
            closing: "closing",
            answerCards: "answerCards",
            voting: "voting",
            leaderboard: "leaderboard",
          } as Record<string, ShowThemeSlotId>
        )[phase] ?? "question")
  const authoredBackground = resolveTadazzStageBackground({
    settings: frame.show.defaults?.tadazzBackground,
    cardBackground: frame.stagePhase ? undefined : card?.background,
    reducedMotion: frame.reducedMotion,
  })
  const scopedBackground =
    theme.scopeOverrides.roles?.[frame.role]?.slots?.[slot]?.mediaUrl ??
    theme.scopeOverrides.slots?.[slot]?.mediaUrl
  const themeBackground = theme.slots[slot]
  // Keep explicit scoped theme overrides first, then the native card/show
  // resolver. An absent show-wide setting preserves the original fallback.
  const backdrop =
    (!authoredBackground.url || scopedBackground) && themeBackground.mediaUrl
      ? {
          url: themeBackground.mediaUrl,
          fit: themeBackground.fit,
          position: "center" as const,
          overlayOpacity: 0,
        }
      : authoredBackground
  const key = `${frame.clock.epoch}:${frame.chapterIndex}:${frame.appearanceRevision}`
  const [continuity] = useState(() => createPreviewStageContinuity())
  const stageIdentity = continuity.select({
    cardKey:
      !frame.stagePhase &&
      card &&
      (card.kind === "quiz" || card.kind === "survey")
        ? card.key
        : null,
    phase,
    clockEpoch: frame.clock.epoch,
    appearanceRevision: frame.appearanceRevision,
    renderer: continuityRenderer,
    role: frame.role,
  })
  const [committed, setCommitted] = useState("")
  const [prepared, setPrepared] = useState("")
  const [committedStage, setCommittedStage] = useState<number | null>(null)
  const presentationRoot = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onCommitted, onUnavailable })
  callbacks.current = { onCommitted, onUnavailable }
  const native = bundle.bundleDraft
  const item = chapter && native?.extras.timeline[chapter.cardIndex]
  const config =
    !frame.stagePhase && item && item.kind !== "question"
      ? native?.extras.scenes[item.sceneId]
      : undefined
  const safeConfig = useMemo(
    () =>
      config
        ? {
            ...config,
            // Preview lifetime follows the authored card, not regenerated storage IDs.
            id: card?.key ?? config.id,
            ...(config.kind === "media" ||
            config.kind === "opening" ||
            config.kind === "closing"
              ? {
                  muted: !frame.soundEnabled || config.muted === true,
                  volume: frame.soundEnabled ? (config.volume ?? 0.8) : 0,
                  showControls: false,
                }
              : {}),
            audio: { mode: "mute" as const, volume: 0, loop: false },
          }
        : undefined,
    [config, card?.key, frame.soundEnabled],
  )
  const previewScene: ShowScene | undefined =
    card && card.kind !== "quiz" && card.kind !== "survey"
      ? {
          kind: "scene",
          key: card.key,
          scene: { ...card, id: card.key },
          activeSceneData: activeSceneData ?? undefined,
          elapsedMs: frame.clock.elapsedMs,
          paused: frame.clock.paused,
        }
      : undefined
  // The editor rebuilds scene data during display-clock and layout updates.
  // Re-enter only for changed content; the clock effect below patches timing.
  const sceneIdentity = previewScene
    ? showSceneTransitionIdentity(previewScene)
    : undefined
  const scenePlan = useMemo(
    () =>
      previewScene
        ? planTransition(null, previewScene, {
            mode: "idle",
            questionKey: null,
          })
        : [],
    [card, key, sceneIdentity],
  )
  const audioPolicy = resolveTadazzAudioPolicy({
    sceneKind:
      chapter?.phase === "answerCards" || chapter?.phase === "voteLocked"
        ? "voting"
        : phase,
    scenePreset: config && "preset" in config ? config.preset : undefined,
    openingActive: phase === "opening",
  })
  const audioCue: Partial<Record<string, CueId>> = {
    opening: "start",
    question: "showQuestion",
    voting: "answersMusic",
    results: "revealResults",
    personalResult: "revealResults",
    leaderboard: "leaderboard",
  }
  const audition = frame.audioAudition,
    auditionAudio = audition ? theme.audio[audition.event] : undefined
  const auditionTrack =
    audition && auditionAudio?.url && !auditionAudio.silent
      ? {
          key: `audition:${audition.event}:${audition.sequence}`,
          url: auditionAudio.url,
          startedAt: audition.startedAt,
          durationMs: 10_000,
          volume: auditionAudio.volume,
        }
      : null
  let auxiliary: ReactNode = undefined

  if (frame.stagePhase === "lobby") {
    auxiliary = (
      <NativeClassicLobbyPanel
        join={resolveRoomJoin({
          origin: "",
          role: frame.role,
          directory: projectLobbyJoin(frame.show.defaults?.lobby),
        })}
        isManager={frame.role === "manager"}
        fullShowData={frame.show.defaults?.lobby}
        tx={(name, fallback, vars) =>
          labels.i18n.t(`extensions:tadazzShow.${name}`, {
            defaultValue: fallback,
            ...vars,
          })
        }
      />
    )
  } else if (phase === "personalResult") {
    auxiliary = (
      <NativeClassicPlayerResult
        correct={false}
        message={card?.kind === "survey" ? "game:answerNoted" : "game:wrong"}
        points={0}
        rank={1}
        aheadOfMe={null}
        survey={card?.kind === "survey"}
      />
    )
  }

  useLayoutEffect(() => {
    if (original) {
      return
    }

    const handle = stage.current

    if (
      !handle ||
      !chapter ||
      !card ||
      !bundle.ok ||
      theme.diagnostics.length ||
      (!originalFamily &&
        !["tadazz-classic-stage", "razzia-native-stage"].includes(
          theme.definition.rendererId,
        ))
    ) {
      callbacks.current.onUnavailable()

      return
    }

    let current = true
    const steps: StageStep[] = []

    if (frame.stagePhase === "lobby" || phase === "personalResult") {
      steps.push({ op: "custom" })
    } else if (card.kind === "quiz" || card.kind === "survey") {
      const question: StageQuestion = {
        key: card.key,
        answerCount: card.answers.length,
        hasAnswerImages: card.answers.some(
          (answer) => Boolean(answer.imageUrl) && answer.display !== "text",
        ),
        question: card.question,
        number:
          questionPosition?.number ??
          frame.show.cards
            .slice(0, chapter.cardIndex + 1)
            .filter((c) => c.kind === "quiz" || c.kind === "survey").length,
        totalQuestions:
          questionPosition?.total ??
          frame.show.cards.filter(
            (c) => c.kind === "quiz" || c.kind === "survey",
          ).length,
        note: frame.role === "manager" ? card.note : undefined,
        options:
          chapter.phase === "question"
            ? []
            : card.answers.map((a) => ({
                label: a.text,
                image: a.display === "text" ? undefined : a.imageUrl,
                alt: a.alt,
                display: a.display === "text" ? undefined : a.display,
              })),
        ...(card.media?.type === "image" &&
        (!card.reveal || card.reveal.effect === "none")
          ? { questionImage: card.media.url, photoAlt: card.question }
          : {}),
      }

      if (chapter.phase !== "voting") {
        steps.push({
          op:
            handle.questionKey === question.key && chapter.phase !== "question"
              ? "presentOptions"
              : "showQuestion",
          question,
        })
      }

      if (chapter.phase === "voting") {
        steps.push({
          op: "openVoting",
          question,
          seconds: card.timeSeconds > 0 ? card.timeSeconds : null,
          ...(frame.clock.deadlineMs === null
            ? {}
            : {
                deadlineMs:
                  Date.now() +
                  Math.max(0, frame.clock.deadlineMs - frame.clock.elapsedMs),
              }),
        })
      }

      if (chapter.phase === "voteLocked") {
        steps.push({ op: "lockVoting" })
      }

      if (chapter.phase === "results") {
        steps.push({
          op: "revealResults",
          reveal: {
            mode: card.kind,
            counts: card.answers.map(() => 0),
            percentages: card.answers.map(() => 0),
            ...(card.kind === "quiz"
              ? { solutions: card.correctAnswers.map((n) => n - 1) }
              : {}),
          },
        })
      }
    } else {
      steps.push(...scenePlan)
    }

    const run = async () => {
      const plan =
        frame.clock.paused && chapter.phase !== "voteLocked"
          ? collapseForResume(steps)
          : steps
      const last = plan.at(-1)
      const publish = () => {
        if (current) {
          setPrepared(key)
          setCommittedStage(stageIdentity)
        }
      }

      if (last?.op === "openVoting") {
        if (
          !(await runSteps(handle, plan.slice(0, -1), () => current)) ||
          !current
        ) {
          return
        }

        void handle
          .openVoting(last.seconds, last.deadlineMs, last.question)
          .catch(() => {
            if (current) {
              callbacks.current.onUnavailable()
            }
          })
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })

        if (!current) {
          return
        }

        if (frame.clock.paused) {
          handle.pauseAnimations?.()
        }

        publish()
      } else if (frame.clock.paused) {
        if (!(await runSteps(handle, plan, () => current)) || !current) {
          return
        }

        handle.pauseAnimations?.()
        publish()
      } else {
        void runSteps(handle, plan, () => current).catch(() => {
          if (current) {
            callbacks.current.onUnavailable()
          }
        })
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        publish()
      }
    }
    void run().catch(() => {
      if (current) {
        callbacks.current.onUnavailable()
      }
    })

    return () => {
      current = false
      handle.finishAnimations()
    }
    // Elapsed display updates stay with the single preview clock and existing native timer.
  }, [
    key,
    bundle,
    card,
    chapter,
    frame.role,
    frame.locale,
    theme,
    original,
    originalFamily,
    questionPosition,
    scenePlan,
  ])
  useLayoutEffect(() => {
    const element = presentationRoot.current

    if (prepared !== key || !element) {
      return
    }

    const publish = () => {
      setCommitted(key)
      callbacks.current.onCommitted()
    }

    // Reveal the committed scene before measuring its text. Its entrance may
    // still be at opacity zero; no local reading clock starts until it is shown.
    if (phase === "question") {
      return observeQuestionPresentation(element, () => {
        flushSync(() => setCommitted(key))
        callbacks.current.onCommitted()
      })
    }

    publish()
  }, [prepared, key, phase])
  useLayoutEffect(() => {
    const handle = stage.current

    if (!handle || committed !== key) {
      return
    }

    if (
      chapter?.phase === "voting" &&
      card &&
      (card.kind === "quiz" || card.kind === "survey")
    ) {
      // The original adapter patches an existing voting clock without replaying
      // its entrance. Re-anchor that visual clock to the one demo-clock snapshot.
      void handle
        .openVoting(
          card.timeSeconds > 0 ? card.timeSeconds : null,
          frame.clock.deadlineMs === null
            ? undefined
            : Date.now() +
                Math.max(0, frame.clock.deadlineMs - frame.clock.elapsedMs),
        )
        .catch(() => callbacks.current.onUnavailable())
    }

    if (frame.clock.paused) {
      handle.pauseAnimations?.()
    } else {
      handle.resumeAnimations?.()
    }
  }, [key, committed, frame.clock.sequence, frame.clock.paused])

  if (!card || !native) {
    return null
  }

  const questionCard =
    card.kind === "quiz" || card.kind === "survey" ? card : undefined
  const questionMedia =
    questionCard &&
    !frame.stagePhase &&
    ["question", "answerCards", "voting", "voteLocked"].includes(chapter.phase)
      ? questionCard.media
      : undefined
  const photoQuestion =
    questionMedia?.type === "image" &&
    (!questionCard?.reveal || questionCard.reveal.effect === "none") &&
    chapter.phase !== "question" &&
    questionCard?.answers.length === 4 &&
    questionCard.answers.every((answer) => !answer.imageUrl)
  const nativeMedia =
    questionMedia && !photoQuestion ? (
      <NativeQuestionMedia
        media={questionMedia}
        alt={questionCard?.question ?? ""}
        muted={!frame.soundEnabled || chapter.phase === "voting"}
        controls={false}
        controlledTimeMs={
          frame.mediaRevealed && questionCard?.reveal?.trigger === "manual"
            ? questionCard.reveal.durationMs
            : frame.clock.elapsedMs
        }
        controlledPaused={frame.clock.paused}
        isManuallyRevealed={frame.mediaRevealed}
        reveal={questionCard?.reveal}
        isManager={frame.role === "manager"}
        reducedMotion={frame.reducedMotion}
      />
    ) : undefined

  return (
    <I18nextProvider i18n={labels.i18n}>
      <ShowThemeScope theme={theme}>
        <div
          data-preview-locale={frame.locale}
          data-preview-theme={theme.definition.id}
          data-preview-theme-slot={slot}
          data-preview-question-number={questionPosition?.number}
          data-preview-question-total={questionPosition?.total}
          data-preview-engine={previewEngine}
          data-preview-reduced-motion={String(frame.reducedMotion)}
          data-preview-audio-event={audition?.event}
          data-preview-audio-silent={
            audition
              ? String(!auditionAudio?.url || auditionAudio.silent)
              : undefined
          }
          style={{
            ...showThemeStyle(theme),
            width: "100%",
            height: "100%",
            color: theme.definition.tokens.foreground,
            background: theme.definition.tokens.background,
          }}
        >
          <ApplicationComposition
            frame={frame}
            phase={phase}
            template={template}
          >
            <div
              ref={presentationRoot}
              data-native-application-preview
              data-guess-off-stage={guessOffLook || undefined}
              data-guess-off-media={guessOffTextAnswers ? "text" : undefined}
              data-preview-ready={committed === key}
              data-preview-chapter-index={frame.chapterIndex}
              data-preview-phase={
                phase === "question" && committed !== key ? "preparing" : phase
              }
              style={{
                ...showThemeStyle(theme),
                width: "100%",
                height: "100%",
                visibility:
                  committedStage === stageIdentity ? "visible" : "hidden",
              }}
            >
              {original ? (
                <RazziaApplicationStage
                  key={stageIdentity}
                  questionEpoch={stageIdentity}
                  frame={frame}
                  chapter={chapter}
                  theme={theme}
                  scene={safeConfig}
                  activeSceneData={activeSceneData}
                  backdropUrl={
                    backdrop.url ??
                    theme.definition.assets.find(
                      (asset) => asset.id === themeBackground.backgroundAssetId,
                    )?.url ??
                    themeAdapterAsset(theme, "questionBackdrop")
                  }
                  backdropFit={rootFit ?? backdrop.fit}
                  backdropPosition={backdrop.position}
                  backdropOverlayOpacity={backdrop.overlayOpacity}
                  onCommitted={() => {
                    setPrepared(key)
                    setCommittedStage(stageIdentity)
                  }}
                />
              ) : (
                <TadazzV4StageAdapter
                  key={stageIdentity}
                  ref={stage}
                  labels={labels.labels}
                  v4Labels={
                    guessOffLook
                      ? { ...labels.v4Labels, teamLeaderboard: "LEADERBOARD" }
                      : labels.v4Labels
                  }
                  guessOffLook={guessOffLook}
                  reducedMotion={frame.reducedMotion || frame.clock.paused}
                  interactive={false}
                  backdropUrl={backdrop.url}
                  backdropFit={rootFit ?? backdrop.fit}
                  backdropPosition={backdrop.position}
                  backdropOverlayOpacity={backdrop.overlayOpacity}
                  underlay={
                    questionMedia?.type === "audio" ? undefined : nativeMedia
                  }
                  customScreen={
                    auxiliary ??
                    (safeConfig &&
                    scenePlan.some((step) => step.op === "custom") ? (
                      <NativeClassicScene
                        scene={safeConfig}
                        activeSceneData={activeSceneData}
                        epoch={frame.clock.epoch}
                        elapsedMs={frame.clock.elapsedMs}
                        paused={frame.clock.paused}
                      />
                    ) : undefined)
                  }
                />
              )}
            </div>
          </ApplicationComposition>
          {!original && questionMedia?.type === "audio" ? nativeMedia : null}
          <AudioCuePlayer
            cueId={audition ? undefined : audioCue[phase]}
            audioExtras={native.extras.audio}
            cardAudioCues={
              card.kind === "quiz" || card.kind === "survey"
                ? card.audioCues
                : undefined
            }
            sceneAudio={audition ? undefined : config?.audio}
            showTrack={audition ? auditionTrack : undefined}
            gameId="read-only-preview"
            activeCardKey={card.key}
            phase={phase}
            epoch={frame.clock.epoch}
            soundtrackSlot={audition ? undefined : audioPolicy.slot}
            continuityKey={audioPolicy.continuityKey}
            paused={(!audition && frame.clock.paused) || !frame.soundEnabled}
            autoPlay={frame.soundEnabled}
            stageOwnsReveal={!original}
            hasCompetingMedia={
              frame.soundEnabled &&
              (Boolean(questionMedia && questionMedia.type !== "image") ||
                Boolean(
                  config &&
                  (config.kind === "media" ||
                    config.kind === "opening" ||
                    config.kind === "closing") &&
                  config.mediaType !== "image",
                ))
            }
            onError={
              audition ? () => callbacks.current.onUnavailable() : undefined
            }
            showControls
            renderControls={(controls) =>
              controls.blocked && frame.soundEnabled ? (
                <NativeButton
                  classNameContent="contents"
                  data-control-source="razzia"
                  type="button"
                  data-testid="preview-unlock-audio"
                  onClick={controls.unlock}
                  style={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    zIndex: 20,
                    borderRadius: 8,
                    padding: "4px 8px",
                    background: theme.definition.tokens.background,
                    color: theme.definition.tokens.foreground,
                  }}
                >
                  {labels.i18n.t("audio.enableSound", { ns: "extensions" })}
                </NativeButton>
              ) : null
            }
          />
        </div>
      </ShowThemeScope>
    </I18nextProvider>
  )
}
