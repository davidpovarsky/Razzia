import { createFileRoute, redirect } from "@tanstack/react-router"
import { SESSION_ROLES } from "@razzia/common/constants"
import { getRole } from "@razzia/web/lib/session"
import { AccountCheckoutPage } from "@razzia/web/features/manager/billing/checkout-page"

export const Route = createFileRoute("/manager/checkout")({
  beforeLoad: () => {
    if (getRole() !== SESSION_ROLES.MANAGER) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack redirect is the documented route control signal.
      throw redirect({ to: "/manager" })
    }
  },
  validateSearch: (search: Record<string, unknown>) => ({
    _ptxn: typeof search._ptxn === "string" ? search._ptxn : "",
  }),
  component: () => (
    <AccountCheckoutPage transactionId={Route.useSearch()._ptxn} />
  ),
})
