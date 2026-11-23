import { billingCurrencies, type BillingCurrency } from "../../core/billing"
import type { BillingPanelProps } from "./types"
import { BillingPlanList } from "./plan-list"

export function BillingPanel(props: BillingPanelProps) {
  const { ui, t, data, loading, busy, error, notice } = props

  return (
    <section
      aria-label={t("title")}
      className="text-foreground flex min-h-0 flex-col gap-4 overflow-y-auto"
      data-testid="billing-panel"
    >
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {loading && <p role="status">{t("loading")}</p>}
      {error && (
        <p role="alert" className="text-sm">
          {t(error.replace("extensions:billing.", ""))}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {t(notice)}
        </p>
      )}
      {data && (
        <>
          {data.environment === "sandbox" && (
            <p className="bg-muted rounded-lg p-3 text-sm">{t("sandbox")}</p>
          )}
          {!data.configured && (
            <p className="text-muted-foreground text-sm">{t("notReady")}</p>
          )}
          <ui.Select
            label={t("currency")}
            value={props.currency}
            onChange={(value) => props.onCurrency(value as BillingCurrency)}
            options={billingCurrencies.map((currency) => ({
              value: currency,
              label: t(`currencies.${currency}`),
            }))}
          />
          <div className="flex flex-wrap gap-2">
            <ui.Button size="sm" onClick={props.onRefresh} disabled={busy}>
              {t("refresh")}
            </ui.Button>
            {data.hasCustomer && (
              <ui.Button size="sm" onClick={props.onPortal} disabled={busy}>
                {t("portal")}
              </ui.Button>
            )}
          </div>
          <h3 className="font-semibold">{t("allowance")}</h3>
          {data.grants.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noAllowance")}</p>
          ) : (
            data.grants.map((grant) => (
              <p className="text-sm" key={grant.id}>
                {t("remaining", {
                  games: grant.remainingGames,
                  participants: grant.participants,
                })}
                {grant.expiresAt && (
                  <> · {new Date(grant.expiresAt).toLocaleDateString()}</>
                )}
              </p>
            ))
          )}
          {data.subscriptions.map((sub) => (
            <p key={sub.id} className="text-sm">
              {t("subscription")} · {t(`status.${sub.status}`)}
              {sub.scheduledChange === "cancel" && (
                <> · {t("cancelScheduled")}</>
              )}
            </p>
          ))}
          <BillingPlanList {...props} />
          {data.games.length > 0 && (
            <>
              <h3 className="font-semibold">{t("usage")}</h3>
              <ul className="flex flex-col gap-2 text-sm">
                {data.games.map((game) => (
                  <li key={game.gameId} className="bg-muted rounded-lg p-3">
                    <p>
                      {t("game")} {game.gameId.slice(0, 8)} ·{" "}
                      {t("unique", {
                        count: game.participants,
                        limit: game.participantLimit,
                      })}
                    </p>
                    <p className="text-muted-foreground">
                      {t("phoneUsage", {
                        used: Math.ceil(game.phoneSeconds / 60),
                        limit: game.phoneMinutes,
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
