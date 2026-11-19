// oxlint-disable react/set-state-in-effect -- Synchronize the authoritative room clock and command acknowledgement with this transient platform surface.
import {
  EXTENSION_EVENTS,
  PLATFORM_CURTAIN_LEFT_URL,
  PLATFORM_CURTAIN_RIGHT_URL,
  TADAZZ_PRODUCT_LOGO_URL,
  platformOpeningFrame,
  type ExtensionStateEnvelope,
  type PlatformOpeningSnapshot,
} from "@razzia/extensions/core"
import {
  TadazzOpening,
  preloadOpeningAssets,
} from "@razzia/extensions/presentation"
import { Button, PlatformScope } from "@razzia/extensions/platform-ui"
import { STATUS } from "@razzia/common/types/game/status"
import { Play, SkipForward } from "lucide-react"
import { useReducedMotion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSocket } from "../contexts/socket-context"
import ManagerControlToolbar from "./ManagerControlToolbar"
import { useTadazzShellText } from "./tadazz-show/useTadazzLabels"
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
  const [now, setNow] = useState(Date.now)
  const [clockOffset, setClockOffset] = useState(0)
  const [pending, setPending] = useState(false)
  const pendingRef = useRef(false)
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paused = extensionState.pause?.paused ?? false

  useEffect(() => {
    preloadOpeningAssets()

    return () => {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    let alive = true
    let bestRtt = Infinity
    const sample = () => {
      const sent = Date.now()
      socket.emit("extensions:clock", (serverNow) => {
        const received = Date.now()
        const rtt = received - sent

        if (alive && Number.isFinite(serverNow) && rtt < bestRtt) {
          bestRtt = rtt
          setClockOffset(serverNow - (sent + received) / 2)
        }
      })
    }

    if (isConnected) {
      sample()
    }

    const retry = setTimeout(sample, 500)

    return () => {
      alive = false
      clearTimeout(retry)
    }
  }, [socket, isConnected])

  useEffect(() => {
    pendingRef.current = false
    setPending(false)
  }, [launch.stage])

  useEffect(() => {
    if (launch.stage !== "opening" || paused) {
      return
    }

    let frame = 0
    let previous = 0
    const tick = (time: number) => {
      // Curtains follow the display refresh rate; the video needs only a drift check.
      const interval =
        Date.now() + clockOffset - (launch.startedAt ?? 0) < 2300 ? 16 : 100

      if (time - previous >= interval) {
        previous = time
        setNow(Date.now())
      }

      frame = requestAnimationFrame(tick)
    }
    setNow(Date.now())
    frame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(frame)
  }, [launch.stage, launch.startedAt, paused, clockOffset])

  const frame = platformOpeningFrame(
    launch,
    now + clockOffset,
    paused ? extensionState.pause?.remainingMs : undefined,
  )
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
    </PlatformScope>
  )
}
