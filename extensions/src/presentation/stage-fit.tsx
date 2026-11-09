import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
const clsx = (...classes: unknown[]): string =>
  classes
    .flatMap((c) => {
      if (!c) {
        return []
      }

      if (typeof c === "string") {
        return [c]
      }

      if (Array.isArray(c)) {
        return [clsx(...(c as unknown[]))]
      }

      if (typeof c === "object") {
        return Object.entries(c as Record<string, unknown>)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k)
      }

      return []
    })
    .join(" ")

export type StageFitMode = "spacious" | "compact" | "ultracompact"

export interface StageFitState {
  availableWidth: number
  availableHeight: number
  fitMode: StageFitMode
  isCompact: boolean
  isUltraCompact: boolean
  isNarrowMobile: boolean
  isPortrait: boolean
  maxPhotoHeightPx: number
}

const defaultState: StageFitState = {
  availableWidth: 1280,
  availableHeight: 800,
  fitMode: "spacious",
  isCompact: false,
  isUltraCompact: false,
  isNarrowMobile: false,
  isPortrait: false,
  maxPhotoHeightPx: 160,
}

const StageFitContext = createContext<StageFitState>(defaultState)

export const useStageFit = (): StageFitState => useContext(StageFitContext)

export interface StageFitContainerProps extends PropsWithChildren {
  className?: string
  /**
   * Optional manual override of available height if container bounds
   * are constrained externally.
   */
  heightOverride?: number
  "data-testid"?: string
}

export const StageFitContainer = ({
  children,
  className,
  heightOverride,
  "data-testid": testId = "stage-fit-container",
}: StageFitContainerProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [dimensions, setDimensions] = useState<{
    width: number
    height: number
  }>(() => {
    if (typeof window !== "undefined") {
      return {
        width: window.innerWidth,
        height: heightOverride ?? window.innerHeight,
      }
    }

    return { width: 1280, height: heightOverride ?? 800 }
  })

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const updateFromNode = (node: HTMLElement) => {
      const rect = node.getBoundingClientRect()
      const w = Math.round(rect.width) || window.innerWidth
      const h =
        heightOverride ?? (Math.round(rect.height) || window.innerHeight)

      setDimensions((prev) => {
        if (Math.abs(prev.width - w) > 2 || Math.abs(prev.height - h) > 2) {
          return { width: w, height: h }
        }

        return prev
      })
    }

    if (containerRef.current) {
      updateFromNode(containerRef.current)
    }

    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.target instanceof HTMLElement) {
            updateFromNode(entry.target)
          }
        }
      })
      ro.observe(containerRef.current)

      return () => ro.disconnect()
    }

    const onResize = () => {
      if (containerRef.current) {
        updateFromNode(containerRef.current)
      } else {
        setDimensions({
          width: window.innerWidth,
          height: heightOverride ?? window.innerHeight,
        })
      }
    }

    window.addEventListener("resize", onResize)

    return () => window.removeEventListener("resize", onResize)
  }, [heightOverride])

  const { width, height } = dimensions
  const isPortrait = height > width
  const isNarrowMobile = width < 450

  const fitMode: StageFitMode = (() => {
    if (height < 580) {
      return "ultracompact"
    }

    if (height < 750) {
      return "compact"
    }

    return "spacious"
  })()

  const isUltraCompact = fitMode === "ultracompact"
  const isCompact = fitMode === "compact" || isUltraCompact

  // Compute maximum frame height for photos depending on vertical budget
  const maxPhotoHeightPx = (() => {
    if (isUltraCompact) {
      return Math.max(40, Math.min(60, Math.floor(height * 0.09)))
    }

    if (isNarrowMobile || isPortrait) {
      return Math.max(50, Math.min(84, Math.floor(height * 0.11)))
    }

    if (isCompact) {
      return Math.max(64, Math.min(110, Math.floor(height * 0.16)))
    }

    return Math.max(90, Math.min(180, Math.floor(height * 0.2)))
  })()

  const state: StageFitState = {
    availableWidth: width,
    availableHeight: height,
    fitMode,
    isCompact,
    isUltraCompact,
    isNarrowMobile,
    isPortrait,
    maxPhotoHeightPx,
  }

  return (
    <StageFitContext.Provider value={state}>
      <div
        ref={containerRef}
        data-testid={testId}
        data-fit-mode={fitMode}
        data-is-compact={isCompact ? "true" : "false"}
        data-is-ultracompact={isUltraCompact ? "true" : "false"}
        data-is-portrait={isPortrait ? "true" : "false"}
        style={
          {
            // Expose reactive stage dimension variables for child css clamp
            "--stage-available-height": `${height}px`,
            "--stage-available-width": `${width}px`,
            "--stage-max-photo-h": `${maxPhotoHeightPx}px`,
          } as React.CSSProperties
        }
        className={clsx(
          "relative flex h-full min-h-0 w-full flex-1 flex-col justify-between overflow-hidden",
          className,
        )}
      >
        {children}
      </div>
    </StageFitContext.Provider>
  )
}
