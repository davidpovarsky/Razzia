import {
  compiledPreviewManifestSchema,
  type CompiledPreviewManifest,
} from "./preview-schemas"
import { assertBoundedJson, freeze } from "./primitives"
import { canonicalJson, sha256 } from "./digest"

/** No renderer is implemented under this lease. Candidate document IDs are not executable pins. */
const compiledManifest = freeze(
  compiledPreviewManifestSchema.parse({
    portVersion: 3,
    identityRuleVersion: 2 as const,
    pins: [],
  }),
)
export function getCompiledPreviewManifest(): Readonly<CompiledPreviewManifest> {
  return compiledManifest
}
export function verifyCompiledPreviewManifest(
  input: unknown,
): Readonly<CompiledPreviewManifest> {
  assertBoundedJson(input)
  const manifest = compiledPreviewManifestSchema.parse(input)
  if (canonicalJson(manifest) !== canonicalJson(compiledManifest))
    throw new Error("show-library:unaccepted-compiled-manifest")
  return compiledManifest
}

/** Independent format catalog: validates immutability, never grants executable readiness. */
export class PreviewManifestCatalog {
  private readonly registries = new Map<string, string>()
  private readonly renderers = new Map<string, string>()
  private readonly manifestGroups = new Map<string, string>()
  register(input: unknown): Readonly<CompiledPreviewManifest> {
    assertBoundedJson(input)
    const manifest = compiledPreviewManifestSchema.parse(input)
    const groups = new Map<string, typeof manifest.pins>()
    for (const pin of manifest.pins) {
      const registry = `${pin.registry.id}@${pin.registry.version}`
      groups.set(registry, [...(groups.get(registry) ?? []), pin])
    }
    const groupDigests = new Map<string, string>()
    for (const [registry, pins] of groups) {
      const digest = sha256(
        canonicalJson(
          [...pins].sort((a, b) =>
            `${a.renderer.id}@${a.renderer.version}`.localeCompare(
              `${b.renderer.id}@${b.renderer.version}`,
            ),
          ),
        ),
      )
      if (
        this.manifestGroups.has(registry) &&
        this.manifestGroups.get(registry) !== digest
      )
        throw new Error("show-library:immutable-manifest-version")
      groupDigests.set(registry, digest)
    }
    const registries = new Map(this.registries),
      renderers = new Map(this.renderers)
    for (const pin of manifest.pins) {
      const registry = `${pin.registry.id}@${pin.registry.version}`,
        renderer = `${pin.renderer.id}@${pin.renderer.version}`
      if (
        registries.has(registry) &&
        registries.get(registry) !== pin.registrySha256
      )
        throw new Error("show-library:immutable-registry-version")
      if (
        renderers.has(renderer) &&
        renderers.get(renderer) !== pin.rendererBuildSha256
      )
        throw new Error("show-library:immutable-renderer-version")
      registries.set(registry, pin.registrySha256)
      renderers.set(renderer, pin.rendererBuildSha256)
    }
    this.registries.clear()
    this.renderers.clear()
    for (const [key, value] of registries) this.registries.set(key, value)
    for (const [key, value] of renderers) this.renderers.set(key, value)
    for (const [key, value] of groupDigests) this.manifestGroups.set(key, value)
    return freeze(manifest)
  }
  digest(input: unknown): string {
    return sha256(canonicalJson(this.register(input)))
  }
}
