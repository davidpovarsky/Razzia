import {
  canSeekChapter,
  sourceMatchesSelection,
  type GamePreviewProvider,
  type PreviewPreferences,
  type PreviewSelection,
} from "./contracts"

let queue = Promise.resolve()

const allowedAssets = /^\/(?:assets|branding|media|tadazz-show)\//u
interface PosterRequest {
  provider: GamePreviewProvider
  selection: PreviewSelection
  preferences: PreviewPreferences
}

function fetchPosterAsset(url: string): Promise<string | false> {
  const asset = new URL(url, window.location.href)
  const local =
    asset.origin === window.location.origin &&
    (asset.protocol === "blob:" || allowedAssets.test(asset.pathname))

  return Promise.resolve(
    local || asset.protocol === "data:"
      ? false
      : "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  )
}

async function renderPoster(
  { provider, selection, preferences }: PosterRequest,
  signal: AbortSignal,
) {
  signal.throwIfAborted()
  const result = await provider.open(selection, signal, {
    ...preferences,
    reducedMotion: true,
  })

  if (result.status !== "ready") {
    return null
  }

  const { session } = result
  const host = document.createElement("div")
  host.style.cssText =
    "position:fixed;left:-1920px;top:0;width:960px;height:540px;pointer-events:none"
  host.setAttribute("aria-hidden", "true")
  host.inert = true

  try {
    signal.throwIfAborted()

    if (!sourceMatchesSelection(session.source, selection)) {
      return null
    }

    const chapter =
      session.chapters.find(({ phase }) => phase === "voting") ??
      session.chapters.find(({ phase }) => phase === "question")

    document.body.append(host)
    await session.mount(host, { muted: true })

    if (chapter && canSeekChapter(session, chapter)) {
      await session.seekChapter(chapter.id, signal)
    }

    signal.throwIfAborted()
    const frame = host.shadowRoot?.querySelector<HTMLElement>("div")

    if (!frame) {
      return null
    }

    const { domToBlob } = await import("modern-screenshot")
    const image = await domToBlob(frame, {
      type: "image/webp",
      quality: 0.82,
      scale: 0.75,
      timeout: 5000,
      fetchFn: fetchPosterAsset,
      fetch: {
        requestInit: {
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
          signal,
        },
      },
    })
    signal.throwIfAborted()

    return image.size ? image : null
  } finally {
    try {
      await session.dispose()
    } finally {
      host.remove()
    }
  }
}

/** Render one quiet, paused game frame at a time, independently of user playback. */
export function captureGamePoster(request: PosterRequest, signal: AbortSignal) {
  const result = queue.then(() => renderPoster(request, signal))
  queue = result.then(
    () => undefined,
    () => undefined,
  )

  return result
}
