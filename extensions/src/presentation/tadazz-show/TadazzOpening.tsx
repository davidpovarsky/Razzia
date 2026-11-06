import { useCallback, useEffect, useRef, useState } from "react"
import { LottiePlayer } from "../lottie-player"
import { stripLottieBackgroundPlate } from "./lottie-plate"
import { TADAZZ_BACKDROP_URL } from "./TadazzStage"

export const TADAZZ_OPENING_VIDEO_URL =
  "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4"

export const TADAZZ_OPENING_LOTTIE_URL =
  "/tadazz-show/opening/TADAZZ-Opening-4-5s.json"

export const TADAZZ_OPENING_VIDEO_DURATION_MS = 7933

export const TADAZZ_OPENING_SOUNDTRACK_DURATION_MS = 12000

const lottieCache = new Map<string, Promise<Record<string, unknown> | null>>()

export function loadOpeningLottie(
  url: string,
): Promise<Record<string, unknown> | null> {
  let pending = lottieCache.get(url)

  if (!pending) {
    pending = fetch(url, { cache: "force-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) =>
        json
          ? stripLottieBackgroundPlate(json as Record<string, unknown>).data
          : null,
      )
      .catch(() => null)
    lottieCache.set(url, pending)
  }

  return pending
}

export function preloadOpeningAssets(): void {
  if (typeof document === "undefined") {
    return
  }
  void loadOpeningLottie(TADAZZ_OPENING_LOTTIE_URL)

  if (!document.querySelector(`link[data-tadazz-preload="video"]`)) {
    const link = document.createElement("link")
    link.rel = "preload"
    link.as = "video"
    link.href = TADAZZ_OPENING_VIDEO_URL
    link.dataset.tadazzPreload = "video"
    document.head.appendChild(link)
  }
}

export interface TadazzOpeningProps {
  videoUrl?: string
  lottieUrl?: string
  onFinished: () => void
  onEnableSound?: () => void
  canSkip?: boolean
  labels?: { skip: string; enableSound: string }
}

/** Muted visual opening. Music is owned by the presenter-scoped AudioCuePlayer. */
export function TadazzOpening({
  videoUrl = TADAZZ_OPENING_VIDEO_URL,
  lottieUrl = TADAZZ_OPENING_LOTTIE_URL,
  onFinished,
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
  const [lottieReady, setLottieReady] = useState(false)
  const [soundRequested, setSoundRequested] = useState(false)

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
      }
    })

    return () => {
      alive = false
    }
  }, [lottieUrl])

  useEffect(() => {
    const video = videoRef.current

    if (!video) {
      return
    }
    // The source MP4 contains AAC. It must never become audible.
    video.defaultMuted = true
    video.muted = true
    video.volume = 0
    void video.play().catch(() => setVideoFailed(true))
  }, [videoUrl])

  useEffect(() => {
    if (videoPlaying || videoFailed) {
      return
    }
    const id = setTimeout(() => setVideoFailed(true), 2000)

    return () => clearTimeout(id)
  }, [videoPlaying, videoFailed])

  // A single monotonic visual clock reveals the QR lobby at 7.933 seconds,
  // independent of decode, load, or media-ended races.
  useEffect(() => {
    const id = setTimeout(finish, TADAZZ_OPENING_VIDEO_DURATION_MS)

    return () => clearTimeout(id)
  }, [finish])

  const showLottie = Boolean(lottieData) && (videoPlaying || videoFailed)

  return (
    <div
      className="tz-opening"
      data-testid="tadazz-opening"
      data-video-playing={videoPlaying ? "true" : "false"}
      data-lottie-ready={lottieReady ? "true" : "false"}
    >
      <img
        className="tz-opening-poster"
        src={TADAZZ_BACKDROP_URL}
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
          onVolumeChange={(event) => {
            event.currentTarget.muted = true
            event.currentTarget.volume = 0
          }}
          onPlaying={() => setVideoPlaying(true)}
          onEnded={finish}
          onError={() => setVideoFailed(true)}
        />
      )}
      {showLottie && lottieData && (
        <div
          className="tz-opening-lottie"
          style={{ opacity: lottieReady ? 1 : 0 }}
        >
          <LottiePlayer
            data={lottieData}
            loop={false}
            autoplay
            fit="contain"
            finish="holdLastFrame"
            dataTestId="tadazz-opening-lottie"
            className="relative h-full w-full"
            onReady={() => setLottieReady(true)}
            onError={() => setLottieReady(false)}
          />
        </div>
      )}
      {onEnableSound && !soundRequested && (
        <button
          type="button"
          className="tz-opening-skip tz-opening-sound"
          data-testid="tadazz-opening-enable-sound"
          onClick={() => {
            const video = videoRef.current

            if (video) {
              video.muted = true
              video.volume = 0
              void video.play().catch(() => setVideoFailed(true))
            }

            setSoundRequested(true)
            onEnableSound()
          }}
        >
          {labels.enableSound}
        </button>
      )}
      {canSkip && (
        <button
          type="button"
          className="tz-opening-skip"
          data-testid="tadazz-opening-skip"
          onClick={finish}
        >
          {labels.skip}
        </button>
      )}
    </div>
  )
}
