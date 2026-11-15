import {
  parseCompositionDocument,
  compositionDocumentDigest,
  type CompositionDocument,
} from "./composition-document"
import {
  CompositionRepositoryBase,
  type CompositionStorage,
} from "./composition-repository-base"

export type {
  CompositionDraftKey,
  CompositionDraftRecord,
  CompositionPublication,
  CompositionStorage,
} from "./composition-repository-base"

export { CompositionRepositoryV2 } from "./composition-repository-v2"

/** Existing V1 admission/digest semantics; V2 data still fails this class. */
export class CompositionRepository extends CompositionRepositoryBase<CompositionDocument> {
  constructor(storage: CompositionStorage) {
    super(storage, {
      parse: parseCompositionDocument,
      digest: compositionDocumentDigest,
    })
  }
}
