// oxlint-disable typescript/no-unnecessary-condition -- Disposal and generation change across awaits and callbacks; keep cancellation guards.
import { createDemoClock } from "../../../presentation/show-library-preview/demo-clock"
import { assertApplicationPreviewPlan } from "../../../core/show-library/application-preview-resolve"
import {
  applicationAppearanceSchema,
  type ApplicationPreviewFrame,
} from "../../../core/show-library/application-preview-schema"
import { resolveApplicationTemplate } from "../../../core/show-library/application-library"
import { applicationCardThemeScope } from "../../../core/show-library/application-composition-pin"
import {
  freeze,
  assertBoundedJson,
} from "../../../core/show-library/primitives"
import { tadaShowV1Schema } from "../../../core/show-authoring-schema"
import { resolveShowTheme } from "../../../core/show-themes/resolve"
import { SHOW_THEME_AUDIO_EVENTS } from "../../../core/show-themes/selection"
import { showThemeRegistry } from "../../../core/show-themes/registry"
import type { PreviewPlan } from "../../../core/show-library/preview-schemas"
import { compileFullShowPreviewTimeline } from "../../../core/show-library/full-show-preview-timeline"
import type {
  GamePreviewSession,
  PreviewPreferences,
  PreviewSource,
} from "./contracts"
import { isSeekableMediaTime } from "./timeline-input"
import type {
  ApplicationPreviewMount,
  loadApplicationPreviewRuntime,
} from "./application-runtime"

/** One existing demo clock + one existing native renderer. No gameplay authority. */
export function createApplicationPreviewSession(options: {
  source: PreviewSource
  show: ApplicationPreviewFrame["show"]
  plan: Readonly<PreviewPlan>
  scopeIds?: Record<string, string>
  preferences: Readonly<PreviewPreferences>
  runtime: Awaited<ReturnType<typeof loadApplicationPreviewRuntime>>
  revalidate: (signal: AbortSignal) => Promise<void>
  authorizeMedia: (
    urls: string[],
    signal: AbortSignal,
  ) => Promise<Array<{ url: string; sha256: string; bytes: number }>>
  getPackageContext?: () => ApplicationPreviewFrame["packageContext"]
}): GamePreviewSession {
  assertApplicationPreviewPlan(options.show, options.plan)
  const clock = createDemoClock()
  const chapters = compileFullShowPreviewTimeline(options.show).map(
    (chapter) => ({ ...chapter, seek: "chapter-only" as const }),
  )
  const listeners = new Set<() => void>()
  const abort = new AbortController()
  let watchedMedia: HTMLMediaElement | null = null,
    mediaEvents = new AbortController()
  let native: ApplicationPreviewMount | null = null,
    chapterIndex = 0,
    generation = 0,
    ended = false,
    disposed = false
  let { show } = options,
    appearance: ApplicationPreviewFrame["appearance"] = undefined,
    appearanceRevision = 0
  let stagePhase: "lobby" | undefined = undefined
  let mediaRevealed = false
  const manualRevealAvailable = () => {
    if (stagePhase) {
      return false
    }

    const card = show.cards[chapters[chapterIndex].cardIndex]

    return (
      (card.kind === "quiz" || card.kind === "survey") &&
      card.media?.type === "image" &&
      card.reveal?.trigger === "manual" &&
      (card.reveal.audience === "all" || role === "manager")
    )
  }
  let role: ApplicationPreviewFrame["role"] = "spectator",
    soundEnabled = false
  let audioAudition: ApplicationPreviewFrame["audioAudition"] = undefined,
    auditionSequence = 0
  let appearanceAssets: Awaited<ReturnType<typeof options.authorizeMedia>> = []
  let lastPackageValidation = Date.now()
  const revalidate = async (signal: AbortSignal) => {
    await options.revalidate(signal)
    lastPackageValidation = Date.now()

    if (
      appearanceAssets.length &&
      JSON.stringify(
        await options.authorizeMedia(
          appearanceAssets.map((asset) => asset.url),
          signal,
        ),
      ) !== JSON.stringify(appearanceAssets)
    ) {
      throw new Error("Preview assets changed")
    }
  }
  let timer: ReturnType<typeof setTimeout> | undefined = undefined
  const emit = () => {
    if (!disposed) {
      for (const listener of listeners) {
        listener()
      }
    }
  }
  const clear = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
    }

    timer = undefined
  }
  const frame = (): ApplicationPreviewFrame => ({
    show,
    scopeIds: options.scopeIds ?? {},
    chapterIndex,
    clock: clock.snapshot(),
    role,
    soundEnabled,
    mediaRevealed,
    ...(stagePhase ? { stagePhase } : {}),
    ...(audioAudition ? { audioAudition } : {}),
    ...options.preferences,
    appearanceRevision,
    ...(appearance ? { appearance } : {}),
    ...(options.getPackageContext
      ? { packageContext: options.getPackageContext() }
      : {}),
  })
  const render = async (presentQuestion = false) => {
    const nextFrame = frame()

    if (presentQuestion) {
      // Entrance motion can run while the one reading clock waits for the
      // renderer's visible-question acknowledgement.
      nextFrame.clock = { ...nextFrame.clock, paused: false }
    }

    await native?.update(nextFrame)
    const media = native?.mediaElement() ?? null

    if (media === watchedMedia || disposed) {
      return
    }

    mediaEvents.abort()
    mediaEvents = new AbortController()
    watchedMedia = media

    if (media) {
      for (const event of [
        "loadedmetadata",
        "durationchange",
        "progress",
        "seeked",
        "timeupdate",
      ]) {
        media.addEventListener(event, emit, { signal: mediaEvents.signal })
      }
    }
  }
  const beginChapter = (carryMs = 0) => {
    stagePhase = undefined
    mediaRevealed = false
    audioAudition = undefined
    clock.replay()
    const chapter = chapters[chapterIndex]

    if (chapter.phase === "voting" && chapter.duration.kind === "known") {
      clock.startVoting(chapter.duration.milliseconds / 1000)
    }

    // A previous scene's late tick cannot consume a new question's reading
    // interval. Carry remains authoritative for voting and all other phases.
    if (carryMs > 0 && chapter.phase !== "question") {
      clock.seek(carryMs)
    }
  }
  const stop = () => {
    clear()
    clock.pause()
  }
  const playAfterQuestionPresentation = async (
    ticket: number,
    signal: AbortSignal = abort.signal,
  ) => {
    if (
      !stagePhase &&
      chapters[chapterIndex].phase === "question" &&
      clock.snapshot().paused
    ) {
      await render(true)
    }

    if (
      disposed ||
      ticket !== generation ||
      signal.aborted ||
      document.hidden
    ) {
      return false
    }

    clock.play()

    return true
  }
  const tick = async () => {
    if (disposed || clock.snapshot().paused) {
      return
    }

    const ticket = generation

    if (
      options.getPackageContext &&
      Date.now() - lastPackageValidation > 240_000
    ) {
      await revalidate(abort.signal)
      if (disposed || ticket !== generation || clock.snapshot().paused) return
    }

    const chapter = chapters[chapterIndex]
    const { elapsedMs } = clock.snapshot()
    const media = native?.mediaElement()
    const mediaEnded =
      chapter.duration.kind === "unknown" && media?.ended && !media.loop

    if (
      !stagePhase &&
      (mediaEnded ||
        (chapter.duration.kind === "known" &&
          elapsedMs >= chapter.duration.milliseconds))
    ) {
      if (chapterIndex + 1 === chapters.length) {
        ended = true
        stop()
      } else {
        let nextPhase: "voting" | "results" | null = null

        if (chapter.phase === "question") {
          nextPhase = "voting"
        } else if (chapter.phase === "voting") {
          nextPhase = "results"
        }

        const phaseIndex =
          nextPhase === null
            ? -1
            : chapters.findIndex(
                (candidate) =>
                  candidate.cardIndex === chapter.cardIndex &&
                  candidate.phase === nextPhase,
              )
        chapterIndex = phaseIndex >= 0 ? phaseIndex : chapterIndex + 1
        const carryMs =
          chapter.duration.kind === "known"
            ? Math.max(0, elapsedMs - chapter.duration.milliseconds)
            : 0
        beginChapter(carryMs)

        if (!(await playAfterQuestionPresentation(ticket))) {
          return
        }
      }
    }

    await render()

    if (disposed || ticket !== generation) {
      return
    }

    emit()

    if (!disposed && !clock.snapshot().paused) {
      const { duration } = chapters[chapterIndex]
      const remaining =
        !stagePhase && duration.kind === "known"
          ? Math.max(0, duration.milliseconds - clock.snapshot().elapsedMs)
          : 100
      timer = setTimeout(
        () => {
          void tick().catch(fail)
        },
        Math.min(100, remaining),
      )
    }
  }
  const fail = () => {
    const observers = [...listeners]
    stop()
    dispose()
    for (const listener of observers) {
      listener()
    }
  }
  const visibility = () => {
    if (document.hidden) {
      generation += 1
      stop()
      void render().then(emit).catch(fail)
    }
  }
  const measured = () => {
    const element = native?.mediaElement()

    if (
      !element ||
      !Number.isFinite(element.duration) ||
      element.duration <= 0
    ) {
      return undefined
    }

    return {
      timeSeconds: element.currentTime,
      durationSeconds: element.duration,
      seekable: Array.from(
        { length: element.seekable.length },
        (_, n) => [element.seekable.start(n), element.seekable.end(n)] as const,
      ),
    }
  }
  function dispose() {
    if (disposed) {
      return
    }

    disposed = true
    generation += 1
    abort.abort()
    mediaEvents.abort()
    watchedMedia = null
    stop()
    listeners.clear()
    document.removeEventListener("visibilitychange", visibility)
    native?.dispose()
    native = null
    options.runtime.dispose()
  }
  beginChapter()

  return {
    source: options.source,
    plan: options.plan,
    coverage: "full-show",
    sampleData: true,
    chapters,
    async mount(element, settings) {
      if (disposed || native || !settings.muted) {
        throw new Error("Preview unavailable")
      }

      native = options.runtime.mount(element, () => queueMicrotask(fail))
      document.addEventListener("visibilitychange", visibility)
      await render()

      if (disposed) {
        throw new Error("Preview unavailable")
      }
    },
    snapshot: () => {
      if (disposed) {
        throw new Error("Preview disposed")
      }

      return {
        chapterId: chapters[chapterIndex].id,
        clock: clock.snapshot(),
        ended,
        ...(stagePhase ? { screenPhase: stagePhase } : {}),
        ...(manualRevealAvailable()
          ? { manualImageReveal: mediaRevealed }
          : {}),
        ...(measured() ? { media: measured() } : {}),
      }
    },
    subscribe(listener) {
      if (disposed) {
        throw new Error("Preview disposed")
      }

      listeners.add(listener)

      return () => listeners.delete(listener)
    },
    async play(signal) {
      if (disposed) {
        throw new Error("Preview disposed")
      }

      generation += 1

      const ticket = generation,
        combined = signal
          ? AbortSignal.any([signal, abort.signal])
          : abort.signal
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      audioAudition = undefined

      if (stagePhase && !options.getPackageContext) {
        beginChapter()
      }

      if (!(await playAfterQuestionPresentation(ticket, combined))) {
        return
      }

      await render()

      if (disposed || ticket !== generation || combined.aborted) {
        return
      }

      emit()
      clear()
      const { duration } = chapters[chapterIndex]
      const remaining =
        !stagePhase && duration.kind === "known"
          ? Math.max(0, duration.milliseconds - clock.snapshot().elapsedMs)
          : 100
      timer = setTimeout(
        () => {
          void tick().catch(fail)
        },
        Math.min(100, remaining),
      )
    },
    async pause() {
      generation += 1
      audioAudition = undefined
      stop()
      await render()
      emit()
    },
    async replay(signal) {
      if (disposed) {
        throw new Error("Preview disposed")
      }

      generation += 1

      const ticket = generation,
        combined = signal
          ? AbortSignal.any([signal, abort.signal])
          : abort.signal
      stop()
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      ended = false
      if (stagePhase === "lobby" && options.getPackageContext) {
        clock.replay()
      } else {
        chapterIndex = 0
        beginChapter()
      }

      if (!(await playAfterQuestionPresentation(ticket, combined))) {
        return
      }

      await render()

      if (disposed || ticket !== generation || combined.aborted) {
        return
      }

      emit()
      const { duration } = chapters[chapterIndex]
      const remaining =
        !stagePhase && duration.kind === "known"
          ? Math.max(0, duration.milliseconds - clock.snapshot().elapsedMs)
          : 100
      timer = setTimeout(
        () => {
          void tick().catch(fail)
        },
        Math.min(100, remaining),
      )
    },
    async seekChapter(id, signal) {
      const index = chapters.findIndex((chapter) => chapter.id === id)

      if (index < 0 || disposed) {
        throw new Error("Preview chapter unavailable")
      }

      generation += 1

      const ticket = generation
      stop()
      await revalidate(AbortSignal.any([signal, abort.signal]))

      if (disposed || ticket !== generation || signal.aborted) {
        return
      }

      chapterIndex = index
      ended = false
      beginChapter()
      await render()

      if (!disposed && ticket === generation && !signal.aborted) {
        emit()
      }
    },
    async seekMedia(seconds, signal) {
      generation += 1

      const ticket = generation,
        combined = AbortSignal.any([signal, abort.signal])
      stop()
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      const element = native?.mediaElement()

      if (!element || !isSeekableMediaTime(measured(), seconds)) {
        throw new Error("Media seek unavailable")
      }

      stop()
      clock.seek(seconds * 1000)
      await render()
      combined.throwIfAborted()

      if (Math.abs(element.currentTime - seconds) > 0.05 || element.seeking) {
        await new Promise<void>((resolve, reject) => {
          const controller = new AbortController()
          const cleanup = () => {
            clearTimeout(timeout)
            controller.abort()
          }
          const timeout = setTimeout(() => {
            cleanup()
            reject(new Error("Media seek unavailable"))
          }, 5000)
          element.addEventListener(
            "seeked",
            () => {
              cleanup()

              if (Math.abs(element.currentTime - seconds) <= 0.1) {
                resolve()
              } else {
                reject(new Error("Media seek unavailable"))
              }
            },
            { signal: controller.signal, once: true },
          )
          combined.addEventListener(
            "abort",
            () => {
              cleanup()
              reject(
                new Error("Media seek cancelled", {
                  cause: combined.reason as unknown,
                }),
              )
            },
            { signal: controller.signal, once: true },
          )
          element.currentTime = seconds
        })
      }

      emit()
    },
    async setAppearance(value, signal) {
      if (disposed || options.source.kind !== "account-owned") {
        throw new Error("Preview disposed")
      }

      assertBoundedJson(value)
      const next = applicationAppearanceSchema.parse(value)
      const { selection } = next.document
      const theme = resolveShowTheme({ selection, role: "spectator" })

      if (
        ![
          "tadazz-classic-stage",
          "tadazz-original-stage",
          "razzia-native-stage",
        ].includes(theme.definition.rendererId) ||
        theme.diagnostics.length
      ) {
        throw new Error("Unsupported preview theme")
      }

      const requested = new Set<string>(),
        builtins = new Set(
          showThemeRegistry
            .list()
            .flatMap((definition) =>
              definition.assets.map((asset) => asset.url),
            ),
        )
      const check = (assetValue: unknown, key = "") => {
        if (
          typeof assetValue === "string" &&
          /url$/iu.test(key) &&
          assetValue
        ) {
          if (assetValue.startsWith("/media/")) {
            requested.add(assetValue)
          } else if (!builtins.has(assetValue)) {
            throw new Error("Unbound preview asset")
          }
        }

        if (Array.isArray(assetValue)) {
          assetValue.forEach((item) => {
            check(item)
          })
        } else if (assetValue && typeof assetValue === "object") {
          Object.entries(assetValue).forEach(([name, item]) => {
            check(item, name)
          })
        }
      }
      check(next)
      for (const template of next.registry.templates) {
        if (template.roles.includes("spectator")) {
          resolveApplicationTemplate(next, "spectator", template.phase)
        }
      }
      generation += 1

      const ticket = generation
      stop()
      await options.revalidate(AbortSignal.any([signal, abort.signal]))
      const assets = requested.size
        ? await options.authorizeMedia(
            [...requested].sort(),
            AbortSignal.any([signal, abort.signal]),
          )
        : []

      if (disposed || signal.aborted || ticket !== generation) {
        return
      }

      show = freeze(
        tadaShowV1Schema.parse({
          ...options.show,
          defaults: { ...options.show.defaults, showTheme: selection },
          cards: options.show.cards.map((card) => {
            const scope = applicationCardThemeScope(
              next,
              options.scopeIds?.[card.key] ?? card.key,
              card.themeOverrides,
            )

            return scope ? { ...card, themeOverrides: scope } : card
          }),
        }),
      )
      audioAudition = undefined
      appearanceAssets = assets
      appearance = freeze(next)
      appearanceRevision += 1
      await render()
      emit()
    },
    async setRole(next, signal) {
      if (
        disposed ||
        options.source.kind !== "account-owned" ||
        !["manager", "player", "spectator"].includes(next)
      ) {
        throw new Error("Preview role unavailable")
      }

      if (next === role) {
        return
      }

      generation += 1

      const ticket = generation
      stop()
      const combined = AbortSignal.any([signal, abort.signal])
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      audioAudition = undefined
      role = next
      mediaRevealed = false
      appearanceRevision += 1
      await render()
      emit()
    },
    async previewLobby(signal) {
      if (disposed) {
        throw new Error("Preview unavailable")
      }

      generation += 1
      const ticket = generation
      const combined = AbortSignal.any([signal, abort.signal])
      stop()
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      stagePhase = "lobby"
      if (options.getPackageContext) clock.replay()
      audioAudition = undefined
      mediaRevealed = false
      appearanceRevision += 1
      await render()
      emit()
    },
    async setMediaRevealed(next, signal) {
      if (disposed || typeof next !== "boolean" || !manualRevealAvailable()) {
        throw new Error("Preview reveal unavailable")
      }

      generation += 1
      const ticket = generation
      const combined = AbortSignal.any([signal, abort.signal])
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      mediaRevealed = next
      await render()
      emit()
    },
    async setSoundEnabled(next, signal) {
      if (disposed || typeof next !== "boolean") {
        throw new Error("Preview sound unavailable")
      }

      const combined = AbortSignal.any([signal, abort.signal])
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed) {
        return
      }

      soundEnabled = next
      await render()
      emit()
    },
    async auditionAudioEvent(event, signal) {
      if (
        disposed ||
        (event !== null && !SHOW_THEME_AUDIO_EVENTS.includes(event))
      ) {
        throw new Error("Preview audio event unavailable")
      }

      generation += 1

      const ticket = generation,
        combined = AbortSignal.any([signal, abort.signal])
      stop()
      await revalidate(combined)
      combined.throwIfAborted()

      if (disposed || ticket !== generation) {
        return
      }

      soundEnabled = event !== null
      audioAudition =
        event === null
          ? undefined
          : { event, sequence: (auditionSequence += 1), startedAt: Date.now() }
      await render()
      emit()
    },
    dispose,
  }
}
