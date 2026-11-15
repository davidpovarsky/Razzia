// HOST ONLY diagnostic byte verification; never a loader or executable catalog.
import { createHash } from "node:crypto"
import { z } from "zod"
import { canonicalJson } from "./digest"
import { freeze } from "./primitives"
import {
  compiledArtifactPathSchema,
  diagnosticCompiledRegistryV2Schema,
  nativeResourceIndexV2Schema,
  rendererArtifactIndexV2Schema,
} from "./compiled-index-schema"
import { diagnoseHostReceiptAuthority } from "./compiled-index-authority"

const rawHash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex")
const jsonBytes = (value: unknown) =>
  new TextEncoder().encode(canonicalJson(value))

/** Canonical text only. Parsed records carry no reviewed/executable brand. */
export function parseCanonicalCompiledIndex<T>(
  text: string,
  schema: z.ZodType<T>,
): T {
  if (
    typeof text !== "string" ||
    new TextEncoder().encode(text).length > 1_048_576
  )
    throw new Error("show-library:index-text-budget")
  const parsed = schema.parse(JSON.parse(text))
  if (canonicalJson(parsed) !== text)
    throw new Error("show-library:index-noncanonical")
  return parsed
}

/** Host-owned ordinary Uint8Array/Buffer evidence, not a renderer/caller JSON API.
 * Map brand, keys and iteration are hardened; byte arrays must be host snapshots.
 * No IO/URL/module execution or claim of production byte immutability is made.
 */
export function diagnoseCompiledArtifactBytes(
  artifactInput: unknown,
  resourceInput: unknown,
  evidence: ReadonlyMap<string, Uint8Array>,
  descriptorInput?: unknown,
) {
  const artifact = rendererArtifactIndexV2Schema.parse(artifactInput)
  const resources = nativeResourceIndexV2Schema.parse(resourceInput)
  // Use intrinsic Map operations: subclass getters/iterators/get cannot run.
  let entries: IterableIterator<[unknown, unknown]>
  try {
    const size = Object.getOwnPropertyDescriptor(
      Map.prototype,
      "size",
    )!.get!.call(evidence) as number
    if (size > 256) throw new Error("budget")
    entries = Map.prototype.entries.call(evidence)
  } catch {
    throw new Error("show-library:byte-evidence-budget")
  }
  const issues: string[] = [],
    expected = new Map(artifact.files.map((f) => [f.path, f]))
  const snapshot = new Map<string, Uint8Array>()
  let totalBytes = 0
  for (const [path, data] of entries) {
    // Check strings before formatting diagnostic output or invoking conversion.
    if (
      typeof path !== "string" ||
      path.length > 240 ||
      !compiledArtifactPathSchema.safeParse(path).success
    )
      throw new Error("show-library:invalid-evidence-path")
    if (
      !(data instanceof Uint8Array) ||
      (totalBytes += data.byteLength) > 100_000_000
    )
      throw new Error("show-library:byte-evidence-budget")
    if (!expected.has(path)) issues.push(`unexpected-file:${path}`)
    snapshot.set(path, data)
  }
  for (const file of artifact.files) {
    const data = snapshot.get(file.path)
    if (!data) {
      issues.push(`missing-file:${file.path}`)
      continue
    }
    if (data.byteLength !== file.bytes || rawHash(data) !== file.sha256)
      issues.push(`file-bytes-mismatch:${file.path}`)
  }
  const resourceBytes = jsonBytes(resources),
    indexedResource = expected.get(artifact.resourceIndexPath)
  if (
    !indexedResource ||
    indexedResource.bytes !== resourceBytes.byteLength ||
    indexedResource.sha256 !== rawHash(resourceBytes)
  )
    issues.push("resource-index-binding-mismatch")
  for (const resource of resources.resources) {
    const file = expected.get(resource.artifactPath)
    if (
      !file ||
      file.kind !== resource.kind ||
      file.mime !== resource.mime ||
      file.bytes !== resource.bytes ||
      file.sha256 !== resource.sha256
    )
      issues.push(`resource-file-mismatch:${resource.artifactPath}`)
    if (
      !artifact.source.files.some(
        (source) => canonicalJson(source) === canonicalJson(resource.source),
      )
    )
      issues.push(`resource-source-missing:${resource.artifactPath}`)
    for (const license of resource.licenses) {
      const file = expected.get(license.artifactPath)
      if (!file || file.kind !== "license" || file.sha256 !== license.sha256)
        issues.push(`license-file-mismatch:${license.artifactPath}`)
    }
  }
  if (descriptorInput !== undefined) {
    const descriptor = diagnosticCompiledRegistryV2Schema.parse(descriptorInput)
    if (canonicalJson(descriptor.renderer) !== canonicalJson(artifact.renderer))
      issues.push("registry-renderer-mismatch")
    if (
      descriptor.rendererBuildSha256 !== rawHash(jsonBytes(artifact)) ||
      descriptor.resourceIndexSha256 !== rawHash(resourceBytes)
    )
      issues.push("registry-index-digest-mismatch")
    if (
      artifact.files.reduce((sum, file) => sum + file.bytes, 0) >
        descriptor.budgets.maxArtifactBytes ||
      resources.resources.reduce((sum, resource) => sum + resource.bytes, 0) >
        descriptor.budgets.maxResourceBytes ||
      resources.resources.some((resource) =>
        resource.kind === "image"
          ? resource.bytes > descriptor.budgets.maxImageBytes ||
            resource.dimensions.decodedPixels >
              descriptor.budgets.maxDecodedImagePixels
          : resource.bytes > descriptor.budgets.maxFontBytes,
      )
    )
      issues.push("registry-budget-exceeded")
  }
  const authority = diagnoseHostReceiptAuthority(
    artifact,
    resources,
    descriptorInput,
  )
  return freeze({
    status: "diagnostic-only" as const,
    executableAcceptance: false as const,
    compiledPins: [] as readonly never[],
    artifactIndexSha256: rawHash(jsonBytes(artifact)),
    resourceIndexSha256: rawHash(resourceBytes),
    issues: [...new Set([...issues, ...authority.issues])].sort(),
    remainingGates: [
      "root-executable-acceptance",
      "actual-module-request-closure",
      "response-mime-decode-license-proof",
      "verified-byte-loader-export-SRI-CSP",
      "browser-lifecycle-font-editor-isolation",
    ] as const,
  })
}
