import { describe, expect, it } from "vitest"
import {
  resolveLegalPolicy,
  validateLegalPolicies,
  type LegalPolicyBundle,
} from "../web/marketing/legal-policies"
import { publishedLegalPolicies } from "../web/marketing/legal-policies.public"
import { resolveSiteMetadata } from "../web/shared/site-metadata-policy"

function approved(): LegalPolicyBundle {
  return {
    status: "approved",
    version: "test-only-1",
    effectiveDate: "2026-11-24",
    approvedAt: "2026-11-24T00:00:00Z",
    approvedBy: "Test fixture approver",
    locale: "en",
    seller: {
      name: "Test fixture seller",
      contactEmail: "support@example.invalid",
    },
    documents: {
      terms: {
        title: "Terms and conditions",
        sections: [
          {
            id: "service",
            heading: "Service",
            paragraphs: ["Approved test terms."],
          },
        ],
      },
      privacy: {
        title: "Privacy policy",
        sections: [
          {
            id: "data",
            heading: "Data",
            paragraphs: ["Approved test privacy wording."],
          },
        ],
      },
      refunds: {
        title: "Refund policy",
        sections: [
          {
            id: "requests",
            heading: "Requests",
            paragraphs: ["Approved test refund wording."],
          },
        ],
      },
    },
  }
}

describe("legal policy publication", () => {
  it("publishes the complete bundle following the owner's explicit approval", () => {
    expect(publishedLegalPolicies).not.toBeNull()
    expect(validateLegalPolicies(publishedLegalPolicies).errors).toEqual([])
    expect(publishedLegalPolicies).toMatchObject({
      status: "approved",
      version: "2026-11-27-1",
      effectiveDate: "2026-11-27",
      approvedAt: "2026-11-26T22:42:28Z",
      seller: {
        name: "Golda Sterling trading as Tadazz",
        contactEmail: "hello@tadazz.com",
      },
    })
    for (const kind of ["terms", "privacy", "refunds"] as const) {
      expect(resolveLegalPolicy(kind, publishedLegalPolicies)).toBe(kind)
    }
  })

  it("admits all three complete owner-approved documents together", () => {
    const bundle = approved()
    expect(validateLegalPolicies(bundle)).toEqual({
      published: bundle,
      errors: [],
    })
    expect(resolveLegalPolicy("terms", bundle)).toBe("terms")
    expect(resolveLegalPolicy("privacy", bundle)).toBe("privacy")
    expect(resolveLegalPolicy("refunds", bundle)).toBe("refunds")
    expect(resolveLegalPolicy("unknown", bundle)).toBeNull()
  })

  it("does not expose a partially completed or merely approved template", () => {
    const unfinished = approved()
    unfinished.documents.privacy.sections[0].paragraphs = [
      "{{retention_period}}",
    ]
    expect(validateLegalPolicies(unfinished).published).toBeNull()

    const draft = { ...approved(), status: "draft" }
    expect(validateLegalPolicies(draft).published).toBeNull()
    expect(
      validateLegalPolicies({
        ...approved(),
        documents: { terms: approved().documents.terms },
      }).published,
    ).toBeNull()
  })

  it("rejects missing approval, impossible dates and malformed nested input", () => {
    for (const input of [
      null,
      {},
      { ...approved(), approvedBy: "" },
      { ...approved(), approvedAt: "not-a-date" },
      { ...approved(), effectiveDate: "2026-02-31" },
      { ...approved(), locale: "he" },
      { ...approved(), seller: null },
      { ...approved(), documents: null },
      {
        ...approved(),
        documents: {
          ...approved().documents,
          privacy: { title: "Privacy", sections: [null] },
        },
      },
    ]) {
      expect(validateLegalPolicies(input).published).toBeNull()
    }
  })

  it("rejects contact URL injection and duplicate section anchors", () => {
    const bundle = approved()
    bundle.seller.contactEmail = "hello@example.invalid?subject=injected"
    expect(validateLegalPolicies(bundle).published).toBeNull()
    bundle.seller.contactEmail = "hello@example.invalid"
    bundle.documents.terms.sections.push({
      ...bundle.documents.terms.sections[0],
    })
    expect(validateLegalPolicies(bundle).published).toBeNull()
  })

  it("preserves existing routes while legal publication is absent", () => {
    const metadata = resolveSiteMetadata({
      pathname: "/",
      search: "?view=privacy&token=private",
      origin: "https://example.invalid",
      products: [],
      legalPolicies: null,
    })
    expect(metadata.isHome).toBe(true)
    expect(metadata.canonical).toBe("https://example.invalid/")
  })

  it("provides the approved document title and a clean canonical URL", () => {
    const metadata = resolveSiteMetadata({
      pathname: "/",
      search: "?view=privacy&token=private",
      origin: "https://example.invalid",
      products: [],
      legalPolicies: approved(),
    })
    expect(metadata.titleKey).toBe("Privacy policy")
    expect(metadata.isHome).toBe(false)
    expect(metadata.canonical).toBe("https://example.invalid/?view=privacy")
  })
})
