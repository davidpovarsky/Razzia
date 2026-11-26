import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Select } from "@razzia/extensions/platform-ui"
import {
  billingPublicCatalogSchema,
  type BillingCurrency,
  type BillingPublicCatalog,
} from "../../../core/billing"
import { useSiteText } from "../../locales"
import { SiteButton } from "../shared/SiteButton"
import { SiteLink } from "../shared/SiteLink"

type CatalogState =
  | { status: "loading" | "error" }
  | { status: "ready"; data: BillingPublicCatalog }

export function Pricing({ custom }: { custom: () => void }) {
  const t = useSiteText()
  const { i18n } = useTranslation()
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)
  const [currency, setCurrency] = useState<BillingCurrency>("GBP")

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    let active = true
    setCatalog({ status: "loading" })

    void fetch("/api/billing/catalog", {
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Catalog unavailable")
        }

        const data = billingPublicCatalogSchema.parse(await response.json())

        if (active) {
          setCatalog({ status: "ready", data })
        }
      })
      .catch(() => {
        if (active) {
          setCatalog({ status: "error" })
        }
      })
      .finally(() => clearTimeout(timeout))

    return () => {
      active = false
      clearTimeout(timeout)
      controller.abort()
    }
  }, [attempt])

  const data = catalog.status === "ready" ? catalog.data : undefined
  const selectedCurrency = data?.currencies.includes(currency)
    ? currency
    : data?.currencies[0]
  const plans = data?.plans.filter((plan) =>
    plan.prices.some((price) => price.currency === selectedCurrency),
  )
  const available = Boolean(plans?.length)
  const purchasesOpen = Boolean(data?.enabled && data.configured)
  const locale = i18n.resolvedLanguage ?? i18n.language
  const number = (value: number) => new Intl.NumberFormat(locale).format(value)

  return (
    <div className="wrap">
      <section className="page-intro">
        <h1 className="h1">{t("Choose a licence for your show.")}</h1>
        <p className="prose">
          {t(
            "Explore available licences and manage purchases in your account.",
          )}
        </p>
      </section>
      {catalog.status === "loading" && (
        <p className="prose" role="status">
          {t("Loading available licences…")}
        </p>
      )}
      {catalog.status === "error" && (
        <section
          className="compare-card"
          aria-label={t("Licence availability")}
        >
          <p className="prose" role="alert">
            {t("We could not load the available licences. Please try again.")}
          </p>
          <SiteButton
            className="btn btn-outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            {t("Try again")}
          </SiteButton>
        </section>
      )}
      {catalog.status === "ready" && !available && (
        <section
          className="compare-card"
          aria-label={t("Licence availability")}
        >
          <h2>{t("New licences are not available yet.")}</h2>
          <p className="prose">
            {t(
              "Available plans will appear here when purchases open. You can review existing licences in your account.",
            )}
          </p>
          <SiteLink className="btn btn-outline" href="/studio/account">
            {t("Account & licences")}
          </SiteLink>
        </section>
      )}
      {available && selectedCurrency && (
        <>
          {!purchasesOpen && (
            <p className="prose" role="status">
              {t("Billing is disabled. No purchases are available.")}
            </p>
          )}
          <div style={{ maxWidth: 280, marginBlockEnd: 24 }}>
            <Select
              id="site-billing-currency"
              label={t("Currency")}
              value={selectedCurrency}
              onChange={(event) =>
                setCurrency(event.target.value as BillingCurrency)
              }
            >
              {data?.currencies.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </div>
          <div className="comparison" aria-label={t("Available licences")}>
            {plans?.map((plan) => {
              const price = plan.prices.find(
                (item) => item.currency === selectedCurrency,
              )

              if (!price) {
                return null
              }

              return (
                <article
                  className="compare-card"
                  key={plan.id}
                  data-billing-plan={plan.id}
                >
                  <h2>
                    {t(
                      plan.kind === "monthly"
                        ? "Monthly subscription"
                        : "One-time licence",
                    )}
                  </h2>
                  <p className="section-title" style={{ marginBlock: 20 }}>
                    <bdi>
                      {new Intl.NumberFormat(locale, {
                        style: "currency",
                        currency: price.currency,
                      }).format(price.amountMinor / 100)}
                    </bdi>
                  </p>
                  <p className="note">
                    {t(
                      plan.kind === "monthly"
                        ? "Billed monthly"
                        : "One-time payment",
                    )}
                  </p>
                  <ul>
                    <li>
                      {t(
                        plan.kind === "monthly"
                          ? "Games per paid month"
                          : "Games per purchase",
                      )}
                      :{" "}
                      <strong>
                        <bdi>{number(plan.games)}</bdi>
                      </strong>
                    </li>
                    <li>
                      {t("Participants per game")}:{" "}
                      <strong>
                        <bdi>{number(plan.participants)}</bdi>
                      </strong>
                    </li>
                    <li>
                      {t("Phone minutes per game")}:{" "}
                      <strong>
                        <bdi>{number(plan.phoneMinutes)}</bdi>
                      </strong>
                    </li>
                  </ul>
                </article>
              )
            })}
          </div>
          {purchasesOpen && (
            <p className="note" style={{ marginBlock: 24 }}>
              {t(
                "Select and purchase a licence in your account. Final tax is shown at checkout.",
              )}
            </p>
          )}
          <SiteLink
            className={purchasesOpen ? "btn btn-primary" : "btn btn-outline"}
            href="/studio/account"
          >
            {t(
              purchasesOpen
                ? "Continue to account & licences"
                : "Account & licences",
            )}
          </SiteLink>
        </>
      )}
      <div className="full-cta" style={{ margin: "54px 0" }}>
        <h3>{t("Something one of a kind?")}</h3>
        <SiteButton className="btn btn-outline" onClick={custom}>
          {t("Explore custom shows")}
        </SiteButton>
      </div>
    </div>
  )
}
