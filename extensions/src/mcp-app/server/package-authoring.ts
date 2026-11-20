import type {
  PackageToolInput,
  PackageToolName,
} from "../contracts/package-authoring.ts"
import type { VerifiedPrincipal } from "./dependencies.ts"

/**
 * The first-party adapter owns account/workspace resolution, durable idempotency,
 * exact revisions, byte verification, isolated builds, review and save consent.
 * No model argument can supply a principal, reviewer decision or approval token.
 */
export interface PackageAuthoringPort {
  call(
    principal: VerifiedPrincipal,
    name: PackageToolName,
    input: PackageToolInput,
  ): Promise<{
    data: unknown
    /** Trusted protocol/UI metadata only; never package source or account data. */
    meta?: Record<string, unknown>
  }>
}
