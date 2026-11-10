import type { ComponentProps, ReactElement, ReactNode } from "react"
import {
  DropdownMenu,
  Popover as RadixPopover,
  Tooltip as RadixTooltip,
} from "radix-ui"
import { MenuPortal, PopoverPortal, TooltipPortal } from "./portal"
import { COMPONENT_TOKENS } from "./tokens"
import { shadowMenuEntry, shadowRovingFocus } from "./shadow-focus"
const MENU_OFFSET = Number.parseFloat(COMPONENT_TOKENS.menu.offset)
const TOOLTIP_DELAY = Number.parseFloat(COMPONENT_TOKENS.tooltip.delay)

export function Menu({
  trigger,
  children,
  open,
  onOpenChange,
}: {
  trigger: ReactElement
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <DropdownMenu.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger
        asChild
        onPointerDown={(event) => {
          // Radix suppresses default trigger focus on open. In a ShadowRoot the
          // first body-to-shadow focus can otherwise look like an outside event.
          const button = event.currentTarget
          if (
            !button.disabled &&
            event.button === 0 &&
            !event.ctrlKey &&
            button.getRootNode() instanceof ShadowRoot
          )
            button.focus({ preventScroll: true })
        }}
      >
        {trigger}
      </DropdownMenu.Trigger>
      <MenuPortal>
        <DropdownMenu.Content
          onFocusCapture={shadowMenuEntry}
          onKeyDownCapture={(event) => shadowRovingFocus(event, "menuitem")}
          align="end"
          sideOffset={MENU_OFFSET}
          className="tds-menu-surface"
          loop
        >
          {children}
        </DropdownMenu.Content>
      </MenuPortal>
    </DropdownMenu.Root>
  )
}
export function MenuItem({
  tone,
  className = "",
  ...props
}: ComponentProps<typeof DropdownMenu.Item> & { tone?: "danger" }) {
  return (
    <DropdownMenu.Item
      {...props}
      data-platform-text-value={props.textValue}
      data-tone={tone}
      className={`tds-menu-item ${className}`}
    />
  )
}
export function MenuSeparator() {
  return <DropdownMenu.Separator className="tds-menu-separator" />
}
export function MenuLabel(props: ComponentProps<typeof DropdownMenu.Label>) {
  return (
    <DropdownMenu.Label
      {...props}
      className={`tds-description ${props.className ?? ""}`}
    />
  )
}
export function SubMenu({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <DropdownMenu.Sub>
      <DropdownMenu.SubTrigger className="tds-menu-item">
        {label}
      </DropdownMenu.SubTrigger>
      <MenuPortal>
        <DropdownMenu.SubContent
          onFocusCapture={shadowMenuEntry}
          onKeyDownCapture={(event) => shadowRovingFocus(event, "menuitem")}
          className="tds-menu-surface"
          sideOffset={MENU_OFFSET}
        >
          {children}
        </DropdownMenu.SubContent>
      </MenuPortal>
    </DropdownMenu.Sub>
  )
}
export function Popover({
  trigger,
  label,
  children,
  open,
  onOpenChange,
}: {
  trigger: ReactElement
  label: string
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <PopoverPortal>
        <RadixPopover.Content
          className="tds-menu-surface"
          aria-label={label}
          sideOffset={MENU_OFFSET}
        >
          {children}
        </RadixPopover.Content>
      </PopoverPortal>
    </RadixPopover.Root>
  )
}
export function Tooltip({
  content,
  children,
}: {
  content: ReactNode
  children: ReactElement
}) {
  return (
    <RadixTooltip.Provider delayDuration={TOOLTIP_DELAY}>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
        <TooltipPortal>
          <RadixTooltip.Content
            className="tds-tooltip"
            sideOffset={MENU_OFFSET}
          >
            {content}
          </RadixTooltip.Content>
        </TooltipPortal>
      </RadixTooltip.Root>
    </RadixTooltip.Provider>
  )
}
