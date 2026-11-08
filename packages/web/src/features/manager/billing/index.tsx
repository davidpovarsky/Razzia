import { BillingPanel } from "@razzia/extensions/editor"
import type { BillingCurrency, BillingSnapshot } from "@razzia/extensions/core"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getClientId } from "@razzia/web/lib/session"
import { billingRequest } from "./api"
import { billingUi } from "./ui"
import { openPaddleCheckout } from "./paddle-checkout"
import { checkoutRequestId } from "./checkout-intent"

export function useBillingEnabled() {
  return (
    useQuery({
      queryKey: ["billing-enabled"],
      queryFn: async () => {
        const response = await fetch("/api/billing/config", {
          cache: "no-store",
        })

        if (!response.ok) {
          return false
        }

        return ((await response.json()) as { enabled: boolean }).enabled
      },
      staleTime: 30000,
    }).data === true
  )
}

export function AccountBilling() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currency, setCurrency] = useState<BillingCurrency>("GBP")
  const [notice, setNotice] = useState<string | null>(null)
  const [pollUntil, setPollUntil] = useState(0)
  const [pendingTransactionId, setPendingTransactionId] = useState("")
  const confirmation = useQuery({
    queryKey: ["billing-checkout", getClientId(), pendingTransactionId],
    enabled: pendingTransactionId !== "",
    queryFn: ({ signal }) =>
      billingRequest<{ completed: boolean }>(
        `/checkout/${pendingTransactionId}`,
        undefined,
        signal,
      ),
    refetchInterval: (current) =>
      !current.state.data?.completed && Date.now() < pollUntil ? 2000 : false,
  })
  const checkoutConfirmed = confirmation.data?.completed === true
  const key = ["billing", getClientId()]
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      billingRequest<BillingSnapshot>("", undefined, signal),
    refetchInterval: () =>
      !checkoutConfirmed && Date.now() < pollUntil ? 2000 : false,
  })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: key })
  }
  useEffect(() => {
    if (confirmation.data?.completed) {
      void queryClient.invalidateQueries({
        queryKey: ["billing", getClientId()],
      })
    }
  }, [confirmation.data?.completed, queryClient])
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: "checkout"; planId: string; gameId?: string }
        | { type: "portal" | "refresh" },
    ) => {
      if (action.type === "portal") {
        const { url } = await billingRequest<{ url: string }>("/portal", {})
        window.location.assign(url)
      } else if (action.type === "checkout") {
        const intent = checkoutRequestId(
          getClientId(),
          action.planId,
          currency,
          action.gameId,
        )
        const checkout = await billingRequest<{
          completed: boolean
          transactionId: string
          clientToken: string
          environment: "sandbox" | "live"
        }>("/checkout", {
          planId: action.planId,
          currency,
          gameId: action.gameId,
          requestId: intent.id,
        })

        if (checkout.completed) {
          intent.clear()
          setNotice(null)
          refresh()

          return
        }

        await openPaddleCheckout(checkout, (completed) => {
          if (completed) {
            intent.clear()
            setNotice("waiting")
            setPollUntil(Date.now() + 120000)
            setPendingTransactionId(checkout.transactionId)
          }

          refresh()
        })
      } else {
        const data = await billingRequest<BillingSnapshot>("/sync", {})
        queryClient.setQueryData(key, data)
      }
    },
  })
  const error = mutation.error ?? query.error

  return (
    <BillingPanel
      ui={billingUi}
      t={(label, values) => t(`extensions:billing.${label}`, values ?? {})}
      data={query.data}
      loading={query.isPending}
      busy={mutation.isPending}
      error={error?.message ?? null}
      notice={notice === "waiting" && checkoutConfirmed ? null : notice}
      currency={currency}
      onCurrency={setCurrency}
      onRefresh={() => mutation.mutate({ type: "refresh" })}
      onPortal={() => mutation.mutate({ type: "portal" })}
      onCheckout={(planId, gameId) => {
        setNotice(null)
        mutation.mutate({ type: "checkout", planId, gameId })
      }}
    />
  )
}
