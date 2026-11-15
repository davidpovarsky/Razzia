import type { ServerContext } from "@modelcontextprotocol/server"
import type { z } from "zod"
import type {
  DraftSummary,
  PreviewData,
  PreviewMeta,
} from "../contracts/schemas.ts"
import type { ToolName } from "../contracts/tools.ts"
import type { PreviewIdentityEnvelope } from "../contracts/canonical.ts"

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
/** Implementations MUST use explicit account ownership and atomic CAS/key/outcome/audit.
 * There is intentionally no default filesystem/global/session adapter. */
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
  /** Trusted adapter owns cryptographic token verification, grant/revocation and
   * account lookup on EVERY request. Never populate from unverified tool arguments. */
  authorize?: (context: ServerContext) => Promise<unknown>
  rateLimit?: (principal: VerifiedPrincipal, tool: ToolName) => Promise<boolean>
  drafts?: DraftRepository
  authoring?: AuthoringPolicy
  catalog?: Catalog
  /** M2-specific projection adapter; future implementation imports accepted SB
   * exports. No SB schema/type/projection engine is duplicated here. */
  preview?: {
    registryVersion: string
    /** Accepted SB implementation validates canonical content/identity/compiled
     * pin/assets against its immutable manifest. Not a model-supplied assertion. */
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
  /** Sole real implementation must atomically enforce exact-revision consent,
   * durable key mapping, collision-safe create and composite crash reconciliation. */
  storage?: {
    createNewWithConsent(
      principal: VerifiedPrincipal,
      draft: DraftRecord,
      mutation: MutationIdentity,
    ): Promise<unknown>
  }
  exports?: {
    createAuthorizedDownload(
      principal: VerifiedPrincipal,
      draft: DraftRecord,
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
