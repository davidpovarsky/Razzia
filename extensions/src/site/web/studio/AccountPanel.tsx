import { SiteLink } from "../shared/SiteLink"
import { useQuery } from "@tanstack/react-query"
import type { BillingSnapshot } from "@razzia/extensions/core"
import i18n from "i18next"
import { useTranslation } from "react-i18next"
import { siteKey, siteRequest, type Account } from "../../adapters/client"
import { siteLanguages, useSiteText } from "../../locales"

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
  let notice = "Billing is disabled. No purchases are available."

  if (config.isPending || (config.data?.enabled && capacity.isPending)) {
    notice = "Please wait…"
  } else if (config.isError || capacity.isError) {
    notice = "Capacity information is unavailable."
  } else if (capacity.data?.configured) {
    notice =
      "Billing is configured. Existing account management is available below."
  }

  return (
    <>
      <div className="pagehead">
        <h1>{t("Account & licences")}</h1>
      </div>
      <section className="editor-panel">
        <h2>{t("My account")}</h2>
        <p>{account.email}</p>
        <p>{t(account.verified ? "Email verified" : "Email unverified")}</p>
        <label>
          {t("Language")}
          <select
            value={i18n.resolvedLanguage?.split("-")[0] ?? "en"}
            onChange={(event) => void i18n.changeLanguage(event.target.value)}
          >
            {siteLanguages.map((language) => (
              <option key={language} value={language}>
                {language.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <SiteLink className="btn ghost" href="/forgot">
          {t("Reset password")}
        </SiteLink>
      </section>
      <section className="editor-panel">
        <h2>{t("Licences & capacity")}</h2>
        <p role={config.isError || capacity.isError ? "alert" : "status"}>
          {t(notice)}
        </p>
        {capacity.data?.configured &&
          capacity.data.grants.map((grant) => (
            <article className="site-grant" key={grant.id}>
              <p>
                {upstream("extensions:billing.remaining", {
                  games: grant.remainingGames,
                  participants: grant.participants,
                })}
              </p>
              {grant.expiresAt && (
                <p>{new Date(grant.expiresAt).toLocaleDateString()}</p>
              )}
            </article>
          ))}
        {capacity.data?.configured && (
          <SiteLink className="btn ghost" href="/studio/legacy">
            {t("Existing account management")}
          </SiteLink>
        )}
        <p className="muted">
          {t(
            "Capacity is checked by the server when a show starts. No illustrative quota is shown.",
          )}
        </p>
      </section>
    </>
  )
}
