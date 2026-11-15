"""Keep one shared CAS implementation and explicit V1/V2 public admission classes."""
from pathlib import Path

root = Path('C:/Users/DAVID/Code/Razzia-worktrees/tadazz-hq-show-library-20261115')
folder = root / 'extensions/src/core/show-library'
path = folder / 'composition-repository.ts'
source = path.read_text()
body = source[source.index('const keySchema ='):source.index('/** Existing V1 admission/digest semantics;')]
body = body.replace('class CompositionRepositoryBase<Document>', 'export class CompositionRepositoryBase<Document>')
header = '''import { z } from "zod"
import type { CompositionDocument } from "./composition-document"
import { assertBoundedJson, digestSchema, exactRefSchema, freeze, identifierSchema } from "./primitives"

'''
base = folder / 'composition-repository-base.ts'
successor = folder / 'composition-repository-v2.ts'
assert not base.exists() and not successor.exists()
base.write_text(header + body, newline='\n')
path.write_text('''import { parseCompositionDocument, compositionDocumentDigest, type CompositionDocument } from "./composition-document"
import { CompositionRepositoryBase, type CompositionStorage } from "./composition-repository-base"
export type { CompositionDraftKey, CompositionDraftRecord, CompositionPublication, CompositionStorage } from "./composition-repository-base"
export { CompositionRepositoryV2 } from "./composition-repository-v2"

/** Existing V1 admission/digest semantics; V2 data still fails this class. */
export class CompositionRepository extends CompositionRepositoryBase<CompositionDocument> {
  constructor(storage: CompositionStorage) {
    super(storage, { parse: parseCompositionDocument, digest: compositionDocumentDigest })
  }
}
''', newline='\n')
successor.write_text('''import { parseCompositionDocumentV2, compositionDocumentV2Digest, type CompositionDocumentV2 } from "./composition-document-v2"
import { CompositionRepositoryBase, type CompositionStorage } from "./composition-repository-base"

/** Explicit V2 admission using the same atomic implementation, not another engine. */
export class CompositionRepositoryV2 extends CompositionRepositoryBase<CompositionDocumentV2> {
  constructor(storage: CompositionStorage<CompositionDocumentV2>) {
    super(storage, { parse: parseCompositionDocumentV2, digest: compositionDocumentV2Digest })
  }
}
''', newline='\n')
print('Split only owned repository files; public V1 imports preserved')
