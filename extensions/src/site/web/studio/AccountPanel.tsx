import { SiteLink } from "../shared/SiteLink"
import { useQuery } from "@tanstack/react-query"
import type { BillingSnapshot } from "@razzia/extensions/core"
import i18n from "i18next"
import { useTranslation } from "react-i18next"
import { siteKey, siteRequest, type Account } from "../../adapters/client"
import { siteLanguages, useSiteText } from "../../locales"
import { Badge, Card, Select } from "@razzia/extensions/platform-ui"

export function AccountPanel({ account }: { account: Account }) {
  const t = useSiteText()
  const { t: upstream } = useTranslation()
  const config = useQuery({
    queryKey: siteKey(account.id, "billing-config"),
    queryFn: ({ signal }) =>
      siteRequest<{ enabled: boolean }>("/api/billing/config", { signal }),
  })
  const capacity = useQuery({
    queryKey: siteKey(account.id, "capacity"),
    queryFn: ({ signal }) =>
      siteRequest<BillingSnapshot>("/api/billing", { signal }),
    enabled: config.data?.enabled === true,
  })
  const billingEnabled = config.data?.enabled === true
  const availableCapacity =
    billingEnabled && capacity.data?.configured ? capacity.data : undefined
  const failed = config.isError || (billingEnabled && capacity.isError)
  let notice = "Billing is disabled. No purchases are available."

  if (config.isPending || (billingEnabled && capacity.isPending)) {
    notice = "Please wait…"
  } else if (failed) {
    notice = "Capacity information is unavailable."
  } else if (availableCapacity) {
    notice =
      "Billing is configured. Existing account management is available below."
  }

  return (
    <>
      <div className="pagehead">
        <h1>{t("Account & licences")}</h1>
      </div>
      <div className="site-account-grid">
        <Card className="site-account-card">
          <h2>{t("My account")}</h2>
          <p>{account.email}</p>
          <Badge tone={account.verified ? "success" : "warning"}>
            {t(account.verified ? "Email verified" : "Email unverified")}
          </Badge>
          <Select
            label={t("Language")}
            value={i18n.resolvedLanguage?.split("-")[0] ?? "en"}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            {siteLanguages.map((language) => (
              <option key={language} value={language}>
                {language.toUpperCase()}
              </option>
            ))}
          </Select>
          <SiteLink className="btn ghost" href="/forgot">
            {t("Reset password")}
          </SiteLink>
        </Card>
        <Card className="site-account-card">
          <h2>{t("Licences & capacity")}</h2>
          <p role={failed ? "alert" : "status"}>{t(notice)}</p>
          {availableCapacity &&
            availableCapacity.grants.map((grant) => (
              <article className="site-grant" key={grant.id}>
                <p>
                  {upstream("extensions:billing.remaining", {
                    games: grant.remainingGames,
                    participants: grant.participants,
                  })}
                </p>
                {grant.expiresAt && (
                  <p>
                    {new Date(grant.expiresAt).toLocaleDateString(
                      i18n.resolvedLanguage,
                    )}
                  </p>
                )}
              </article>
            ))}
          {availableCapacity && (
            <SiteLink className="btn ghost" href="/studio/legacy">
              {t("Existing account management")}
            </SiteLink>
          )}
          <p className="muted">
            {t(
              "Capacity is checked by the server when a show starts. No illustrative quota is shown.",
            )}
          </p>
        </Card>
      </div>
    </>
  )
}
