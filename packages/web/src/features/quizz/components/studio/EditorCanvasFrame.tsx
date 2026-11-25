import {
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react"

/** Fit both dimensions of the actual native stage, without stretching its ratio. */
export function EditorCanvasFrame({
  children,
  aspect = "16:9",
}: PropsWithChildren<{ aspect?: "16:9" | "4:3" }>) {
  const available = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const ratio = aspect === "4:3" ? 4 / 3 : 16 / 9
  useLayoutEffect(() => {
    const node = available.current

    if (!node) {
      return
    }

    const resize = () =>
      setWidth(
        Math.max(0, Math.min(node.clientWidth, node.clientHeight * ratio)),
      )
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)

    return () => observer.disconnect()
  }, [ratio])

  return (
    <div className="editor-canvas-frame" ref={available}>
      <div
        className="editor-canvas-frame-stage"
        style={{
          width,
          height: width / ratio,
          visibility: width > 0 ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  )
}
