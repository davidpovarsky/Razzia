import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { I18nextProvider } from "react-i18next"
import NativeButton from "../../../../packages/web/src/components/Button"
import type { ApplicationPreviewFrame } from "../../core/show-library/application-preview-schema"
import {
  applicationChapterPhase,
  compileFullShowPreviewTimeline,
} from "../../core/show-library/full-show-preview-timeline"
import { authoredShowToNativeBundleDraft } from "../../core/show-authoring-convert"
import { createShowThemeRegistry } from "../../core/show-themes/registry"
import { resolveShowTheme } from "../../core/show-themes/resolve"
import type { CueId } from "../../core/constants"
import { createDefaultShowTheme } from "../../core/show-themes/selection"
import { ThemeSandboxHost } from "../package-runtime/ThemeSandboxHost"
import {
  projectPackageClock,
  projectPackageScene,
} from "../package-runtime/projection"
import {
  packageQuestionContentSupported,
  packageUsesSandboxForPhase,
} from "../package-runtime/question-family"
import type { RuntimeSnapshot } from "../../core/packages/protocol"
import { ShowThemeScope, showThemeStyle } from "../show-themes/context"
import { AudioCuePlayer } from "../audio-cue-player"
import { resolveTadazzAudioPolicy } from "../tadazz-audio-policy"
import { previewNativeLabels } from "./i18n"
import { packagePreviewScene } from "./package-preview-scene"
import { packageRevealStage } from "../package-runtime/reveal-clock"
import { PackagePreviewAudioEffects } from "../package-runtime/use-package-reveal"

const phaseCues: Partial<Record<RuntimeSnapshot["phase"], CueId>> = {
  question: "showQuestion",
  voting: "answersMusic",
  results: "revealResults",
  leaderboard: "leaderboard",
}

/** The verified native host owns all media, clocks and read-only sample data. */
export function PackageApplicationPreviewStage({
  frame,
  onCommitted,
  onUnavailable,
  renderNative,
}: {
  frame: ApplicationPreviewFrame
  onCommitted: () => void
  onUnavailable: () => void
  renderNative: (nativeFrame: ApplicationPreviewFrame) => ReactNode
}) {
  const context = frame.packageContext
  const effectiveLocale =
    frame.show.defaults?.presentationLocale ?? frame.locale
  const registry = useMemo(
    () => createShowThemeRegistry(context?.definitions),
    [context?.definitions],
  )
  const chapters = useMemo(
    () => compileFullShowPreviewTimeline(frame.show),
    [frame.show],
  )
  const chapter = chapters[frame.chapterIndex]
  const card = chapter ? frame.show.cards[chapter.cardIndex] : undefined
  const phase =
    frame.stagePhase ??
    applicationChapterPhase(chapter?.phase ?? "question", frame.role)
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
      frame.stagePhase,
      card,
      frame.role,
      registry,
    ],
  )
  const labels = useMemo(
    () => previewNativeLabels(effectiveLocale),
    [effectiveLocale],
  )
  const native = useMemo(
    () => authoredShowToNativeBundleDraft(frame.show, "preview"),
    [frame.show],
  )
  const platformShow = useMemo(
    () => ({
      ...frame.show,
      defaults: { ...frame.show.defaults, showTheme: createDefaultShowTheme() },
      cards: frame.show.cards.map(
        ({ themeOverrides: _scope, ...item }) => item,
      ),
    }),
    [frame.show],
  )
  const callbacks = useRef({ onCommitted, onUnavailable })
  callbacks.current = { onCommitted, onUnavailable }
  const runtimeUrl = context?.runtimeUrls[theme.definition.id]
  const sandbox = theme.definition.kind === "sandboxed-react"
  const unsupportedQuestion =
    !frame.stagePhase &&
    card &&
    (card.kind === "quiz" || card.kind === "survey") &&
    packageQuestionContentSupported({
      questionType: card.questionType,
      mediaType: card.media?.type,
    }) !== true
  const platformSlot =
    sandbox &&
    (phase === "opening" ||
      phase === "closing" ||
      unsupportedQuestion ||
      !packageUsesSandboxForPhase(theme.definition.sandbox?.slots, phase))
  const [readyUrl, setReadyUrl] = useState("")
  const imagesKey = JSON.stringify(
    card && (card.kind === "quiz" || card.kind === "survey")
      ? [
          ...(card.media?.type === "image" ? [card.media.url] : []),
          ...card.answers.flatMap((answer) =>
            answer.imageUrl ? [answer.imageUrl] : [],
          ),
        ]
      : [],
  )
  const [images, setImages] = useState<{
    key: string
    urls: Record<string, string>
  }>({ key: "", urls: {} })
  useLayoutEffect(() => {
    setReadyUrl("")
  }, [runtimeUrl, imagesKey, platformSlot])
  useEffect(() => {
    if (!context || !sandbox || platformSlot) {
      return
    }

    const abort = new AbortController()
    const urls = [...new Set(JSON.parse(imagesKey) as string[])]
    void Promise.all(
      urls.map(async (url) => {
        const asset = context.assets.find((entry) => entry.url === url)

        if (!asset || asset.bytes > 5_000_000) {
          throw new Error("Preview image is not admitted")
        }

        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal: abort.signal,
        })
        const mime = response.headers.get("Content-Type")?.split(";")[0] ?? ""

        if (
          !response.ok ||
          !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime)
        ) {
          throw new Error("Preview image unavailable")
        }

        const bytes = await response.arrayBuffer()

        if (bytes.byteLength !== asset.bytes) {
          throw new Error("Preview image size changed")
        }

        const digest = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("")

        if (digest !== asset.sha256) {
          throw new Error("Preview image digest changed")
        }

        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () =>
            typeof reader.result === "string"
              ? resolve(reader.result)
              : reject(new Error("Preview image invalid"))
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(new Blob([bytes], { type: mime }))
        })

        return [url, data] as const
      }),
    )
      .then((entries) => {
        if (!abort.signal.aborted) {
          setImages({ key: imagesKey, urls: Object.fromEntries(entries) })
        }
      })
      .catch(() => {
        if (!abort.signal.aborted) {
          callbacks.current.onUnavailable()
        }
      })

    return () => abort.abort()
  }, [context?.assets, imagesKey, sandbox, platformSlot])
  useLayoutEffect(() => {
    if (
      !context ||
      !chapter ||
      !card ||
      theme.diagnostics.length ||
      !native.ok ||
      !native.bundleDraft ||
      (sandbox &&
        !platformSlot &&
        (!runtimeUrl || !theme.definition.sandbox?.roles.includes(frame.role)))
    ) {
      callbacks.current.onUnavailable()
    } else if (readyUrl === runtimeUrl && images.key === imagesKey) {
      callbacks.current.onCommitted()
    }
  }, [
    context,
    chapter,
    card,
    theme,
    native,
    sandbox,
    platformSlot,
    runtimeUrl,
    readyUrl,
    images.key,
    imagesKey,
    frame.role,
    frame.clock.epoch,
  ])

  if (
    !context ||
    !chapter ||
    !card ||
    !native.ok ||
    !native.bundleDraft ||
    theme.diagnostics.length
  ) {
    return null
  }

  if (!sandbox) {
    return renderNative({ ...frame, locale: effectiveLocale })
  }

  if (platformSlot) {
    const {
      packageContext: _packageContext,
      appearance: _appearance,
      ...nativeFrame
    } = frame

    return renderNative({
      ...nativeFrame,
      show: platformShow,
      locale: effectiveLocale,
    })
  }

  if (!runtimeUrl || images.key !== imagesKey) {
    return null
  }

  const now = Date.now()
  const scene = packagePreviewScene(frame, chapter)
  const count = frame.show.cards.filter(
    (item) => item.kind === "quiz" || item.kind === "survey",
  ).length
  const questionNumber = frame.show.cards
    .slice(0, chapter.cardIndex + 1)
    .filter((item) => item.kind === "quiz" || item.kind === "survey").length
  const revealStage =
    phase === "results" && scene.kind === "results"
      ? packageRevealStage({
          elapsedMs: frame.clock.elapsedMs,
          hasCorrectAnswer:
            scene.reveal.mode === "quiz" &&
            (scene.reveal.solutions?.length ?? 0) > 0,
          reducedMotion: frame.reducedMotion,
        })
      : undefined
  const projection = projectPackageScene({
    scene,
    serverTime: now,
    paused: frame.clock.paused,
    voteLocked: phase === "voteLocked",
    images: images.urls,
    questionNumber,
    questionCount: count,
    phaseElapsedMs: frame.clock.elapsedMs,
    revealStage,
    lobby: {
      dialNumber: frame.show.defaults?.lobby?.dialNumber,
      instructions: frame.show.defaults?.lobby?.instructions,
    },
    finalLeaderboard:
      card.kind === "leaderboard" &&
      !frame.show.cards
        .slice(chapter.cardIndex + 1)
        .some((item) => item.kind === "leaderboard"),
  })
  const remainingMs =
    frame.clock.deadlineMs === null
      ? 0
      : Math.max(0, frame.clock.deadlineMs - frame.clock.elapsedMs)
  const snapshot: RuntimeSnapshot = {
    ...projection,
    phase,
    title: projection.title || frame.show.title,
    roomId: "read-only-package-preview",
    questionId: frame.stagePhase ? "package-preview-lobby" : card.key,
    epoch: frame.clock.epoch,
    sequence: frame.clock.sequence,
    role: frame.role,
    locale: effectiveLocale,
    reducedMotion: frame.reducedMotion,
    serverTime: now,
    ...projectPackageClock({
      phase,
      deadline: frame.clock.deadlineMs === null ? null : now + remainingMs,
      remainingMs,
    }),
    paused: frame.clock.paused,
    canAnswer: false,
    labels: {
      submit: labels.i18n.t("game:confirm"),
      waiting: labels.i18n.t("extensions:packages.preview"),
      results: labels.i18n.t("extensions:packages.phases.results"),
    },
  }
  const audition = frame.audioAudition
  const selectedAudio = audition ? theme.audio[audition.event] : undefined
  const sceneAudio =
    !frame.stagePhase && card.kind !== "quiz" && card.kind !== "survey"
      ? card.audio
      : undefined
  // Undefined follows the normal platform mixer. Null is reserved for an
  // explicitly silent audition; a theme event is never a replacement music bed.
  let showTrack: Parameters<typeof AudioCuePlayer>[0]["showTrack"] = undefined

  if (audition) {
    showTrack =
      selectedAudio?.url && !selectedAudio.silent && frame.role !== "player"
        ? {
            key: `${card.key}:${frame.clock.epoch}:audition:${audition.sequence}`,
            url: selectedAudio.url,
            volume: selectedAudio.volume,
            loop: selectedAudio.loop,
            startedAt: audition.startedAt,
            elapsedMs: Math.max(0, now - audition.startedAt),
            durationMs: 10_000,
          }
        : null
  }

  const audioSceneKind = (() => {
    if (phase === "answerCards") {
      return "question"
    }

    if (phase === "voteLocked" || phase === "personalResult") {
      return "results"
    }

    if (scene.kind === "scene") {
      return scene.scene.kind
    }

    if (phase === "interlude") {
      return "transition"
    }

    return phase
  })()
  const audioPolicy = resolveTadazzAudioPolicy({
    sceneKind: audioSceneKind,
    scenePreset: scene.kind === "scene" ? scene.scene.preset : undefined,
  })

  return (
    <I18nextProvider i18n={labels.i18n}>
      <ShowThemeScope theme={theme}>
        <div
          data-native-application-preview
          data-preview-engine="tadazz-sandbox-stage"
          data-preview-ready={readyUrl === runtimeUrl}
          data-preview-theme={theme.definition.id}
          data-preview-question-number={questionNumber}
          data-preview-question-total={count}
          data-preview-package={context.uploadId}
          data-preview-build={context.buildDigest}
          style={{
            ...showThemeStyle(theme),
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "hidden",
          }}
        >
          <ThemeSandboxHost
            url={runtimeUrl}
            snapshot={snapshot}
            title={frame.show.title}
            onAnswer={() => undefined}
            onReady={() => {
              setReadyUrl(runtimeUrl)
              callbacks.current.onCommitted()
            }}
            onFallback={() => {
              setReadyUrl("")
              callbacks.current.onUnavailable()
            }}
            fallback={
              <p role="status">
                {labels.i18n.t("extensions:packages.runtimeFailed")}
              </p>
            }
          />
          <AudioCuePlayer
            eventOnly={frame.role === "player"}
            stageOwnsReveal
            showTrack={showTrack}
            cueId={phaseCues[phase]}
            cardAudioCues={
              card.kind === "quiz" || card.kind === "survey"
                ? card.audioCues
                : undefined
            }
            sceneAudio={sceneAudio}
            audioExtras={native.bundleDraft.extras.audio}
            gameId="read-only-package-preview"
            activeCardKey={card.key}
            phase={phase}
            epoch={frame.clock.epoch}
            soundtrackSlot={audioPolicy.slot}
            continuityKey={audioPolicy.continuityKey}
            paused={
              (!frame.audioAudition && frame.clock.paused) ||
              !frame.soundEnabled
            }
            autoPlay={frame.soundEnabled}
            showControls
            renderControls={(controls) =>
              controls.blocked && frame.soundEnabled ? (
                <NativeButton
                  type="button"
                  data-testid="preview-unlock-audio"
                  onClick={controls.unlock}
                  style={{
                    position: "absolute",
                    left: 8,
                    bottom: 8,
                    zIndex: 20,
                    padding: "4px 8px",
                  }}
                >
                  {labels.i18n.t("audio.enableSound", { ns: "extensions" })}
                </NativeButton>
              ) : null
            }
          />
          <PackagePreviewAudioEffects
            cardKey={card.key}
            epoch={frame.clock.epoch}
            phase={phase}
            remainingMs={remainingMs}
            elapsedMs={frame.clock.elapsedMs}
            stage={revealStage}
            enabled={
              frame.role !== "player" &&
              frame.soundEnabled &&
              !frame.audioAudition
            }
            paused={frame.clock.paused}
            reducedMotion={frame.reducedMotion}
          />
        </div>
      </ShowThemeScope>
    </I18nextProvider>
  )
}
