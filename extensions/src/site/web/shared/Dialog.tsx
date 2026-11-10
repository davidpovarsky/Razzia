import { SiteButton } from "./SiteButton"
import { useEffect, useRef, type ReactNode } from "react"
import { useSiteText } from "../../locales"

export function SiteDialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const t = useSiteText()
  useEffect(() => {
    const dialog = ref.current
    const previous =
      dialog?.getRootNode() instanceof ShadowRoot
        ? (dialog.getRootNode() as ShadowRoot).activeElement
        : document.activeElement
    dialog?.showModal()

    return () => {
      dialog?.close()

      if (previous instanceof HTMLElement) {
        previous.focus()
      }
    }
  }, [])

  return (
    <dialog
      className="site-dialog"
      ref={ref}
      aria-labelledby="site-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <h2 id="site-dialog-title">{title}</h2>
      {children}
      <SiteButton className="btn ghost" onClick={onClose}>
        {t("Close")}
      </SiteButton>
    </dialog>
  )
}

export function ResultDialog({
  label,
  children,
  onClose,
}: {
  label: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()

    return () => dialog?.close()
  }, [])

  return (
    <dialog
      className="site-result-dialog"
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      {children}
    </dialog>
  )
}
