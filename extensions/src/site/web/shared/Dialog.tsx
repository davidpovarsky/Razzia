import { Dialog } from "@razzia/extensions/platform-ui"
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
  const t = useSiteText()

  return (
    <Dialog
      className="site-dialog"
      title={title}
      closeLabel={t("Close")}
      onClose={onClose}
    >
      {children}
    </Dialog>
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
