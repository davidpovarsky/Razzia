import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react"
import { Dialog as RadixDialog, Slot } from "radix-ui"
import { X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { IconButton } from "./button"
import { DialogPortal } from "./portal"
import { usePlatformContext, PortalContainerProvider } from "./scope"
import { trapDialogTab } from "./shadow-focus"
import { PLATFORM_MOTION } from "./tokens"

export interface DialogProps {
  title: string
  description?: string
  children: ReactNode
  trigger?: ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  closeLabel?: string
  className?: string
  "data-testid"?: string
}

export function useDialogState({
  open,
  trigger,
  onOpenChange,
  onClose,
}: Pick<DialogProps, "open" | "trigger" | "onOpenChange" | "onClose">) {
  const [internal, setInternal] = useState(!trigger)

  return {
    open: open ?? internal,
    change: (next: boolean) => {
      if (open === undefined) {
        setInternal(next)
      }

      onOpenChange?.(next)

      if (!next) {
        onClose?.()
      }
    },
  }
}

function activeElement() {
  let node = document.activeElement

  while (node?.shadowRoot?.activeElement) {
    node = node.shadowRoot.activeElement
  }

  return node instanceof HTMLElement ? node : null
}

/** Browser modal focus/inert handling is reliable inside the site's ShadowRoot. */
export function NativeDialog({
  title,
  description,
  children,
  trigger,
  className = "",
  closeLabel,
  hideClose = false,
  dismissible = true,
  dismissOnOutside = true,
  role = "dialog",
  returnFocusRef,
  ...props
}: DialogProps & {
  hideClose?: boolean
  dismissible?: boolean
  dismissOnOutside?: boolean
  role?: "dialog" | "alertdialog"
  returnFocusRef?: RefObject<HTMLElement | null>
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [portalRoot, setPortalRoot] = useState<HTMLDialogElement | null>(null)
  const attach = useCallback((node: HTMLDialogElement | null) => {
    ref.current = node
    setPortalRoot(node)
  }, [])
  const id = useId()
  const { t } = useTranslation()
  const state = useDialogState({ ...props, trigger })
  const finishClose = useCallback(() => {
    ref.current?.close()

    const target = returnFocusRef?.current ?? previousFocus.current

    if (target?.isConnected) {
      target.focus({ preventScroll: true })
    }

    previousFocus.current = null
  }, [returnFocusRef])
  useLayoutEffect(() => {
    const dialog = ref.current

    if (!dialog) {
      return
    }

    if (state.open) {
      if (!dialog.open) {
        previousFocus.current = activeElement()
        dialog.showModal()
      }

      return
    }

    if (!dialog.open) {
      return
    }

    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose()

      return
    }

    // A bounded fallback also closes when animation events are interrupted.
    const timer = setTimeout(
      finishClose,
      PLATFORM_MOTION.duration.fast * 1000 + 50,
    )

    return () => clearTimeout(timer)
  }, [state.open, finishClose])
  useLayoutEffect(() => {
    const dialog = ref.current

    return () => {
      dialog?.close()

      if (previousFocus.current?.isConnected) {
        previousFocus.current.focus({ preventScroll: true })
      }
    }
  }, [])

  return (
    <>
      {trigger && (
        <Slot.Root
          aria-haspopup="dialog"
          aria-expanded={state.open}
          onClick={(event) => {
            if (!event.defaultPrevented) {
              state.change(true)
            }
          }}
        >
          {trigger}
        </Slot.Root>
      )}
      <dialog
        ref={attach}
        role={role}
        inert={!state.open}
        data-state={state.open ? "open" : "closed"}
        className={`tds-dialog-surface ${className}`}
        data-testid={props["data-testid"]}
        aria-labelledby={`${id}-title`}
        aria-describedby={description ? `${id}-description` : undefined}
        onKeyDownCapture={(event) => {
          trapDialogTab(event)

          if (event.key !== "Escape" || !dismissible) {
            return
          }

          const menuOwnsEscape = event.nativeEvent
            .composedPath()
            .some(
              (node) =>
                node instanceof Element && node.matches(".tds-menu-surface"),
            )

          if (menuOwnsEscape) {
            return
          }

          event.preventDefault()
          event.stopPropagation()
          state.change(false)
        }}
        onAnimationEnd={(event) => {
          if (
            !state.open &&
            event.target === ref.current &&
            event.animationName === "tds-dialog-out"
          ) {
            finishClose()
          }
        }}
        onCancel={(event) => {
          event.preventDefault()
          event.stopPropagation()

          if (dismissible) {
            state.change(false)
          }
        }}
        onClick={(event) => {
          if (
            !dismissible ||
            !dismissOnOutside ||
            event.target !== ref.current
          ) {
            return
          }

          const bounds = ref.current.getBoundingClientRect()

          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          ) {
            state.change(false)
          }
        }}
      >
        {!hideClose && (
          <IconButton
            className="tds-dialog-close"
            variant="ghost"
            label={closeLabel ?? t("common:close")}
            onClick={() => state.change(false)}
          >
            <X aria-hidden="true" />
          </IconButton>
        )}
        <h2 className="tds-dialog-title" id={`${id}-title`}>
          {title}
        </h2>
        {description && (
          <p className="tds-dialog-description" id={`${id}-description`}>
            {description}
          </p>
        )}
        <PortalContainerProvider container={portalRoot}>
          <div className="tds-dialog-body">{children}</div>
        </PortalContainerProvider>
      </dialog>
    </>
  )
}

function HostDialog({
  title,
  description,
  children,
  trigger,
  closeLabel,
  className = "",
  ...props
}: DialogProps) {
  const state = useDialogState({ ...props, trigger })
  const { t } = useTranslation()

  return (
    <RadixDialog.Root open={state.open} onOpenChange={state.change}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <DialogPortal>
        <RadixDialog.Overlay className="tds-overlay" />
        <RadixDialog.Content
          className={`tds-dialog-surface ${className}`}
          data-testid={props["data-testid"]}
          {...(description ? {} : { "aria-describedby": undefined })}
        >
          <RadixDialog.Close asChild>
            <IconButton
              className="tds-dialog-close"
              variant="ghost"
              label={closeLabel ?? t("common:close")}
            >
              <X aria-hidden="true" />
            </IconButton>
          </RadixDialog.Close>
          <RadixDialog.Title className="tds-dialog-title">
            {title}
          </RadixDialog.Title>
          {description && (
            <RadixDialog.Description className="tds-dialog-description">
              {description}
            </RadixDialog.Description>
          )}
          <div className="tds-dialog-body">{children}</div>
        </RadixDialog.Content>
      </DialogPortal>
    </RadixDialog.Root>
  )
}

export function Dialog(props: DialogProps) {
  const context = usePlatformContext()

  return context === "platform.host" ? (
    <HostDialog {...props} />
  ) : (
    <NativeDialog {...props} />
  )
}
