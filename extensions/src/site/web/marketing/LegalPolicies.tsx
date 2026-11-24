import { SiteLink } from "../shared/SiteLink"
import {
  legalPolicyKinds,
  type LegalPolicyBundle,
  type LegalPolicyKind,
} from "./legal-policies"
import policyStyles from "./legal-policies.css?inline"

export function LegalPolicyLinks({
  policies,
  current,
}: {
  policies: LegalPolicyBundle | null
  current?: LegalPolicyKind
}) {
  if (!policies) {
    return null
  }

  return (
    <nav
      className="footer-links site-policy-links"
      aria-label="Policies"
      lang="en"
      dir="ltr"
    >
      {legalPolicyKinds.map((kind) => (
        <SiteLink
          key={kind}
          href={`/?view=${kind}`}
          aria-current={current === kind ? "page" : undefined}
        >
          {policies.documents[kind].title}
        </SiteLink>
      ))}
    </nav>
  )
}

export function LegalPolicyPage({
  policies,
  kind,
}: {
  policies: LegalPolicyBundle
  kind: LegalPolicyKind
}) {
  const document = policies.documents[kind]
  const effectiveDate = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(policies.effectiveDate))

  return (
    <article
      className="section wrap site-policy"
      lang="en"
      dir="ltr"
      aria-labelledby={`legal-${kind}-title`}
      data-policy-version={policies.version}
    >
      <style>{policyStyles}</style>
      <header className="site-policy-header">
        <h1 className="h1" id={`legal-${kind}-title`}>
          {document.title}
        </h1>
        <p className="site-policy-date">
          Effective{" "}
          <time dateTime={policies.effectiveDate}>{effectiveDate}</time>
        </p>
        <address className="site-policy-seller">
          <span>{policies.seller.name}</span>
          {policies.seller.address && <span>{policies.seller.address}</span>}
          <a href={`mailto:${policies.seller.contactEmail}`}>
            {policies.seller.contactEmail}
          </a>
        </address>
      </header>
      {document.sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`legal-${kind}-${section.id}`}
        >
          <h2 id={`legal-${kind}-${section.id}`}>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.bullets && section.bullets.length > 0 && (
            <ul>
              {section.bullets.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
      <LegalPolicyLinks policies={policies} current={kind} />
    </article>
  )
}
