import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react"
import { useTranslation } from "react-i18next"
import { PresentationControls, presentationControlText } from "../../../platform-ui"
import { gameViewerCss } from "./styles"

export interface GameViewerProps {
  title: string
  status?: ReactNode
  children: ReactNode
  controls?: ReactNode
  details?: ReactNode
  open?: boolean
  modal?: boolean
  dismissOnOutside?: boolean
  busy?: boolean
  onClose?: () => void
  closeRef?: Ref<HTMLButtonElement>
}

/** A permanent dialog node keeps the same renderer, audio owner and session when expanded. */
export function GameViewer({
  title, status, children, controls, details, open = true, modal = false,
  busy = false, dismissOnOutside = true, onClose, closeRef,
}: GameViewerProps) {
  const { i18n } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const [expanded, setExpanded] = useState(false)
  const isExpanded = modal || expanded

  useLayoutEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!open) {
      if (element.open) element.close()
      setExpanded(false)
      return
    }
    const currentlyModal = element.matches(":modal")
    if (element.open && currentlyModal !== isExpanded) element.close()
    if (!element.open) {
      if (isExpanded) element.showModal()
      else element.show()
    }
  }, [open, isExpanded])

  useLayoutEffect(() => {
    const element = dialog.current
    return () => { if (element?.open) element.close() }
  }, [])

  const dismiss = () => {
    if (modal) onClose?.()
    else setExpanded(false)
  }

  return (
    <>
      <style>{gameViewerCss}</style>
      <dialog
        ref={dialog}
        className="game-viewer-dialog"
        data-expanded={isExpanded}
        data-testid="game-viewer-dialog"
        aria-label={title}
        aria-busy={busy || undefined}
        dir={i18n.dir()}
        onCancel={(event) => { event.preventDefault(); dismiss() }}
        onKeyDown={(event) => {
          if (isExpanded && event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault()
            event.stopPropagation()
            dismiss()
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget || !isExpanded || !dismissOnOutside) return
          const bounds = event.currentTarget.getBoundingClientRect()
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dismiss()
        }}
      >
        <section className="game-viewer" data-expanded={isExpanded}>
          <header className="game-viewer-header">
            <div className="game-viewer-heading">
              <h2>{title}</h2>
              {status && <div role="status">{status}</div>}
            </div>
            <PresentationControls
              expand={modal ? undefined : { expanded: isExpanded, onClick: () => setExpanded((value) => !value), testId: "game-viewer-expand" }}
              close={onClose || isExpanded ? { onClick: dismiss, ref: closeRef, testId: "game-viewer-close" } : undefined}
            />
          </header>
          <div className="game-viewer-stage">{children}</div>
          {controls && <div className="game-viewer-controls">{controls}</div>}
          {details && (
            <details className="game-viewer-details">
              <summary>{presentationControlText(i18n.resolvedLanguage ?? i18n.language ?? "en", "details")}</summary>
              <div>{details}</div>
            </details>
          )}
        </section>
      </dialog>
    </>
  )
}
