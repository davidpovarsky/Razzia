import { canonicalJsonStringify, sha256Hex } from "../../core/digest.ts"

export function finiteJson(
  value: unknown,
  depth = 0,
  seen = new Set<object>(),
): void {
  if (depth > 40) throw new Error("JSON depth limit")
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (!value || typeof value !== "object" || seen.has(value))
    throw new Error("Not finite JSON")
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Not plain JSON")
  seen.add(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      if (!Object.hasOwn(value, i)) throw new Error("Sparse JSON array")
    }
  }
  for (const [key, child] of Object.entries(value)) {
    if (["__proto__", "prototype", "constructor"].includes(key))
      throw new Error("Unsafe JSON key")
    finiteJson(child, depth + 1, seen)
  }
  seen.delete(value)
}
export function canonicalJson(value: unknown): string {
  finiteJson(value)
  return canonicalJsonStringify(value)
}
export const hashJson = (value: unknown) => sha256Hex(canonicalJson(value))
export const utf8Bytes = (value: string) =>
  new TextEncoder().encode(value).byteLength

/** SB owns validation/identity/pin types; these are only M2's adopted JSON envelope fields. */
export interface PreviewIdentityEnvelope {
  version: 1
  draftId: string
  revision: number
  normalizedAuthoredContent: unknown
  identityMap: unknown
  compiledPin: unknown
  assetDigests: readonly Readonly<{ assetId: string; sha256: string }>[]
}

/** Host-only successor. Never accepted by the version-1 MCP Preview port. */
export interface CompositionPreviewIdentityEnvelopeV2 {
  version: 2
  draftId: string
  revision: number
  compositionPreviewContent: unknown
  previewContext: unknown
  assetDigests: readonly Readonly<{ assetId: string; sha256: string }>[]
}
export type PreviewIdentityDigestInput =
  | PreviewIdentityEnvelope
  | CompositionPreviewIdentityEnvelopeV2

export function serializePreviewIdentity(
  input: PreviewIdentityDigestInput,
): string {
  if (input.version !== 1 && input.version !== 2)
    throw new Error("Unsupported preview identity version")
  const ids = new Set<string>()
  for (const asset of input.assetDigests) {
    const key = input.version === 1
      ? asset.assetId
      : JSON.stringify([asset.assetId, asset.sha256])
    if (ids.has(key) || !/^[a-f0-9]{64}$/u.test(asset.sha256)) {
      throw new Error("Invalid or duplicate asset digest")
    }
    ids.add(key)
  }
  const assetDigests = [...input.assetDigests].sort((a, b) => {
    if (a.assetId !== b.assetId) return a.assetId < b.assetId ? -1 : 1
    return a.sha256 < b.sha256 ? -1 : a.sha256 > b.sha256 ? 1 : 0
  })
  if (input.version === 2) {
    return canonicalJson({
      version: input.version,
      draftId: input.draftId,
      revision: input.revision,
      compositionPreviewContent: input.compositionPreviewContent,
      previewContext: input.previewContext,
      assetDigests,
    })
  }
  return canonicalJson({
    version: input.version,
    draftId: input.draftId,
    revision: input.revision,
    normalizedAuthoredContent: input.normalizedAuthoredContent,
    identityMap: input.identityMap,
    compiledPin: input.compiledPin,
    assetDigests,
  })
}
export const previewIdentityDigest = (input: PreviewIdentityDigestInput) =>
  sha256Hex(serializePreviewIdentity(input))
