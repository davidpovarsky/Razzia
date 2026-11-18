import type { SemanticDraftPort } from "./semantic-drafts.ts"
import type { SemanticAuthoringPolicy } from "../contracts/semantic-edit.ts"
import type { MessageExtraInfo } from "@modelcontextprotocol/server"
import type { z } from "zod"
import type {
  DraftSummary,
  PreviewData,
  PreviewMeta,
} from "../contracts/schemas.ts"
import type { ToolName } from "../contracts/tools.ts"
import type { PreviewIdentityEnvelope } from "../contracts/canonical.ts"
import type { CandidatePreviewPortV2 } from "./preview-candidate-v2.ts"
import type { FullShowPreviewPortV3 } from "./full-show-frame.ts"
import type { PreviewUiResource } from "./preview-resource.ts"

export interface VerifiedPrincipal {
  issuer: string
  audience: string
  subject: string
  clientId: string
  grantId: string
  accountId: string
  scopes: readonly string[]
  expiresAt: number // Unix milliseconds, mapped by the trusted verifier.
  active: true
  accountsEnabled: true
}

export interface NormalizedDraft {
  authoredShowJson: string
  summary: DraftSummary
  locale?: string
}

export interface DraftRecord extends NormalizedDraft {
  draftId: string
  revision: number
}

export interface MutationIdentity {
  idempotencyKey: string
  inputDigest: string
  correlationId: string
}

export interface DraftSelection {
  draftId: string
  expectedRevision: number
}

// Implementations MUST use explicit account ownership and atomic CAS/key/outcome/audit.
// There is intentionally no default filesystem/global/session adapter.
export interface DraftRepository {
  create(
    principal: VerifiedPrincipal,
    draft: NormalizedDraft,
    mutation: MutationIdentity,
  ): Promise<DraftRecord>
  get(
    principal: VerifiedPrincipal,
    draftId: string,
  ): Promise<DraftRecord | undefined>
  replace(
    principal: VerifiedPrincipal,
    draftId: string,
    expectedRevision: number,
    draft: NormalizedDraft,
    mutation: MutationIdentity,
  ): Promise<DraftRecord>
}

export interface AuthoringPolicy {
  readonly semantic?: SemanticAuthoringPolicy
  trustedDefaults?: unknown
  allowedPublicAssetUrls: ReadonlySet<string>
}

export interface Catalog {
  listTemplates(
    principal: VerifiedPrincipal,
    page: { limit?: number; cursor?: string },
  ): Promise<unknown>
  listThemes(
    principal: VerifiedPrincipal,
    page: { limit?: number; cursor?: string },
  ): Promise<unknown>
}

export interface Dependencies {
  // Trusted adapter owns cryptographic token verification, grant/revocation and
  // account lookup on EVERY request. Never populate from unverified tool arguments.
  authorize?: (extra: MessageExtraInfo | undefined) => Promise<unknown>
  // Trusted issuer may bind its unforgeable raw capability to the validated
  // copy. Synchronous, after issuer/audience/expiry/scope checks; never a wire field.
  principalAccepted?: (raw: unknown, accepted: VerifiedPrincipal) => void
  // Required ingress budget, including unauthenticated/malformed tool calls.
  // Key only from trusted transport context; no model arguments are supplied.
  prevalidationLimit?: (extra: MessageExtraInfo | undefined) => Promise<boolean>
  rateLimit?: (
    principal: VerifiedPrincipal,
    tool: ToolName | undefined,
  ) => Promise<boolean>
  drafts?: DraftRepository
  semanticDrafts?: SemanticDraftPort
  authoring?: AuthoringPolicy
  catalog?: Catalog
  /** Optional data-only V2 development seam. Never an accepted V1 renderer. */
  previewCandidateV2?: CandidatePreviewPortV2
  /** G's reviewed static widget artifact + explicit host CSP/permission. */
  previewUiResource?: PreviewUiResource
  fullShowPreviewV3?: FullShowPreviewPortV3
  fullShowUiResourceV3?: PreviewUiResource
  // M2-specific projection adapter; future implementation imports accepted SB
  // exports. No SB schema/type/projection engine is duplicated here.
  preview?: {
    registryVersion: string
    // Accepted SB implementation validates canonical content/identity/compiled
    // pin/assets against its immutable manifest. Not a model-supplied assertion.
    assertAcceptedIdentity(envelope: PreviewIdentityEnvelope): void
    render(
      principal: VerifiedPrincipal,
      draft: DraftRecord,
      locale?: string,
    ): Promise<{
      data: PreviewData
      meta: PreviewMeta
      identity: PreviewIdentityEnvelope
    }>
  }
  // Authoritative atomic replay-or-new decision: recheck owner/grant/tool/key/
  // digest and return a prior authorized outcome BEFORE current-draft lookup.
  // NEW operation must read/validate canonical content+summary, exact revision and
  // consent in the same durable decision, reserve one collision-safe target and
  // reconcile crashes. Missing real adapter remains unavailable.
  storage?: {
    createNewWithConsent(
      principal: VerifiedPrincipal,
      selection: DraftSelection,
      mutation: MutationIdentity,
    ): Promise<unknown>
  }
  exports?: {
    // Same authoritative replay-or-new rules; new export validates exact draft
    // revision/content/rights. Ordinary export adds no consent requirement.
    createAuthorizedDownload(
      principal: VerifiedPrincipal,
      selection: DraftSelection,
      format: "tada-json" | "enhanced-bundle",
      mutation: MutationIdentity,
    ): Promise<unknown>
  }
}

export interface ServerConfig {
  issuer: string
  resource: string
  resourceMetadataUrl: string
  firstPartyOrigins?: readonly string[]
}

export type SchemaValue<T extends z.ZodType> = z.infer<T>
