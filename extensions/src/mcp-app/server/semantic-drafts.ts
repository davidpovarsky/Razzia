import type {
  SemanticAssetsInput,
  SemanticAssetsResult,
  SemanticMutationResult,
  SemanticPatchInput,
  SemanticStateInput,
  SemanticUndoInput,
} from "../contracts/semantic-edit.ts"
import type { VerifiedPrincipal } from "./dependencies.ts"

/** Actual issuer-owned atomic command/replay/CAS port; never a fallback store. */
export interface SemanticDraftPort {
  patch(
    principal: VerifiedPrincipal,
    input: SemanticPatchInput,
    mutation: { correlationId: string },
  ): Promise<SemanticMutationResult>
  undo(
    principal: VerifiedPrincipal,
    input: SemanticUndoInput,
    mutation: { correlationId: string },
  ): Promise<SemanticMutationResult>
  state(
    principal: VerifiedPrincipal,
    input: SemanticStateInput,
  ): Promise<SemanticMutationResult>
  assets(
    principal: VerifiedPrincipal,
    input: SemanticAssetsInput,
  ): Promise<SemanticAssetsResult>
}
