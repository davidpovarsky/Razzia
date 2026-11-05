import { useCallback, useEffect, useRef, useState } from "react"
import { LottiePlayer } from "../lottie-player"
import { stripLottieBackgroundPlate } from "./lottie-plate"
import { TADAZZ_BACKDROP_URL } from "./TadazzStage"

/** Owner-supplied opening assets (self-hosted, served from the web bundle). */
export const TADAZZ_OPENING_VIDEO_URL =
  "/tadazz-show/opening/Animate_gameshow_stage_loop_c01e8a8a_1080p.mp4"
export const TADAZZ_OPENING_LOTTIE_URL = "/tadazz-show/opening/TADAZZ-Opening-4-5s.json"

const lottieCache = new Map<string, Promise<Record<string, unknown> | null>>()

/** Fetches the original Lottie once and strips only its opaque background plate. */
export function loadOpeningLottie(url: string): Promise<Record<string, unknown> | null> {
  let pending = lottieCache.get(url)
  if (!pending) {
    pending = fetch(url, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => (json ? stripLottieBackgroundPlate(json as Record<string, unknown>).data : null))
      .catch(() => null)
    lottieCache.set(url, pending)
  }
  return pending
}

/** Warm the opening media before the lobby mounts (called by the show shell). */
export function preloadOpeningAssets(): void {
  if (typeof document === "undefined") return
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
  /** Called once when the opening has finished (video ended, or fallback timer). */
  onFinished: () => void
  /** Host-only skip control. */
  canSkip?: boolean
  labels?: { skip: string; enableSound: string }
}

/**
 * Pre-lobby opening compositor: the owner's MP4 is the stage background and
 * the original TADAZZ opening Lottie plays transparently above it through the
 * project's LottiePlayer (dotLottie WASM). The canonical backdrop is the
 * poster, so no legacy or blank frame can show while the media loads.
 */
export function TadazzOpening({
  videoUrl = TADAZZ_OPENING_VIDEO_URL,
  lottieUrl = TADAZZ_OPENING_LOTTIE_URL,
  onFinished,
  canSkip = false,
  labels = { skip: "Skip", enableSound: "Enable sound" },
}: TadazzOpeningProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const finishedRef = useRef(false)
  const [lottieData, setLottieData] = useState<Record<string, unknown> | null>(null)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [videoFailed, setVideoFailed] = useState(false)
  const [lottieReady, setLottieReady] = useState(false)
  const [soundBlocked, setSoundBlocked] = useState(false)

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    onFinished()
  }, [onFinished])

  useEffect(() => {
    let alive = true
    void loadOpeningLottie(lottieUrl).then((data) => {
      if (alive) setLottieData(data)
    })
    return () => {
      alive = false
    }
  }, [lottieUrl])

  // Safari/iPad autoplay: try with sound, fall back to muted + "enable sound".
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.muted = false
    const attempt = video.play()
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        video.muted = true
        setSoundBlocked(true)
        video.play().catch(() => setVideoFailed(true))
      })
    }
  }, [videoUrl])

  // If video playback has not started within 2s (e.g. codec absent or silent autoplay block), fall back to poster + Lottie.
  useEffect(() => {
    if (videoPlaying || videoFailed) return
    const id = setTimeout(() => setVideoFailed(true), 2000)
    return () => clearTimeout(id)
  }, [videoPlaying, videoFailed])

  // Fallback when the video cannot play: Lottie over the poster, then finish.
  useEffect(() => {
    if (!videoFailed) return
    const id = setTimeout(finish, 5500)
    return () => clearTimeout(id)
  }, [videoFailed, finish])

  // Hard ceiling so a stalled network can never trap the show in the opening.
  useEffect(() => {
    const id = setTimeout(finish, 20000)
    return () => clearTimeout(id)
  }, [finish])

  const showLottie = Boolean(lottieData) && (videoPlaying || videoFailed)

  return (
    <div className="tz-opening" data-testid="tadazz-opening" data-video-playing={videoPlaying ? "true" : "false"} data-lottie-ready={lottieReady ? "true" : "false"}>
      <img className="tz-opening-poster" src={TADAZZ_BACKDROP_URL} alt="" aria-hidden="true" />
      {!videoFailed && (
        <video
          ref={videoRef}
          data-testid="tadazz-opening-video"
          src={videoUrl}
          playsInline
          preload="auto"
          onPlaying={() => setVideoPlaying(true)}
          onEnded={finish}
          onError={() => setVideoFailed(true)}
        />
      )}
      {showLottie && lottieData && (
        <div className="tz-opening-lottie" style={{ opacity: lottieReady ? 1 : 0 }}>
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
      {soundBlocked && (
        <button
          type="button"
          className="tz-opening-skip tz-opening-sound"
          onClick={() => {
            const video = videoRef.current
            if (video) {
              video.muted = false
              void video.play().catch(() => undefined)
            }
            setSoundBlocked(false)
          }}
        >
          {labels.enableSound}
        </button>
      )}
      {canSkip && (
        <button type="button" className="tz-opening-skip" data-testid="tadazz-opening-skip" onClick={finish}>
          {labels.skip}
        </button>
      )}
    </div>
  )
}
