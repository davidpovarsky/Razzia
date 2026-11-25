import {
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"
import { StageFitContainer } from "@razzia/extensions/presentation"

/** Scale the original stage into a bounded card without changing its layout. */
export function EditorPreviewViewport({
  children,
  aspect = "16:9",
  animate = false,
}: PropsWithChildren<{
  aspect?: "16:9" | "4:3"
  animate?: boolean
}>) {
  const viewport = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const width = aspect === "4:3" ? 960 : 1280
  const height = 720
  const [scale, setScale] = useState(0)

  useLayoutEffect(() => {
    const node = viewport.current

    if (!node) {
      return
    }

    const update = () => setScale(node.getBoundingClientRect().width / width)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)

    return () => observer.disconnect()
  }, [width])

  useLayoutEffect(() => {
    if (animate) {
      return
    }

    const frame = requestAnimationFrame(() => {
      for (const animation of stage.current?.getAnimations({ subtree: true }) ??
        []) {
        if (animation.effect?.getTiming().iterations === Infinity) {
          animation.pause()
        } else {
          try {
            animation.finish()
          } catch {
            animation.pause()
          }
        }
      }
    })

    return () => cancelAnimationFrame(frame)
  }, [children, animate])

  return (
    <div
      ref={viewport}
      data-testid="editor-preview-viewport"
      data-preview-aspect={aspect}
      className="relative isolate w-full overflow-hidden rounded-xl"
      style={{ aspectRatio: aspect === "4:3" ? "4 / 3" : "16 / 9" }}
    >
      <div
        ref={stage}
        className="absolute top-0 left-0 flex flex-col overflow-hidden"
        style={{
          width,
          height,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: scale > 0 ? "visible" : "hidden",
        }}
      >
        <StageFitContainer widthOverride={width} heightOverride={height}>
          {children}
        </StageFitContainer>
      </div>
    </div>
  )
}
