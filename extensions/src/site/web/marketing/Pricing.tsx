import { useState } from "react"
import { useSiteText } from "../../locales"
import { SiteButton } from "../shared/SiteButton"

// Reference comparison and estimator layout. No prototype prices, checkout
// simulation or claims that the illustrative tiers are purchased entitlements.
export function Pricing({ custom }: { custom: () => void }) {
  const t = useSiteText()
  const [capacity, setCapacity] = useState("50")

  return (
    <div className="wrap">
      <section className="page-intro">
        <h1 className="h1">
          {t("Pay for the show.")}
          <br />
          <span className="accent">{t("Not the subscription.")}</span>
        </h1>
        <p className="prose">
          {t(
            "Event licences and capacity pricing are not connected in this preview. No payment is taken.",
          )}
        </p>
      </section>
      <div className="comparison">
        {["Standard", "Pro"].map((tier, index) => (
          <article className={`compare-card ${index ? "pro" : ""}`} key={tier}>
            <h3>{tier}</h3>
            <p className="prose small">
              {t(index ? "Make it yours" : "Ready to play")}
            </p>
            <p className="note">
              {t(
                "Illustrative plans. Final pricing and entitlements are not confirmed.",
              )}
            </p>
            <ul>
              <li>{t("Create game")}</li>
              <li>{t("Edit game")}</li>
              <li>{t("Prepare show")}</li>
            </ul>
            <SiteButton
              className={index ? "btn btn-primary" : "btn btn-outline"}
              disabled
            >
              {t("Purchases unavailable")}
            </SiteButton>
          </article>
        ))}
      </div>
      <h2 className="section-title">{t("Your event. Your capacity.")}</h2>
      <div className="price-estimator" style={{ marginTop: 25 }}>
        <div className="estimator-group">
          <label htmlFor="site-capacity">
            {t("Voting participants / teams")}
          </label>
          <select
            id="site-capacity"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          >
            {[50, 100, 200, 500].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>
        <div className="estimator-group">
          <label htmlFor="site-tier">{t("Experience")}</label>
          <select id="site-tier">
            <option>Standard</option>
            <option>Pro</option>
          </select>
        </div>
        <div>
          <strong style={{ color: "var(--lime)" }}>—</strong>
          <p className="tiny">
            {t(
              "Capacity selection is illustrative and does not reserve a licence.",
            )}
          </p>
        </div>
        <a className="btn btn-outline" href="/studio/account">
          {t("Account & licences")}
        </a>
      </div>
      <div className="full-cta" style={{ margin: "54px 0" }}>
        <h3>{t("Something one of a kind?")}</h3>
        <SiteButton className="btn btn-outline" onClick={custom}>
          {t("Explore custom shows")}
        </SiteButton>
      </div>
    </div>
  )
}
