import { useEffect, useState, type ReactNode } from "react"
import { Dialog, AlertDialog, DropdownMenu, Popover, Tooltip } from "radix-ui"
import { PlatformScope, usePlatformTheme, useScopePortalTarget } from "./scope"

const portals = {
  dialog: Dialog.Portal,
  alert: AlertDialog.Portal,
  menu: DropdownMenu.Portal,
  popover: Popover.Portal,
  tooltip: Tooltip.Portal,
}
export interface PortalProps {
  children?: ReactNode
  container?: Element | DocumentFragment | null
  forceMount?: true
  legacy?: boolean
}

function containsComposed(parent: Element, target: Node) {
  let node: Node | null = target
  while (node) {
    if (parent.contains(node)) return true
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
  if (typeof document === "undefined") return null
  let target =
    container ??
    (theme.context === "platform.host"
      ? document.body
      : (scopedTarget ?? document.body))
  if (fullscreen && !containsComposed(fullscreen, target)) target = fullscreen
  const Primitive = portals[kind]
  return (
    <Primitive container={target} forceMount={forceMount}>
      <PlatformScope
        {...theme}
        className={`tds-portal-scope ${legacy ? "tds-legacy-surface" : ""}`}
      >
        {children}
      </PlatformScope>
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
