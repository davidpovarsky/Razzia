export const legalPolicyKinds = ["terms", "privacy", "refunds"] as const

export type LegalPolicyKind = (typeof legalPolicyKinds)[number]

export interface LegalPolicySection {
  id: string
  heading: string
  paragraphs: string[]
  bullets?: string[]
}

export interface LegalPolicyDocument {
  title: string
  sections: LegalPolicySection[]
}

/** Only owner-approved public copy belongs in this bundle. No secrets or prices. */
export interface LegalPolicyBundle {
  status: "approved"
  version: string
  effectiveDate: string
  approvedAt: string
  approvedBy: string
  locale: "en"
  seller: {
    name: string
    address?: string
    contactEmail: string
  }
  documents: Record<LegalPolicyKind, LegalPolicyDocument>
}

const placeholder =
  /\{\{|\}\}|\b(?:TODO|TBD|PLACEHOLDER)\b|\[(?:INSERT|REPLACE)[^\]]*\]/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasApprovedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !placeholder.test(value)
  )
}

export function isLegalPolicyKind(value: string): value is LegalPolicyKind {
  return legalPolicyKinds.some((kind) => kind === value)
}

/**
 * Publish the three policies together. An incomplete/draft bundle exposes no
 * legal links or policy pages. Validation is structural; owner approval of the
 * actual legal/commercial facts is still required.
 */
export function validateLegalPolicies(value: unknown): {
  published: LegalPolicyBundle | null
  errors: string[]
} {
  const errors: string[] = []

  if (!isRecord(value)) {
    return { published: null, errors: ["No approved policy bundle"] }
  }

  if (value.status !== "approved") {
    errors.push("Policy bundle is not approved")
  }

  for (const key of ["version", "approvedBy"] as const) {
    if (!hasApprovedText(value[key])) {
      errors.push(`Missing or unfinished ${key}`)
    }
  }

  if (
    typeof value.effectiveDate !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value.effectiveDate) ||
    !Number.isFinite(Date.parse(value.effectiveDate)) ||
    new Date(value.effectiveDate).toISOString().slice(0, 10) !==
      value.effectiveDate
  ) {
    errors.push("Invalid effective date")
  }

  if (
    typeof value.approvedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/u.test(value.approvedAt) ||
    !Number.isFinite(Date.parse(value.approvedAt))
  ) {
    errors.push("Invalid approval timestamp")
  }

  // English copy is approved as a whole; it is never machine-translated.
  if (value.locale !== "en") {
    errors.push("Unsupported policy locale")
  }

  if (!isRecord(value.seller)) {
    errors.push("Missing seller details")
  } else {
    if (!hasApprovedText(value.seller.name)) {
      errors.push("Missing or unfinished seller name")
    }

    if (
      value.seller.address !== undefined &&
      !hasApprovedText(value.seller.address)
    ) {
      errors.push("Unfinished seller address")
    }

    if (
      !hasApprovedText(value.seller.contactEmail) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.seller.contactEmail) ||
      /[<>"'\r\n?&#]/u.test(value.seller.contactEmail)
    ) {
      errors.push("Invalid contact email")
    }
  }

  const { documents } = value

  if (!isRecord(documents)) {
    errors.push("Missing policy documents")
  } else {
    for (const kind of legalPolicyKinds) {
      const document = documents[kind]

      if (
        !isRecord(document) ||
        !hasApprovedText(document.title) ||
        !Array.isArray(document.sections) ||
        document.sections.length === 0
      ) {
        errors.push(`Missing or unfinished ${kind} document`)

        continue
      }

      const ids = new Set<string>()

      for (const section of document.sections) {
        if (
          !isRecord(section) ||
          typeof section.id !== "string" ||
          !/^[a-z][a-z0-9-]*$/u.test(section.id) ||
          ids.has(section.id) ||
          !hasApprovedText(section.heading) ||
          !Array.isArray(section.paragraphs) ||
          section.paragraphs.length === 0 ||
          !section.paragraphs.every(hasApprovedText) ||
          (section.bullets !== undefined &&
            (!Array.isArray(section.bullets) ||
              !section.bullets.every(hasApprovedText)))
        ) {
          errors.push(`Invalid or unfinished ${kind} section`)

          continue
        }

        ids.add(section.id)
      }
    }
  }

  return {
    published:
      errors.length === 0 ? (value as unknown as LegalPolicyBundle) : null,
    errors,
  }
}

export function resolveLegalPolicy(
  requested: string | null,
  bundle: LegalPolicyBundle | null,
): LegalPolicyKind | null {
  return requested && bundle && isLegalPolicyKind(requested) ? requested : null
}
