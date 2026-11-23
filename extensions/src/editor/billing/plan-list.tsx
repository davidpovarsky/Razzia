import { useState } from "react"
import type { BillingPanelProps } from "./types"

export function BillingPlanList(props: BillingPanelProps) {
  const { ui, t, data, currency, busy, onCheckout } = props
  const [gameId, setGameId] = useState("")

  if (!data) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      {data.plans.map((plan) => {
        const price = plan.prices.find((p) => p.currency === currency)
        const upgrade = plan.kind === "upgrade"

        return (
          <ui.Card
            className="border-accent max-w-none gap-2 border shadow-none"
            key={plan.id}
          >
            <h3 className="text-base font-semibold">
              {t(`kind.${plan.kind}`)}
            </h3>
            <p className="text-sm">
              {t("planDetails", {
                participants: plan.participants,
                games: plan.games,
              })}
            </p>
            {plan.phoneMinutes > 0 && (
              <p className="text-muted-foreground text-sm">
                {t("includedMinutes", { count: plan.phoneMinutes })}
              </p>
            )}
            {upgrade && (
              <ui.Select
                label={t("chooseGame")}
                value={gameId}
                onChange={setGameId}
                options={data.games.map((game) => ({
                  value: game.gameId,
                  label: `${t("game")} ${game.gameId.slice(0, 8)}`,
                }))}
              />
            )}
            <ui.Button
              size="sm"
              disabled={
                busy || !price || !data.configured || (upgrade && !gameId)
              }
              onClick={() => onCheckout(plan.id, upgrade ? gameId : undefined)}
            >
              {price
                ? `${t("buy")} · ${new Intl.NumberFormat(undefined, { style: "currency", currency }).format(price.amountMinor / 100)}`
                : t("currencyUnavailable")}
            </ui.Button>
          </ui.Card>
        )
      })}
      {data.plans.length === 0 && (
        <p className="text-muted-foreground text-sm">{t("noPlans")}</p>
      )}
      <p className="text-muted-foreground text-xs">{t("taxNote")}</p>
    </div>
  )
}
