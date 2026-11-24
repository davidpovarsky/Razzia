import { validateLegalPolicies } from "./legal-policies"

/**
 * Deliberately unpublished until the owner supplies and approves the complete
 * policy bundle described in docs/extensions/plans/paddle-live-20261124.
 * Replace null with that approved public bundle; never import the draft.
 */
const approvedPolicyBundle: unknown = null

export const publishedLegalPolicies =
  validateLegalPolicies(approvedPolicyBundle).published
