import { Tabs as RadixTabs } from "radix-ui"
import type {
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react"
import { usePlatformTheme } from "./scope"
import { shadowRovingFocus } from "./shadow-focus"

export function Card({
  interactive = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLElement> & { interactive?: boolean }) {
  return (
    <section
      {...props}
      className={`tds-card ${className}`}
      data-interactive={interactive || undefined}
    />
  )
}
export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info"
export function Badge({
  tone = "neutral",
  live = false,
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: StatusTone; live?: boolean }) {
  return (
    <span
      {...props}
      className={`tds-badge ${className}`}
      data-tone={tone}
      data-platform-motion="feedback"
      role={live ? "status" : props.role}
    />
  )
}
export function Toast({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="status"
      data-platform-motion="feedback"
      {...props}
      className={`tds-toast ${className}`}
    />
  )
}
export interface StatusStateProps {
  kind: "empty" | "loading" | "error" | "success"
  title: string
  description?: string
  action?: ReactNode
}
export function StatusState({
  kind,
  title,
  description,
  action,
}: StatusStateProps) {
  return (
    <section
      className="tds-state"
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" || undefined}
      data-platform-motion="feedback"
      data-tone={
        kind === "error" ? "danger" : kind === "success" ? "success" : "neutral"
      }
    >
      {kind === "loading" && (
        <span aria-hidden="true" className="tds-spinner" />
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </section>
  )
}
export const EmptyState = (props: Omit<StatusStateProps, "kind">) => (
  <StatusState {...props} kind="empty" />
)
export const LoadingState = (props: Omit<StatusStateProps, "kind">) => (
  <StatusState {...props} kind="loading" />
)
export const ErrorState = (props: Omit<StatusStateProps, "kind">) => (
  <StatusState {...props} kind="error" />
)
export function Toolbar({
  label,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div
      {...props}
      role="group"
      aria-label={label}
      className={`tds-toolbar ${className}`}
    />
  )
}
export function ToolbarGroup({
  label,
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { label: string }) {
  return (
    <div
      {...props}
      role="group"
      aria-label={label}
      className={`tds-toolbar-group ${className}`}
    />
  )
}
export function Table({
  caption,
  children,
  ...props
}: TableHTMLAttributes<HTMLTableElement> & { caption: string }) {
  return (
    <div className="tds-table-scroll">
      <table {...props} className={`tds-table ${props.className ?? ""}`}>
        <caption>{caption}</caption>
        {children}
      </table>
    </div>
  )
}
export function TableHead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} />
}
export function TableBody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}
export function TableRow(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />
}
export function TableHeader({
  scope = "col",
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...props} scope={scope} />
}
export function TableCell(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} />
}
export interface TabItem {
  value: string
  label: string
  content: ReactNode
  disabled?: boolean
}
export function Tabs({
  items,
  label,
  value,
  defaultValue,
  onValueChange,
}: {
  items: TabItem[]
  label: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const { dir } = usePlatformTheme()
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
    >
      <RadixTabs.List
        className="tds-tabs-list"
        aria-label={label}
        onKeyDownCapture={(event) => shadowRovingFocus(event, "tab", dir)}
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            className="tds-tab"
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          className="tds-tab-panel"
          data-platform-motion="selection"
          value={item.value}
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  )
}
