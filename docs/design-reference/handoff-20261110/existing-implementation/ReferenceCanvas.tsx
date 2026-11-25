import { useCallback, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

/**
 * Keeps prototype typography and CSS inside a ShadowRoot, avoiding any effect
 * on /manager/quizz or the rest of the live game/player/presenter UI.
 * Assets and CSS are extracted from the user-approved HTML, byte-for-byte
 * except the host/root selector adaptation, recorded in asset-manifest.json.
 */
export function ReferenceCanvas({
  variant,
  children,
}: {
  variant: "marketing" | "studio"
  children: ReactNode
}) {
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  const [css, setCss] = useState<string | null>(null)
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node) setRoot(node.shadowRoot ?? node.attachShadow({ mode: "open" }))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setCss(null)
    void fetch(`/tadazz-design-reference/${variant}.css`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error("Design stylesheet unavailable")
        return response.text()
      })
      .then((text) => setCss(text))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Design stylesheet", error)
      })
    return () => controller.abort()
  }, [variant])

  return (
    <div ref={attach} style={{ display: "block", minHeight: "100vh" }}>
      {root &&
        css !== null &&
        createPortal(
          <>
            <style>{css}</style>
            <div id="app">{children}</div>
          </>,
          root,
        )}
    </div>
  )
}
