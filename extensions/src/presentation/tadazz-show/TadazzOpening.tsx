import { PlatformButton } from "../platform-controls"
import { TADAZZ_PRODUCT_LOGO_URL } from "../../core/product-branding"
import { useCallback, useEffect, useRef, useState } from "react"
import { LottiePlayer } from "../lottie-player"
import {
  stripLottieBackgroundPlate,
  stripOpeningExportWatermark,
} from "./lottie-plate"
import { TADAZZ_BACKDROP_URL } from "./TadazzStage"
import { isSafeThemeAssetUrl } from "../../core/show-themes/selection"

export const TADAZZ_OPENING_VIDEO_URL =
  "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4"

export const TADAZZ_OPENING_LOTTIE_URL =
  "/tadazz-show/opening/TADAZZ-Opening-4-5s.json"

export const TADAZZ_OPENING_VIDEO_DURATION_MS = 7933

export const TADAZZ_EVENT_ARTWORK_DURATION_MS = 2200

export const TADAZZ_OPENING_SOUNDTRACK_DURATION_MS = 12000

const lottieCache = new Map<string, Promise<Record<string, unknown> | null>>()

export function loadOpeningLottie(
  url: string,
): Promise<Record<string, unknown> | null> {
  const bundled = url.startsWith("/tadazz-show/") && isSafeThemeAssetUrl(url)
  let pending = bundled ? lottieCache.get(url) : undefined

  if (!pending) {
    pending = fetch(url, { cache: bundled ? "force-cache" : "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) =>
        json
          ? stripLottieBackgroundPlate(
              stripOpeningExportWatermark(json as Record<string, unknown>),
            ).data
          : null,
      )
      .catch(() => null)

    if (bundled) {
      lottieCache.set(url, pending)
    }
  }

  return pending
}

export function preloadOpeningAssets(
  assets: { lottieUrl?: string } = {},
): void {
  if (typeof document === "undefined") {
    return
  }

  void loadOpeningLottie(assets.lottieUrl ?? TADAZZ_OPENING_LOTTIE_URL)

  if (!document.querySelector(`link[data-tadazz-preload="wasm"]`)) {
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "fetch"
    link.href = "/api/extensions/lottie-wasm"
    link.crossOrigin = "anonymous"
    link.dataset.tadazzPreload = "wasm"
    document.head.appendChild(link)
  }
}

export interface TadazzOpeningProps {
  backdropUrl?: string
  videoUrl?: string
  lottieUrl?: string
  eventArtworkUrl?: string
  eventArtworkPending?: boolean
  onFinished: () => void
  onSkip?: () => void
  onEnableSound?: () => void
  canSkip?: boolean
  labels?: { skip: string; enableSound: string }
}

/** Muted visual opening. Music is owned by the presenter-scoped AudioCuePlayer. */
export function TadazzOpening({
  backdropUrl = TADAZZ_BACKDROP_URL,
  videoUrl = TADAZZ_OPENING_VIDEO_URL,
  lottieUrl = TADAZZ_OPENING_LOTTIE_URL,
  eventArtworkUrl,
  eventArtworkPending = false,
  onFinished,
  onSkip,
  onEnableSound,
  canSkip = false,
  labels = { skip: "Skip", enableSound: "Enable sound" },
}: TadazzOpeningProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const finishedRef = useRef(false)
  const [lottieData, setLottieData] = useState<Record<string, unknown> | null>(
    null,
  )
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [videoReady, setVideoReady] = useState(false)
  const [lottieReady, setLottieReady] = useState(false)
  const [lottieFailed, setLottieFailed] = useState(false)
  const [soundRequested, setSoundRequested] = useState(false)
  const [brandEnded, setBrandEnded] = useState(false)
  const eventArtworkActive = brandEnded && Boolean(eventArtworkUrl)
  const brandTransitionActive = !eventArtworkActive
  const endBrand = useCallback(() => setBrandEnded(true), [])

  const finish = useCallback(() => {
    if (finishedRef.current) {
      return
    }

    finishedRef.current = true
    onFinished()
  }, [onFinished])

  useEffect(() => {
    let alive = true
    void loadOpeningLottie(lottieUrl).then((data) => {
      if (alive) {
        setLottieData(data)

        if (!data) {
          setLottieFailed(true)
        }
      }
    })

    return () => {
      alive = false
    }
  }, [lottieUrl])

  // TADAZZ always comes first. Only then show the event artwork before the lobby.
  useEffect(() => {
    if (!brandEnded) {
      return
    }

    if (eventArtworkUrl) {
      const id = setTimeout(finish, TADAZZ_EVENT_ARTWORK_DURATION_MS)

      return () => clearTimeout(id)
    }

    if (!eventArtworkPending) {
      finish()

      return
    }

    const id = setTimeout(finish, 3000)

    return () => clearTimeout(id)
  }, [brandEnded, eventArtworkPending, eventArtworkUrl, finish])

  useEffect(() => {
    if (brandEnded || !videoReady || (!lottieReady && !lottieFailed)) {
      return
    }

    const video = videoRef.current

    if (!video) {
      return
    }

    // The source MP4 contains AAC. It must never become audible.
    video.defaultMuted = true
    video.muted = true
    video.volume = 0
    void video.play().catch(() => setVideoFailed(true))
  }, [brandEnded, videoReady, lottieReady, lottieFailed, videoUrl])

  useEffect(() => {
    if (brandEnded) {
      return
    }

    // A missing asset must not trap the show; normal completion follows the MP4.
    const id = setTimeout(() => {
      setVideoFailed(true)
      setLottieFailed(true)
    }, 8000)

    if (videoPlaying || videoFailed) {
      clearTimeout(id)
    }

    return () => clearTimeout(id)
  }, [brandEnded, videoPlaying, videoFailed])
  useEffect(() => {
    if (brandEnded || !videoFailed) {
      return
    }

    const id = setTimeout(endBrand, TADAZZ_OPENING_VIDEO_DURATION_MS)

    return () => clearTimeout(id)
  }, [brandEnded, videoFailed, endBrand])
  useEffect(() => {
    if (brandEnded || !videoPlaying) {
      return
    }

    const id = setTimeout(endBrand, TADAZZ_OPENING_VIDEO_DURATION_MS + 12000)

    return () => clearTimeout(id)
  }, [brandEnded, videoPlaying, endBrand])

  const showLottie =
    brandTransitionActive && Boolean(lottieData) && !lottieFailed
  const lottieDurationMs = lottieData
    ? ((Number(lottieData.op) - Number(lottieData.ip ?? 0)) /
        Number(lottieData.fr)) *
      1000
    : 4500
  const lottieSpeed = Math.max(
    0.25,
    lottieDurationMs / TADAZZ_OPENING_VIDEO_DURATION_MS,
  )

  return (
    <div
      className="tz-opening"
      data-testid="tadazz-opening"
      data-opening-phase={eventArtworkActive ? "event-artwork" : "brand"}
      data-video-playing={videoPlaying ? "true" : "false"}
      data-lottie-ready={lottieReady ? "true" : "false"}
    >
      <img
        src={TADAZZ_PRODUCT_LOGO_URL}
        alt="TADAZZ!"
        data-testid="product-logo"
        style={{
          position: "absolute",
          top: "4%",
          left: "4%",
          width: "17%",
          height: "auto",
          objectFit: "contain",
          zIndex: 5,
        }}
      />
      {brandTransitionActive && (
        <>
          <img
            className="tz-opening-poster"
            src={backdropUrl}
            alt=""
            aria-hidden="true"
          />
          {!videoFailed && (
            <video
              ref={videoRef}
              data-testid="tadazz-opening-video"
              src={videoUrl}
              playsInline
              muted
              disablePictureInPicture
              preload="auto"
              onLoadedData={() => setVideoReady(true)}
              onCanPlay={() => setVideoReady(true)}
              onVolumeChange={(event) => {
                event.currentTarget.muted = true
                event.currentTarget.volume = 0
              }}
              onPlaying={() => setVideoPlaying(true)}
              onWaiting={() => setVideoPlaying(false)}
              onEnded={endBrand}
              onError={() => setVideoFailed(true)}
            />
          )}
          {showLottie && lottieData && (
            <div
              className="tz-opening-lottie"
              style={{
                opacity:
                  lottieReady && (videoPlaying || videoFailed || brandEnded)
                    ? 1
                    : 0,
              }}
            >
              <LottiePlayer
                data={lottieData}
                loop={false}
                autoplay
                paused={brandEnded || (!videoPlaying && !videoFailed)}
                speed={lottieSpeed}
                renderDevicePixelRatio={1}
                frameUpdateIntervalMs={100}
                fit="contain"
                finish="holdLastFrame"
                dataTestId="tadazz-opening-lottie"
                className="relative h-full w-full"
                onReady={() => setLottieReady(true)}
                onError={() => setLottieFailed(true)}
              />
            </div>
          )}
        </>
      )}
      {eventArtworkActive && eventArtworkUrl && (
        <img
          className="tz-opening-event-card"
          src={eventArtworkUrl}
          alt="Creating Worlds"
          data-testid="tadazz-opening-event-artwork"
        />
      )}
      {brandTransitionActive && onEnableSound && !soundRequested && (
        <PlatformButton size="sm"
          type="button"
          className="absolute bottom-8 left-8 z-30 pointer-events-auto font-display"
          data-testid="tadazz-opening-enable-sound"
          onClick={() => {
            const video = videoRef.current

            if (video) {
              video.muted = true
              video.volume = 0

              if (lottieReady || lottieFailed) {
                void video.play().catch(() => setVideoFailed(true))
              }
            }

            setSoundRequested(true)
            onEnableSound()
          }}
        >
          {labels.enableSound}
        </PlatformButton>
      )}
      {canSkip && (
        <PlatformButton size="sm"
          type="button"
          className="absolute bottom-8 right-8 z-30 pointer-events-auto font-display"
          data-testid="tadazz-opening-skip"
          onClick={onSkip ?? (eventArtworkActive ? finish : endBrand)}
        >
          {labels.skip}
        </PlatformButton>
      )}
    </div>
  )
}
