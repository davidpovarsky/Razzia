import { useCallback, useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import marketing from "../../../../site-assets/marketing.css?inline"
import studio from "../../../../site-assets/studio.css?inline"
import native from "../../themes/native.css?inline"

/** Bundled scoped CSS. No prototype scripts or unsafe HTML execution. */
export function ReferenceCanvas({
  variant,
  children,
}: {
  variant: "marketing" | "studio"
  children: ReactNode
}) {
  const [root, setRoot] = useState<ShadowRoot | null>(null)
  useEffect(() => {
    // The unchanged game HTML sets touch-none on body. A descendant/ShadowRoot
    // cannot override that ancestor's gesture restriction. Release it only while
    // a site/account/Studio canvas is mounted; restore the game's policy on exit.
    const previous = document.body.style.touchAction
    document.body.style.touchAction = "auto"

    return () => {
      document.body.style.touchAction = previous
    }
  }, [])
  const attach = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      setRoot(node.shadowRoot ?? node.attachShadow({ mode: "open" }))
    }
  }, [])

  return (
    <div
      ref={attach}
      data-tadazz-site={variant}
      style={{ display: "block", minHeight: "100vh" }}
    >
      {root &&
        createPortal(
          <>
            <style>{native}</style>
            <style>{`:where(.tadazz-site-button){padding:0;background:transparent;color:inherit;font:inherit;border:0;border-radius:0;text-align:inherit}.tadazz-site-button>div{display:contents}`}</style>
            <style>{variant === "studio" ? studio : marketing}</style>
            <div id="app">{children}</div>
          </>,
          root,
        )}
    </div>
  )
}
