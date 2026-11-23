import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { Dialog, AlertDialog, DropdownMenu, Popover, Tooltip } from "radix-ui"
import {
  PlatformScope,
  usePlatformTheme,
  useScopePortalTarget,
  type PlatformScopeProps,
} from "./scope"

const portals = {
  dialog: Dialog.Portal,
  alert: AlertDialog.Portal,
  menu: DropdownMenu.Portal,
  popover: Popover.Portal,
  tooltip: Tooltip.Portal,
}

// Radix Presence must observe the animated content, rather than its unanimated
// display:contents scope. Keep the original portal mount/ARIA/focus lifecycle.
function PortalScope({
  ref,
  ...props
}: Omit<PlatformScopeProps, "ref"> & { ref?: Ref<HTMLElement> }) {
  const attach = useCallback(
    (scope: HTMLDivElement | null) => {
      const content = scope?.querySelector<HTMLElement>("[data-state]") ?? scope

      if (typeof ref === "function") {
        ref(content)
      } else if (ref) {
        ref.current = content
      }
    },
    [ref],
  )

  return <PlatformScope {...props} ref={attach} />
}

export interface PortalProps {
  children?: ReactNode
  container?: Element | DocumentFragment | null
  forceMount?: true
  legacy?: boolean
  returnFocusTo?: string
}

/** Controlled host dialogs without a Radix Trigger retain their actual launcher. */
function ReturnFocus({ selector }: { selector: string }) {
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        const active = document.activeElement

        if (
          !active ||
          active === document.body ||
          active === document.documentElement ||
          !active.isConnected
        ) {
          document
            .querySelector<HTMLElement>(selector)
            ?.focus({ preventScroll: true })
        }
      })
    },
    [selector],
  )

  return null
}

function containsComposed(parent: Element, target: Node) {
  let node: Node | null = target

  while (node) {
    if (parent.contains(node)) {
      return true
    }

    const root = node.getRootNode()
    node = root instanceof ShadowRoot ? root.host : null
  }

  return false
}

/** Preserve the real Radix portal primitive while carrying only scoped UI CSS. */
function Portal({
  kind,
  children,
  container,
  forceMount,
  legacy = false,
  returnFocusTo,
}: PortalProps & { kind: keyof typeof portals }) {
  const theme = usePlatformTheme()
  const scopedTarget = useScopePortalTarget()
  const [fullscreen, setFullscreen] = useState<Element | null>(() =>
    typeof document === "undefined" ? null : document.fullscreenElement,
  )
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement)
    document.addEventListener("fullscreenchange", update)

    return () => document.removeEventListener("fullscreenchange", update)
  }, [])

  if (typeof document === "undefined") {
    return null
  }

  let target =
    container ??
    (theme.context === "platform.host"
      ? document.body
      : (scopedTarget ?? document.body))

  if (fullscreen && !containsComposed(fullscreen, target)) {
    target = fullscreen
  }

  const Primitive = portals[kind]

  return (
    <Primitive container={target} forceMount={forceMount}>
      <PortalScope
        {...theme}
        className={`tds-portal-scope ${legacy ? "tds-legacy-surface" : ""}`}
      >
        {returnFocusTo && <ReturnFocus selector={returnFocusTo} />}
        {children}
      </PortalScope>
    </Primitive>
  )
}

export const DialogPortal = (props: PortalProps) => (
  <Portal {...props} kind="dialog" />
)

export const AlertPortal = (props: PortalProps) => (
  <Portal {...props} kind="alert" />
)

export const MenuPortal = (props: PortalProps) => (
  <Portal {...props} kind="menu" />
)

export const PopoverPortal = (props: PortalProps) => (
  <Portal {...props} kind="popover" />
)

export const TooltipPortal = (props: PortalProps) => (
  <Portal {...props} kind="tooltip" />
)
