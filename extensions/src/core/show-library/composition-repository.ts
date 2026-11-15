import { z } from "zod"
import {
  parseCompositionDocument,
  compositionDocumentDigest,
  type CompositionDocument,
} from "./composition-document"
import {
  assertBoundedJson,
  digestSchema,
  exactRefSchema,
  freeze,
  identifierSchema,
} from "./primitives"

const keySchema = z.strictObject({
  tenantId: identifierSchema,
  draftId: identifierSchema,
})
const revisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)
export type CompositionDraftKey = z.infer<typeof keySchema>
export interface CompositionDraftRecord {
  readonly key: CompositionDraftKey
  readonly revision: number
  readonly document: Readonly<CompositionDocument>
  readonly documentSha256: string
}
export interface CompositionPublication {
  readonly format: "tadazz-composition-version"
  readonly schemaVersion: 1
  readonly runtimeAcceptance: "not-evaluated"
  readonly key: CompositionDraftKey
  readonly version: string
  readonly draftRevision: number
  readonly document: Readonly<CompositionDocument>
  readonly documentSha256: string
}

/** Trusted host storage seam. Implementations MUST perform each write atomically.
 * Caller authentication/authorization precedes constructing a tenant key.
 * This interface grants neither runtime execution nor active-room pin mutation.
 */
export interface CompositionStorage {
  readDraft(key: CompositionDraftKey): Promise<CompositionDraftRecord | null>
  compareAndSwapDraft(
    key: CompositionDraftKey,
    expectedRevision: number | null,
    next: CompositionDraftRecord,
  ): Promise<boolean>
  readVersion(
    key: CompositionDraftKey,
    version: string,
  ): Promise<CompositionPublication | null>
  publishIfRevision(
    key: CompositionDraftKey,
    expectedRevision: number,
    publication: CompositionPublication,
  ): Promise<"stored" | "revision-conflict" | "version-exists">
}

function key(input: CompositionDraftKey) {
  assertBoundedJson(input)
  return freeze(keySchema.parse(input))
}

function draft(
  input: CompositionDraftRecord,
  expectedKey: CompositionDraftKey,
) {
  assertBoundedJson(input)
  if (
    Object.keys(input).some(
      (name) =>
        !["key", "revision", "document", "documentSha256"].includes(name),
    )
  )
    throw new Error("show-library:invalid-draft-record")
  const recordKey = key(input.key)
  if (
    recordKey.tenantId !== expectedKey.tenantId ||
    recordKey.draftId !== expectedKey.draftId
  )
    throw new Error("show-library:foreign-draft-record")
  const document = parseCompositionDocument(input.document)
  const digest = digestSchema.parse(input.documentSha256)
  if (digest !== compositionDocumentDigest(document))
    throw new Error("show-library:draft-digest-mismatch")
  return freeze({
    key: recordKey,
    revision: revisionSchema.parse(input.revision),
    document,
    documentSha256: digest,
  })
}

/** Persists through an injected existing storage owner; no filesystem, lock or clock. */
export class CompositionRepository {
  constructor(private readonly storage: CompositionStorage) {}

  async read(
    input: CompositionDraftKey,
  ): Promise<CompositionDraftRecord | null> {
    const requested = key(input)
    const found = await this.storage.readDraft(requested)
    return found === null ? null : draft(found, requested)
  }

  async save(
    input: CompositionDraftKey,
    expectedRevision: number | null,
    documentInput: unknown,
  ): Promise<CompositionDraftRecord> {
    const requested = key(input)
    if (expectedRevision !== null) revisionSchema.parse(expectedRevision)
    const revision = (expectedRevision ?? 0) + 1
    revisionSchema.parse(revision)
    const document = parseCompositionDocument(documentInput)
    const next = freeze({
      key: requested,
      revision,
      document,
      documentSha256: compositionDocumentDigest(document),
    })
    if (
      !(await this.storage.compareAndSwapDraft(
        requested,
        expectedRevision,
        next,
      ))
    )
      throw new Error("show-library:draft-revision-conflict")
    return next
  }

  async duplicate(
    source: CompositionDraftKey,
    target: CompositionDraftKey,
    expectedRevision: number,
  ): Promise<CompositionDraftRecord> {
    const from = key(source),
      to = key(target)
    if (from.tenantId !== to.tenantId || from.draftId === to.draftId)
      throw new Error("show-library:invalid-draft-copy")
    revisionSchema.parse(expectedRevision)
    const original = await this.read(from)
    if (!original || original.revision !== expectedRevision)
      throw new Error("show-library:draft-revision-conflict")
    return this.save(to, null, original.document)
  }

  async publish(
    input: CompositionDraftKey,
    expectedRevision: number,
    version: string,
  ): Promise<CompositionPublication> {
    const requested = key(input)
    revisionSchema.parse(expectedRevision)
    exactRefSchema.shape.version.parse(version)
    const current = await this.read(requested)
    if (!current || current.revision !== expectedRevision)
      throw new Error("show-library:draft-revision-conflict")
    const publication = freeze({
      format: "tadazz-composition-version" as const,
      schemaVersion: 1 as const,
      runtimeAcceptance: "not-evaluated" as const,
      key: requested,
      version,
      draftRevision: current.revision,
      document: current.document,
      documentSha256: current.documentSha256,
    })
    const result = await this.storage.publishIfRevision(
      requested,
      expectedRevision,
      publication,
    )
    if (result !== "stored") throw new Error(`show-library:${result}`)
    return publication
  }

  async version(
    input: CompositionDraftKey,
    version: string,
  ): Promise<CompositionPublication | null> {
    const requested = key(input)
    exactRefSchema.shape.version.parse(version)
    const found = await this.storage.readVersion(requested, version)
    if (found === null) return null
    assertBoundedJson(found)
    if (
      found.format !== "tadazz-composition-version" ||
      found.schemaVersion !== 1 ||
      found.runtimeAcceptance !== "not-evaluated" ||
      found.version !== version ||
      Object.keys(found).some(
        (name) =>
          ![
            "format",
            "schemaVersion",
            "runtimeAcceptance",
            "key",
            "version",
            "draftRevision",
            "document",
            "documentSha256",
          ].includes(name),
      )
    )
      throw new Error("show-library:invalid-publication")
    const checked = draft(
      {
        key: found.key,
        revision: found.draftRevision,
        document: found.document,
        documentSha256: found.documentSha256,
      },
      requested,
    )
    return freeze({ ...found, key: checked.key, document: checked.document })
  }
}
