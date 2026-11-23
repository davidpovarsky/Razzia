import type {
  ButtonHTMLAttributes,
  ComponentType,
  PropsWithChildren,
} from "react"
import type { BillingCurrency, BillingSnapshot } from "../../core/billing"

export type BillingText = (
  key: string,
  values?: Record<string, string | number>,
) => string

export interface BillingUi {
  Button: ComponentType<
    ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "md" | "lg" }
  >
  Card: ComponentType<PropsWithChildren<{ className?: string }>>
  Select: ComponentType<{
    label: string
    value: string
    onChange: (value: string) => void
    options: Array<{ value: string; label: string }>
  }>
}

export interface BillingPanelProps {
  ui: BillingUi
  t: BillingText
  data?: BillingSnapshot
  loading: boolean
  busy: boolean
  error: string | null
  notice: string | null
  currency: BillingCurrency
  onCurrency: (currency: BillingCurrency) => void
  onCheckout: (planId: string, gameId?: string) => void
  onRefresh: () => void
  onPortal: () => void
}
