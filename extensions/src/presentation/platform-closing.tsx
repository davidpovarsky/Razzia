import {
  createContext,
  useContext,
  useMemo,
  type CSSProperties,
  type PropsWithChildren,
} from "react"
import {
  PLATFORM_CURTAIN_LEFT_URL,
  PLATFORM_CURTAIN_RIGHT_URL,
  platformClosingFrame,
} from "../core/platform-opening"
import { TADAZZ_PRODUCT_LOGO_URL } from "../core/product-branding"

const PlatformClosingContext = createContext({
  ownsCurtain: false,
  closed: false,
})

export const usePlatformClosingState = () => useContext(PlatformClosingContext)

/** Standalone scene/editor previews keep their authored curtain choreography. */
export const usePlatformClosingOwner = () =>
  usePlatformClosingState().ownsCurtain

export function PlatformClosingBoundary({
  children,
  elapsedMs,
  reducedMotion = false,
}: PropsWithChildren<{
  /** A null value means an ordinary scene; a number means the product owns the curtain. */

  elapsedMs: number | null
  reducedMotion?: boolean
}>) {
  const frame = elapsedMs === null ? null : platformClosingFrame(elapsedMs)
  const ownsCurtain = elapsedMs !== null
  const closed = frame?.closed ?? false
  const state = useMemo(() => ({ ownsCurtain, closed }), [ownsCurtain, closed])
  const getCurtainProgress = () => {
    if (frame) {
      if (reducedMotion) {
        return Number(frame.closed)
      }

      return frame.curtainProgress
    }

    return 0
  }

  const progress = getCurtainProgress()
  const curtainStyle: CSSProperties = {
    position: "absolute",
    top: "-1.388889%",
    height: "102.777778%",
    width: "52.604167%",
    maxWidth: "none",
    objectFit: "cover",
  }

  const getClosingStage = () => {
    if (frame) {
      if (frame.closed) {
        return "closed"
      }

      return "closing"
    }

    return "inactive"
  }

  return (
    <PlatformClosingContext.Provider value={state}>
      <div
        className="relative h-full w-full overflow-hidden"
        data-testid="platform-closing-boundary"
        data-closing-stage={getClosingStage()}
      >
        {children}
        {frame && (
          <div
            className="pointer-events-none absolute inset-0 z-40 overflow-hidden"
            data-testid="platform-game-closing"
            data-elapsed-ms={Math.round(elapsedMs ?? 0)}
            data-curtain-progress={progress}
            aria-hidden="true"
          >
            <img
              src={PLATFORM_CURTAIN_LEFT_URL}
              alt=""
              draggable={false}
              style={{
                ...curtainStyle,
                left: 0,
                transform: `translateX(${-102.970297 * (1 - progress)}%)`,
              }}
            />
            <img
              src={PLATFORM_CURTAIN_RIGHT_URL}
              alt=""
              draggable={false}
              style={{
                ...curtainStyle,
                right: 0,
                transform: `translateX(${102.970297 * (1 - progress)}%)`,
              }}
            />
            {frame.closed && (
              <img
                src={TADAZZ_PRODUCT_LOGO_URL}
                alt=""
                className="absolute top-1/2 left-1/2 w-56 max-w-[35%] -translate-x-1/2 -translate-y-1/2"
                draggable={false}
              />
            )}
          </div>
        )}
      </div>
    </PlatformClosingContext.Provider>
  )
}
