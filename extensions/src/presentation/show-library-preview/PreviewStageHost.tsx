import { useEffect, useRef } from "react"

/** Owns an isolated future surface; no payload is loaded while pins are empty. */
export function PreviewStageHost({ unavailable }: { unavailable: string }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = host.current
    if (node && !node.shadowRoot) node.attachShadow({ mode: "open" })
  }, [])
  return <div><div ref={host} aria-hidden="true" /><p role="status">{unavailable}</p></div>
}
