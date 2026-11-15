import {
  parseCompositionDocumentV2,
  compositionDocumentV2Digest,
  type CompositionDocumentV2,
} from "./composition-document-v2"
import {
  CompositionRepositoryBase,
  type CompositionStorage,
} from "./composition-repository-base"

/** Explicit V2 admission using the same atomic implementation, not another engine. */
export class CompositionRepositoryV2 extends CompositionRepositoryBase<CompositionDocumentV2> {
  constructor(storage: CompositionStorage<CompositionDocumentV2>) {
    super(storage, {
      parse: parseCompositionDocumentV2,
      digest: compositionDocumentV2Digest,
    })
  }
}
