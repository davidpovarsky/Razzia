// oxlint-disable react/set-state-in-effect -- Synchronize the authoritative room clock and command acknowledgement with this transient platform surface.
import {
  EXTENSION_EVENTS,
  PLATFORM_CURTAIN_LEFT_URL,
  PLATFORM_CURTAIN_RIGHT_URL,
  PLATFORM_OPENING_DURATION_MS,
  applyThemeAudioDefaults,
  type AudioExtras,
  TADAZZ_PRODUCT_LOGO_URL,
  platformOpeningFrame,
  type ExtensionStateEnvelope,
  type PlatformOpeningSnapshot,
} from "@razzia/extensions/core"
import {
  TadazzOpening,
  preloadOpeningAssets,
  useResolvedShowTheme,
} from "@razzia/extensions/presentation"
import {
  Button,
  HostControlBar,
  HostFooter,
  PlatformScope,
} from "@razzia/extensions/platform-ui"
import { STATUS } from "@razzia/common/types/game/status"
import { Play, SkipForward } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSocket } from "../contexts/socket-context"
import ManagerControlToolbar from "./ManagerControlToolbar"
import GameSettingsModal from "@razzia/web/features/game/components/GameSettingsModal"
import HostGuestJoinToggle from "./HostGuestJoinToggle"
import { useTadazzShellText } from "./tadazz-show/useTadazzLabels"
import { NativeAudioCuePlayer } from "./tadazz-show/NativeAudioCuePlayer"
import { usePlatformClock } from "./use-platform-clock"
import "./platform-game-opening.css"

const holdFinalFrame = () => undefined

/** Application chrome owns the product ident; a show theme starts at its lobby. */
export function PlatformGameOpening({
  launch,
  extensionState,
  manager,
  isHostPresenting,
  onPresent,
  onExit,
}: {
  launch: PlatformOpeningSnapshot
  extensionState: ExtensionStateEnvelope
  manager: boolean
  isHostPresenting: boolean
  onPresent: () => void
  onExit: () => void
}) {
  const { t } = useTranslation()
  const tx = useTadazzShellText()
  const reducedMotion = useReducedMotion() ?? false
  const { socket, isConnected } = useSocket()
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paused = extensionState.pause?.paused ?? false
  const { now, clockOffset } = usePlatformClock(
    launch.stage === "opening",
    paused,
  )
  const theme = useResolvedShowTheme(
    extensionState,
    manager ? "manager" : "spectator",
  )
  const audio = useMemo(
    () =>
      applyThemeAudioDefaults(
        theme,
        extensionState.extras.audio as AudioExtras | undefined,
      ),
    [theme, extensionState.extras.audio],
  )
  const openingTrack = audio.soundtrack?.openingIntro

  useEffect(() => {
    preloadOpeningAssets()

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    pendingRef.current = false
    setPending(false)
  }, [launch.stage])

  const frame = platformOpeningFrame(
    launch,
    now,
    paused ? extensionState.pause?.remainingMs : undefined,
  )
  const showTrack =
    launch.stage === "opening" &&
    openingTrack?.mode === "media" &&
    openingTrack.url &&
    openingTrack.volume > 0
      ? {
          key: `platform-opening:${launch.startedAt}`,
          url: openingTrack.url,
          volume: openingTrack.volume,
          startOffsetSeconds: openingTrack.startOffsetSeconds,
          loop: openingTrack.loop,
          startedAt: (launch.startedAt ?? now) - clockOffset,
          elapsedMs: frame.elapsedMs,
          durationMs: Math.min(
            openingTrack.maxDurationMs ?? PLATFORM_OPENING_DURATION_MS,
            PLATFORM_OPENING_DURATION_MS,
          ),
        }
      : null
  const advance = () => {
    if (!manager || !isConnected || pendingRef.current || paused) {
      return
    }

    pendingRef.current = true
    setPending(true)
    window.dispatchEvent(new Event("tadazz:audio-unlock"))
    socket.emit(EXTENSION_EVENTS.COMMAND, {
      v: 1,
      gameId: extensionState.gameId,
      requestId: crypto.randomUUID(),
      action: "NEXT_SCREEN",
      payload: { epoch: extensionState.epoch, phase: extensionState.phase },
    })

    if (pendingTimer.current) {
      clearTimeout(pendingTimer.current)
    }

    pendingTimer.current = setTimeout(() => {
      pendingRef.current = false
      setPending(false)
    }, 1000)
  }

  return (
    <PlatformScope
      context="platform.host"
      className="platform-game-opening"
      data-testid="platform-game-opening"
      data-platform-opening-stage={launch.stage}
      data-game-paused={paused ? "true" : "false"}
      data-host-presenting={isHostPresenting ? "true" : "false"}
    >
      {manager && !isHostPresenting && (
        <ManagerControlToolbar
          statusName={STATUS.SHOW_ROOM}
          extensionState={extensionState}
          questionStates={null}
          onExit={onExit}
          onPresent={onPresent}
        />
      )}
      <div className="platform-game-opening__stage">
        {launch.stage === "opening" && !reducedMotion && (
          <TadazzOpening
            elapsedMs={frame.videoElapsedMs}
            paused={paused || !frame.videoVisible}
            onFinished={holdFinalFrame}
          />
        )}
        {launch.stage === "opening" && reducedMotion && (
          <div
            className="platform-game-opening__still"
            data-testid="platform-opening-reduced-motion"
          >
            <img
              className="platform-game-opening__logo"
              src={TADAZZ_PRODUCT_LOGO_URL}
              alt="TADAZZ!"
            />
          </div>
        )}
        <div
          className="platform-game-opening__curtain platform-game-opening__curtain--left"
          style={{ transform: `translateX(-${frame.curtainProgress * 104}%)` }}
          aria-hidden="true"
        >
          <img src={PLATFORM_CURTAIN_LEFT_URL} alt="" />
        </div>
        <div
          className="platform-game-opening__curtain platform-game-opening__curtain--right"
          style={{ transform: `translateX(${frame.curtainProgress * 104}%)` }}
          aria-hidden="true"
        >
          <img src={PLATFORM_CURTAIN_RIGHT_URL} alt="" />
        </div>
        <div
          className="platform-game-opening__welcome"
          style={{
            opacity: Math.max(0, 1 - frame.curtainProgress * 3),
            visibility: frame.curtainProgress >= 1 ? "hidden" : "visible",
          }}
        >
          <img
            className="platform-game-opening__logo"
            src={TADAZZ_PRODUCT_LOGO_URL}
            alt="TADAZZ!"
            data-testid="platform-opening-logo"
          />
          {manager && launch.stage === "standby" && (
            <Button
              variant="primary"
              size="lg"
              onClick={advance}
              disabled={!isConnected || pending}
              data-testid="platform-opening-start"
            >
              <Play aria-hidden="true" />
              {t("game:startGame")}
            </Button>
          )}
        </div>
        {manager && !isHostPresenting && launch.stage === "opening" && (
          <div className="platform-game-opening__skip">
            <Button
              size="sm"
              onClick={advance}
              disabled={!isConnected || pending || paused}
              data-testid="platform-opening-skip"
            >
              <SkipForward aria-hidden="true" />
              {tx("skipOpening", "Skip")}
            </Button>
          </div>
        )}
      </div>
      <HostFooter active={manager && !isHostPresenting}>
        <NativeAudioCuePlayer
          audioExtras={audio}
          showTrack={showTrack}
          soundtrackSlot="openingIntro"
          gameId={extensionState.gameId}
          activeCardKey="platform-opening"
          phase="platform-opening"
          epoch={extensionState.epoch}
          paused={paused || launch.stage !== "opening"}
          autoPlay={launch.stage === "opening"}
          showControls={manager && !isHostPresenting}
          controlLabels={{
            enable: t("extensions:audio.enableSound", "Enable sound"),
            volume: t("extensions:audio.volume", "Volume"),
            mute: t("extensions:audio.mute", "Mute"),
            unmute: t("extensions:audio.unmute", "Unmute"),
            pause: t("extensions:audio.pauseAudio", "Pause audio"),
            play: t("extensions:audio.playAudio", "Play audio"),
            track: t("extensions:audio.track", "Track"),
            followShow: t("extensions:audio.followShow", "Follow show"),
          }}
        />
        {manager && !isHostPresenting && (
          <HostControlBar className="ms-auto flex max-w-full flex-wrap items-center gap-2 p-2">
            <HostGuestJoinToggle />
            <GameSettingsModal />
          </HostControlBar>
        )}
      </HostFooter>
    </PlatformScope>
  )
}
